import { readFileSync } from 'node:fs'
import { parse } from 'dotenv'

const REQUIRED = ['DATABASE_URL', 'DATABASE_URL_DIRECT', 'BETTER_AUTH_SECRET', 'EMAIL_FROM', 'GMAIL_APP_PASSWORD']
const REMOTE_KEYS = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'EMAIL_FROM', 'GMAIL_APP_PASSWORD']

function databaseEndpoint(value, label, pooled) {
  let url
  try { url = new URL(value) }
  catch { throw new Error(`${label}: URL de banco inválida.`) }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !url.hostname.endsWith('.neon.tech') || !url.pathname.slice(1)
    || !url.username || !url.password || url.searchParams.get('sslmode') !== 'require') {
    throw new Error(`${label}: use uma conexão Neon com credenciais, banco e sslmode=require.`)
  }
  const isPooled = url.hostname.split('.')[0].endsWith('-pooler')
  if (isPooled !== pooled) throw new Error(`${label}: endpoint ${pooled ? 'pooled' : 'direto'} obrigatório.`)
  return `${url.hostname.replace(/-pooler(?=\.)/, '')}:${url.port || '5432'}${url.pathname}`
}

export function validateDeploymentConfig(production, preview) {
  const endpoints = []
  for (const [name, values] of [['Production', production], ['Preview', preview]]) {
    for (const key of REQUIRED) {
      if (!values[key]?.trim()) throw new Error(`${name}: ${key} não configurada.`)
    }
    if (values.NODE_ENV) throw new Error(`${name}: não configure NODE_ENV na Vercel.`)
    if (Buffer.byteLength(values.BETTER_AUTH_SECRET) < 32
      || /your_32|change.?me|placeholder/i.test(values.BETTER_AUTH_SECRET)) {
      throw new Error(`${name}: BETTER_AUTH_SECRET deve conter pelo menos 32 bytes e não ser um placeholder.`)
    }
    const pooled = databaseEndpoint(values.DATABASE_URL, `${name}/DATABASE_URL`, true)
    const direct = databaseEndpoint(values.DATABASE_URL_DIRECT, `${name}/DATABASE_URL_DIRECT`, false)
    if (pooled !== direct) throw new Error(`${name}: conexões pooled e direta devem apontar ao mesmo endpoint e banco.`)
    endpoints.push(new URL(values.DATABASE_URL).hostname.replace(/-pooler(?=\.)/, ''))
  }
  if (endpoints[0] === endpoints[1]) throw new Error('Production e Preview precisam de bancos Neon isolados.')
  if (production.BETTER_AUTH_SECRET === preview.BETTER_AUTH_SECRET) {
    throw new Error('Production e Preview precisam de BETTER_AUTH_SECRET distintos.')
  }
  let origin
  try { origin = new URL(production.BETTER_AUTH_URL) }
  catch { throw new Error('Production: BETTER_AUTH_URL inválida.') }
  if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.vercel.app')
    || origin.username || origin.password || origin.port
    || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Production: BETTER_AUTH_URL deve ser a origem HTTPS canônica do projeto na Vercel.')
  }
  const remote = values => Object.fromEntries(REMOTE_KEYS.map(key => [key, values[key]]))
  return {
    production: { ...remote(production), BETTER_AUTH_URL: origin.origin },
    // Preview resolves the deployment/branch URLs from Vercel's system variables.
    preview: remote(preview),
    productionDirectUrl: production.DATABASE_URL_DIRECT,
    previewDirectUrl: preview.DATABASE_URL_DIRECT,
  }
}

export function loadDeploymentConfig(productionPath, previewPath) {
  const read = (file, label) => {
    try { return parse(readFileSync(file, 'utf8')) }
    catch { throw new Error(`${label}: arquivo de ambiente não encontrado ou ilegível.`) }
  }
  return validateDeploymentConfig(read(productionPath, 'Production'), read(previewPath, 'Preview'))
}
