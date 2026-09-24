import { and, eq, inArray, like, notExists, or, sql } from 'drizzle-orm'

/**
 * Fixture cleanup for the integration suites, which run against a real
 * database.
 *
 * Every suite used to clean up with its own chain of deletes keyed on ids it
 * had collected, and three things kept leaving rows behind for real members to
 * find in search:
 *
 * - An id that was never collected. A setup that failed or timed out halfway
 *   had already inserted rows it had not pushed yet, and nothing looked for
 *   them.
 * - A delete order that died on the way. `reading_logs.work_id` is ON DELETE
 *   RESTRICT, so one stray log made the works delete throw, and every
 *   statement after it (authors, users, `client.end()`) never ran.
 * - A user deleted before its works. `works.created_by` is ON DELETE SET NULL,
 *   so from then on nothing tied those works to the test that made them.
 *
 * So this finds rows by the marker in their text, not by remembered ids, and
 * deletes everything in one transaction in foreign-key order. If any statement
 * fails, nothing is deleted and the error fails the run, instead of leaving a
 * half-cleaned set whose works no longer point at anybody.
 */

/**
 * Deletes every row whose text carries `marker`, plus everything owned by the
 * users that carry it.
 *
 * Matched by marker: users and allowlist entries by email, works by title or
 * slug, authors by name or slug, search misses by query. Matched by owner:
 * works a test user created, logs a test user wrote, and logs on a test work
 * whoever wrote them (axe.test.ts puts one on a real member's account).
 *
 * `marker` must be unique to one run, which the `Date.now()` in every suite's
 * marker guarantees: this is a substring match.
 *
 * Authors are only deleted once no work links them. Authors are shared by
 * name, so one a test created may have been picked up by a member's work in
 * the meantime, and deleting it would cascade through that work's author list.
 */
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

    // Logs first: reading_logs.work_id is RESTRICT. reading_blocks cascade.
    await tx
      .delete(schema.reading_logs)
      .where(
        or(
          inArray(schema.reading_logs.work_id, workIds),
          inArray(schema.reading_logs.user_id, userIds),
        ),
      )

    // editions, work_authors and work_genres cascade from works.
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

    // Users last, so no works.created_by is nulled while its work still exists.
    await tx.delete(schema.users).where(inArray(schema.users.id, userIds))
    await tx.delete(schema.allowed_emails).where(like(schema.allowed_emails.email, pattern))
  })
}

/**
 * Lets `afterAll` wait for a `beforeAll` that is still running.
 *
 * When a hook times out, Vitest stops waiting for it but the promise keeps
 * going: the seeding loop goes on inserting works while `afterAll` is already
 * deleting, and every row inserted after the delete stays behind. That is how
 * works ended up with `created_by` NULL — the user was deleted, then the
 * abandoned setup's next `createWork` for it had already been sent.
 *
 *     const setup = trackSetup()
 *     beforeAll(() => setup.run(async () => { ...seed... }))
 *     afterAll(async () => {
 *       await setup.settled()
 *       await removeFixtures(MARKER)
 *     })
 */
export function trackSetup() {
  let pending: Promise<unknown> = Promise.resolve()
  return {
    run<T>(seed: () => Promise<T>): Promise<T> {
      const running = seed()
      pending = running
      return running
    },
    /** Resolves once the seed has finished, whether it succeeded or not. */
    async settled(): Promise<void> {
      await pending.then(
        () => undefined,
        () => undefined,
      )
    },
  }
}
