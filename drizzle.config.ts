import { defineConfig } from 'drizzle-kit'

const databaseUrlDirect = process.env.DATABASE_URL_DIRECT

if (!databaseUrlDirect || !databaseUrlDirect.trim()) {
  throw new Error('A variável de ambiente DATABASE_URL_DIRECT não foi informada.')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: {
    url: databaseUrlDirect
  }
})
