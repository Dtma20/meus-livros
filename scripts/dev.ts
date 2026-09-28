import 'dotenv/config'
import { spawn, spawnSync } from 'node:child_process'
import postgres from 'postgres'
import { seedGenres } from './seed-genres'

const DEFAULT_LOCAL_DB = 'postgresql://postgres:postgres@localhost:5432/meus_livros'
const dbUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL || DEFAULT_LOCAL_DB

function isLocalDb(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1')
}

function isDockerRunning(): boolean {
  try {
    const res = spawnSync('docker', ['info'], { stdio: 'ignore', shell: true })
    return res.status === 0
  } catch {
    return false
  }
}

function startDockerDesktop(): void {
  if (process.platform === 'win32') {
    console.log('Iniciando Docker Desktop no Windows...')
    try {
      spawn('cmd.exe', ['/c', 'start', '""', 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe'], {
        detached: true,
        stdio: 'ignore',
      }).unref()
    } catch {
    }
  }
}

async function ensureDockerAndDb(): Promise<void> {
  let dockerReady = isDockerRunning()
  if (!dockerReady) {
    startDockerDesktop()
    process.stdout.write('Aguardando Docker Desktop inicializar')
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      process.stdout.write('.')
      dockerReady = isDockerRunning()
      if (dockerReady) {
        console.log('\nDocker Desktop pronto.')
        break
      }
    }
    if (!dockerReady) {
      console.warn('\nNao foi possivel conectar ao Docker. Certifique-se de que o Docker Desktop esta aberto.')
      return
    }
  }

  console.log('Verificando container PostgreSQL (docker compose up -d)...')
  spawnSync('docker', ['compose', 'up', '-d'], { stdio: 'inherit', shell: true })
}

async function waitForPostgres(url: string, timeoutSec = 20): Promise<boolean> {
  process.stdout.write('Aguardando PostgreSQL aceitar conexoes')
  const start = Date.now()
  while (Date.now() - start < timeoutSec * 1000) {
    try {
      const sql = postgres(url, { connect_timeout: 2, max: 1 })
      await sql`SELECT 1`
      await sql.end()
      console.log('\nPostgreSQL conectado e pronto.')
      return true
    } catch {
      process.stdout.write('.')
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  console.warn('\nTempo limite excedido ao conectar ao PostgreSQL.')
  return false
}

async function runMigrations(): Promise<void> {
  console.log('Verificando/aplicando migracoes (drizzle-kit migrate)...')
  const res = spawnSync('npx', ['drizzle-kit', 'migrate'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      DATABASE_URL_DIRECT: dbUrl,
    },
  })
  if (res.status !== 0) {
    throw new Error('Falha ao aplicar migracoes.')
  }
}

async function runSeed(): Promise<void> {
  try {
    await seedGenres()
    console.log('Generos verificados no banco.')
  } catch (err) {
    console.warn('Aviso ao verificar seed de generos:', err)
  }
}

function startNuxtDev(): void {
  console.log('Iniciando Nuxt em modo de desenvolvimento...\n')
  const nuxt = spawn('npx', ['nuxt', 'dev'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || DEFAULT_LOCAL_DB,
      DATABASE_URL_DIRECT: process.env.DATABASE_URL_DIRECT || DEFAULT_LOCAL_DB,
    },
  })

  nuxt.on('exit', (code) => {
    process.exit(code ?? 0)
  })

  const shutdown = () => {
    nuxt.kill('SIGINT')
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

async function main() {
  console.log('=============================================')
  console.log('Meus Livros - Ambiente de Desenvolvimento')
  console.log('=============================================\n')

  if (isLocalDb(dbUrl)) {
    await ensureDockerAndDb()
    const ready = await waitForPostgres(dbUrl)
    if (ready) {
      await runMigrations()
      await runSeed()
    }
  } else {
    console.log(`Usando banco remoto: ${dbUrl.replace(/:[^:@]+@/, ':***@')}`)
  }

  startNuxtDev()
}

main().catch((err) => {
  console.error('Erro ao iniciar ambiente de desenvolvimento:', err)
  process.exit(1)
})
