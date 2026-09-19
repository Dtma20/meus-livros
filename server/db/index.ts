import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('A variável de ambiente DATABASE_URL não foi informada.')
}

export const client = postgres(databaseUrl, { max: 1 })
export const db = drizzle(client)
