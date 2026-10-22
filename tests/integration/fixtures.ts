import { and, eq, inArray, like, notExists, or, sql } from 'drizzle-orm'
import { randomInt } from 'node:crypto'

export async function removeFixtures(
  marker: string,
  extraUserIds: ReadonlyArray<string | null | undefined> = [],
): Promise<void> {
  if (marker.length < 8) {
    throw new Error(`Marcador curto demais para uma limpeza por substring: "${marker}".`)
  }

  const { db } = await import('../../server/db')
  const schema = await import('../../server/db/schema')
  const pattern = `%${marker.replace(/[\\%_]/g, (char) => `\\${char}`)}%`

  await db.transaction(async (tx) => {
    const markedUsers = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(like(schema.users.email, pattern))
    const userIds = [
      ...new Set([
        ...markedUsers.map((row) => row.id),
        ...extraUserIds.filter((id): id is string => Boolean(id)),
      ]),
    ]

    const works = await tx
      .select({ id: schema.works.id })
      .from(schema.works)
      .where(
        or(
          like(schema.works.title, pattern),
          like(schema.works.slug, pattern),
          inArray(schema.works.created_by, userIds),
        ),
      )
    const workIds = works.map((row) => row.id)

    await tx
      .delete(schema.reading_logs)
      .where(
        or(
          inArray(schema.reading_logs.work_id, workIds),
          inArray(schema.reading_logs.user_id, userIds),
        ),
      )

    await tx.delete(schema.works).where(inArray(schema.works.id, workIds))

    await tx
      .delete(schema.authors)
      .where(
        and(
          or(
            like(schema.authors.name, pattern),
            like(schema.authors.slug, pattern),
            inArray(schema.authors.created_by, userIds),
          ),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(schema.work_authors)
              .where(eq(schema.work_authors.author_id, schema.authors.id)),
          ),
        ),
      )

    await tx
      .delete(schema.search_misses)
      .where(
        or(
          like(schema.search_misses.query, pattern),
          inArray(schema.search_misses.user_id, userIds),
        ),
      )

    await tx.delete(schema.users).where(inArray(schema.users.id, userIds))
    await tx.delete(schema.allowed_emails).where(like(schema.allowed_emails.email, pattern))
  })
}

export function trackSetup() {
  let pending: Promise<unknown> = Promise.resolve()
  return {
    run<T>(seed: () => Promise<T>): Promise<T> {
      const running = seed()
      pending = running
      return running
    },

    async settled(): Promise<void> {
      await pending.then(
        () => undefined,
        () => undefined,
      )
    },
  }
}

export function uniqueIsbn13(): string {
  const random9 = String(randomInt(1000000000)).padStart(9, '0')
  const first12 = `978${random9}`
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3)
  }
  const check = String((10 - (sum % 10)) % 10)
  return first12 + check
}

const allocatedIps = new Set<string>()
export function uniqueTestIp(): string {
  // RFC 2544 range; prevent reuse in this worker and reduce collisions between workers.
  if (allocatedIps.size >= 2 * 254 * 254) throw new Error('Faixa de IPs de teste esgotada neste worker.')
  let ip: string
  do { ip = `198.${randomInt(18, 20)}.${randomInt(1, 255)}.${randomInt(1, 255)}` }
  while (allocatedIps.has(ip))
  allocatedIps.add(ip)
  return ip
}

export function uniqueHandle(prefix = 'usr'): string {
  const rand = Math.random().toString(36).slice(2, 8)
  const time = (Date.now() % 1000000).toString(36)
  return `${prefix}_${time}${rand}`.slice(0, 20)
}

export async function rateLimitHashes(keys: ReadonlyArray<string>): Promise<string[]> {
  const { createHash } = await import('node:crypto')
  return [
    ...new Set(
      keys.map((k) =>
        k.length === 64 && /^[0-9a-f]{64}$/.test(k) ? k : createHash('sha256').update(k).digest('hex'),
      ),
    ),
  ]
}

export async function deleteRateLimits(keys: ReadonlyArray<string>): Promise<void> {
  if (keys.length === 0) return
  const { db } = await import('../../server/db')
  const hashedKeys = await rateLimitHashes(keys)

  await db.execute(sql`
    DELETE FROM rate_limit
    WHERE key IN (${sql.join(hashedKeys.map((k) => sql`${k}`), sql`, `)})
  `)
}
