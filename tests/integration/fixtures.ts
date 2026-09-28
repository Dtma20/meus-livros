import { and, eq, inArray, like, notExists, or, sql } from 'drizzle-orm'

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
