import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('A variável de ambiente DATABASE_URL não foi informada.')
}

export const client = postgres(databaseUrl, {
  // One connection per serverless invocation: the Neon pooler does the
  // pooling, and a lambda holding its own pool would exhaust it.
  max: 1,
  // Neon free scales the compute to zero after 5 minutes idle. Without a cap
  // the first query after that hangs until Vercel's own function timeout and
  // the caller gets a bare 504 instead of an error this project shaped. Seven
  // and not ten: Vercel Hobby caps the function at 10s by default, so an equal
  // timeout never fires first and leaves nothing to shape the error with.
  connect_timeout: 7,
})
export const db = drizzle(client)
