#requires -Version 7.4
# Credenciais ficam em .env.production e .env.preview (ambos gitignored).
# Requer login prévio da CLI Vercel; nunca publica antes de migrar os bancos.
[CmdletBinding()]
param(
  [string]$ProductionEnvFile = '.env.production',
  [string]$PreviewEnvFile = '.env.preview',
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = Split-Path -Parent $PSScriptRoot
$previousDirectory = Get-Location
$environmentKeys = @('DATABASE_URL', 'DATABASE_URL_DIRECT', 'VERCEL_TELEMETRY_DISABLED')
$previousEnvironment = @{}
foreach ($key in $environmentKeys) {
  $previousEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}

function Invoke-Vercel {
  & npx --yes vercel@63.1.2 @args
  if ($LASTEXITCODE -ne 0) { throw "A operação Vercel '$($args[0])' falhou. Nenhum sucesso foi confirmado." }
}

function Set-VercelEnvironment([hashtable]$Values, [string]$Target) {
  foreach ($key in $Values.Keys) {
    # Segredos passam por stdin, nunca pela linha de comando ou pelo log.
    $Values[$key] | & npx --yes vercel@63.1.2 env add $key $Target --force --yes --sensitive *> $null
    if ($LASTEXITCODE -ne 0) { throw "Falha ao configurar $key em $Target." }
  }
}

function Initialize-Database([string]$PooledUrl, [string]$DirectUrl, [string]$Label) {
  $env:DATABASE_URL = $PooledUrl
  $env:DATABASE_URL_DIRECT = $DirectUrl
  Write-Host "Migrando e semeando $Label antes do deploy..."
  & npm run db:migrate
  if ($LASTEXITCODE -ne 0) { throw "Migração de $Label falhou; deploy interrompido." }
  & npx tsx scripts/seed-genres.ts
  if ($LASTEXITCODE -ne 0) { throw "Seed de $Label falhou; deploy interrompido." }
}

try {
  Set-Location -LiteralPath $projectRoot
  $env:VERCEL_TELEMETRY_DISABLED = '1'
  $projectName = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).name
  if ($projectName -ne 'livrolas') { throw 'O script só opera sobre o projeto livrolas.' }
  # JSON é capturado em memória. Não imprimir este objeto: contém credenciais.
  $configJson = & node --input-type=module -e 'import {loadDeploymentConfig} from "./scripts/deploy-config.mjs"; try { process.stdout.write(JSON.stringify(loadDeploymentConfig(process.argv[1], process.argv[2]))) } catch (error) { console.error(error.message); process.exit(1) }' $ProductionEnvFile $PreviewEnvFile
  if ($LASTEXITCODE -ne 0) { throw 'Configuração de deploy inválida; nenhum recurso remoto foi alterado.' }
  $config = $configJson | ConvertFrom-Json -AsHashtable
  if ($CheckOnly) {
    Write-Host 'Preflight OK: livrolas; Production/Preview isolados; URLs diretas apenas locais.'
    return
  }

  Invoke-Vercel whoami
  Invoke-Vercel link --yes --project $projectName
  $projectLink = Get-Content -LiteralPath '.vercel/project.json' -Raw | ConvertFrom-Json
  if ($projectLink.projectName -ne $projectName) { throw 'Projeto Vercel vinculado difere de livrolas.' }

  Initialize-Database $config.production.DATABASE_URL $config.productionDirectUrl 'Production'
  Initialize-Database $config.preview.DATABASE_URL $config.previewDirectUrl 'Preview'
  Set-VercelEnvironment $config.production 'production'
  Set-VercelEnvironment $config.preview 'preview'

  $projectId = $projectLink.projectId
  $teamId = $projectLink.orgId
  $remoteEnv = Invoke-Vercel api "/v9/projects/$projectId/env?teamId=$teamId" --raw | ConvertFrom-Json
  $forbidden = @($remoteEnv.envs | Where-Object { $_.key -in @('DATABASE_URL_DIRECT', 'DATABASE_URL_UNPOOLED', 'NODE_ENV') })
  if ($forbidden.Count) { throw 'Há variável direta de banco ou NODE_ENV na Vercel. Remova-a antes de publicar.' }

  $gitRemote = & git remote get-url origin
  if ($LASTEXITCODE -ne 0) { throw 'Repositório origin ausente.' }
  Invoke-Vercel git connect $gitRemote --yes
  $remoteProject = Invoke-Vercel api "/v9/projects/$projectId?teamId=$teamId" --raw | ConvertFrom-Json
  if (-not $remoteProject.link -or $remoteProject.link.productionBranch -ne 'main') {
    throw 'O repositório precisa estar conectado com productionBranch=main antes do deploy.'
  }

  Invoke-Vercel deploy --yes --prod --logs
  $productionUrl = $config.production.BETTER_AUTH_URL
  $response = Invoke-WebRequest -Uri $productionUrl -MaximumRedirection 0
  if ($response.StatusCode -ne 200 -or -not $response.Content.Contains('Livrolas')) {
    throw 'O domínio canônico não serve o Livrolas; deploy ainda não validado.'
  }
  if (-not $response.Headers.ContainsKey('Content-Security-Policy')) { throw 'CSP ausente em produção.' }
  Write-Host "Deploy de produção responde com HTTPS e CSP: $productionUrl"
  Write-Host 'Região da função, escrita isolada em Preview e testes em aparelhos reais ainda exigem verificação no deploy.'
}
finally {
  foreach ($key in $environmentKeys) {
    [Environment]::SetEnvironmentVariable($key, $previousEnvironment[$key], 'Process')
  }
  Set-Location -LiteralPath $previousDirectory
}
