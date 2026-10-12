import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadDeploymentConfig, validateDeploymentConfig } from '../../scripts/deploy-config.mjs'

function environments() {
  return {
    production: {
      DATABASE_URL: 'postgresql://test:test@ep-prod-pooler.sa-east-1.aws.neon.tech/livrolas?sslmode=require',
      DATABASE_URL_DIRECT: 'postgresql://test:test@ep-prod.sa-east-1.aws.neon.tech/livrolas?sslmode=require',
      BETTER_AUTH_SECRET: 'production-test-secret-with-at-least-32-bytes',
      BETTER_AUTH_URL: 'https://livrolas.vercel.app',
      EMAIL_FROM: 'test@example.invalid',
      GMAIL_APP_PASSWORD: 'test-only-password',
    },
    preview: {
      DATABASE_URL: 'postgresql://test:test@ep-preview-pooler.sa-east-1.aws.neon.tech/livrolas?sslmode=require',
      DATABASE_URL_DIRECT: 'postgresql://test:test@ep-preview.sa-east-1.aws.neon.tech/livrolas?sslmode=require',
      BETTER_AUTH_SECRET: 'preview-test-secret-with-at-least-32-bytes',
      EMAIL_FROM: 'test@example.invalid',
      GMAIL_APP_PASSWORD: 'test-only-password',
    },
  }
}

describe('Deployment preflight', () => {
  const temporaryDirs: string[] = []
  afterEach(() => {
    for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('keeps migration credentials out of every remote environment payload', () => {
    const { production, preview } = environments()
    const result = validateDeploymentConfig(production, preview)
    expect(Object.keys(result.production).sort()).toEqual([
      'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'DATABASE_URL', 'EMAIL_FROM', 'GMAIL_APP_PASSWORD',
    ])
    expect(Object.keys(result.preview).sort()).toEqual([
      'BETTER_AUTH_SECRET', 'DATABASE_URL', 'EMAIL_FROM', 'GMAIL_APP_PASSWORD',
    ])
    expect(result.productionDirectUrl).toBe(production.DATABASE_URL_DIRECT)
    expect(result.previewDirectUrl).toBe(preview.DATABASE_URL_DIRECT)
  })

  it('rejects pooled and direct credentials pointing at different databases', () => {
    const { production, preview } = environments()
    production.DATABASE_URL_DIRECT = production.DATABASE_URL_DIRECT.replace('/livrolas?', '/other?')
    expect(() => validateDeploymentConfig(production, preview)).toThrow(/mesmo endpoint e banco/)
  })

  it('rejects a preview using production even with different user credentials', () => {
    const { production, preview } = environments()
    preview.DATABASE_URL = production.DATABASE_URL.replace('test:test@', 'other:password@')
    preview.DATABASE_URL_DIRECT = production.DATABASE_URL_DIRECT.replace('test:test@', 'other:password@')
    expect(() => validateDeploymentConfig(production, preview)).toThrow(/bancos Neon isolados/)
  })

  it('requires a separate Neon endpoint for Preview even with a different database name', () => {
    const { production, preview } = environments()
    preview.DATABASE_URL = production.DATABASE_URL.replace('/livrolas?', '/preview?')
    preview.DATABASE_URL_DIRECT = production.DATABASE_URL_DIRECT.replace('/livrolas?', '/preview?')
    expect(() => validateDeploymentConfig(production, preview)).toThrow(/bancos Neon isolados/)
  })

  it.each(['DATABASE_URL', 'DATABASE_URL_DIRECT'])('rejects localhost for %s without revealing credentials', (key) => {
    const { production, preview } = environments()
    const invalid = { ...production, [key]: 'postgresql://secret-user:private-password@localhost/livrolas' }
    expect(() => validateDeploymentConfig(invalid, preview)).toThrow(/conexão Neon/)
    try { validateDeploymentConfig(invalid, preview) }
    catch (error) { expect(String(error)).not.toMatch(/secret-user|private-password/) }
  })

  it('rejects a direct endpoint in the application connection', () => {
    const { production, preview } = environments()
    production.DATABASE_URL = production.DATABASE_URL_DIRECT
    expect(() => validateDeploymentConfig(production, preview)).toThrow(/endpoint pooled obrigatório/)
  })

  it('rejects missing SMTP credentials', () => {
    const { production, preview } = environments()
    preview.GMAIL_APP_PASSWORD = ''
    expect(() => validateDeploymentConfig(production, preview)).toThrow(/Preview: GMAIL_APP_PASSWORD/)
  })

  it('rejects shared authentication secrets across environments', () => {
    const { production, preview } = environments()
    preview.BETTER_AUTH_SECRET = production.BETTER_AUTH_SECRET
    expect(() => validateDeploymentConfig(production, preview)).toThrow(/SECRET distintos/)
  })

  it('rejects NODE_ENV overrides that can omit build dependencies', () => {
    const { production, preview } = environments()
    expect(() => validateDeploymentConfig({ ...production, NODE_ENV: 'production' }, preview)).toThrow(/não configure NODE_ENV/)
  })

  it.each(['http://localhost:3000', 'https://livrolas.vercel.app/path', 'https://other.example.com'])('rejects invalid canonical origin %s', (origin) => {
    const { production, preview } = environments()
    production.BETTER_AUTH_URL = origin
    expect(() => validateDeploymentConfig(production, preview)).toThrow(/origem HTTPS canônica/)
  })

  it('reads quoted dotenv values and rejects unreadable files with a sanitized error', () => {
    const { production, preview } = environments()
    const dir = mkdtempSync(join(tmpdir(), 'livrolas-deploy-test-'))
    temporaryDirs.push(dir)
    const prodPath = join(dir, '.env.production')
    const previewPath = join(dir, '.env.preview')
    for (const [file, vars] of [[prodPath, production], [previewPath, preview]] as const) {
      writeFileSync(file, Object.entries(vars).map(([key, value]) => `${key}="${value}"`).join('\n'))
    }
    expect(loadDeploymentConfig(prodPath, previewPath).production.BETTER_AUTH_URL).toBe('https://livrolas.vercel.app')
    expect(() => loadDeploymentConfig('missing', previewPath)).toThrow('Production: arquivo de ambiente não encontrado ou ilegível.')
  })
})
