import { sql } from 'drizzle-orm'
import { db } from '../db'
import { search_misses } from '../db/schema'

/**
 * Maximum results returned by a single search call.
 * Spec: "at most 20".
 */
const LIMIT = 20

export interface SearchWork {
  id: string
  slug: string
  title: string
  authors: { name: string; slug: string }[]
  first_published_year: number | null
  cover_url: string | null
  log_count: number
}

/**
 * Escape the LIKE wildcards (`%`, `_`) and the escape character itself so a
 * user-typed `%` or `_` matches literally. The result is still passed as a
 * **bound parameter** — never concatenated into the SQL string.
 */
export function escapeLikeWildcards(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * Search the local catalog for works matching `query` (accent-insensitive,
 * case-insensitive) against both `works.search_text` (generated column on
 * `title`) and `authors.name`.
 *
 * The user-supplied term is **always a bound parameter** — it is never
 * concatenated into the SQL string. A literal `%` or `_` in the input is
 * matched literally (see {@link escapeLikeWildcards}) and does not act as
 * a wildcard.
 *
 * Ranking (spec §4):
 *   1. Exact title match (f_unaccent(lower(title)) = f_unaccent(lower($1)))
 *   2. Title prefix match (search_text LIKE f_unaccent(lower($1)) || '%')
 *   3. log_count DESC
 *   4. title ASC
 */
export async function searchWorks(query: string): Promise<SearchWork[]> {
  // The spec says: q shorter than 2 chars → return empty array, not an error.
  const term = query.trim()
  if (term.length < 2) return []

  // Escaped in JS, bound as a parameter; every LIKE/ILIKE below declares
  // ESCAPE '\' so the backslashes are honoured. (In the sql template
  // literal the backslash is written doubled: '\\' renders as '\' in SQL.)
  const escaped = escapeLikeWildcards(term)

  // Single-pass query: one scan of works with an author join, DISTINCT to
  // collapse multi-author duplicates (the ranking flags depend only on the
  // work itself). A UNION of title-matches + author-matches would emit the
  // same work twice with different flags.
  const rows = await db.execute<{
    id: string
    slug: string
    title: string
    first_published_year: number | null
    cover_url: string | null
    log_count: string
    authors_json: string
    exact_title_match: boolean
    title_prefix_match: boolean
  }>(sql`
    WITH q AS (
      -- Evaluated once (initPlan): the per-row scan below must not pay for
      -- f_unaccent() on the search term for every work. search_text already
      -- stores f_unaccent(lower(title)), so the exact match compares against
      -- it directly with no per-row function call on the title either.
      SELECT
        f_unaccent(lower(${term})) AS norm,
        f_unaccent(lower(${escaped})) AS pattern
    ),
    matched AS (
      SELECT DISTINCT
        w.id,
        w.slug,
        w.title,
        w.first_published_year,
        (w.search_text = (SELECT norm FROM q)) AS exact_title_match,
        (w.search_text LIKE (SELECT pattern FROM q) || '%' ESCAPE '\\') AS title_prefix_match
      FROM works w
      LEFT JOIN work_authors wa ON wa.work_id = w.id
      LEFT JOIN authors a ON a.id = wa.author_id
      WHERE w.search_text ILIKE '%' || (SELECT pattern FROM q) || '%' ESCAPE '\\'
        OR f_unaccent(lower(a.name)) ILIKE '%' || (SELECT pattern FROM q) || '%' ESCAPE '\\'
    ),
    ranked AS (
      SELECT
        m.id,
        m.slug,
        m.title,
        m.first_published_year,
        m.exact_title_match,
        m.title_prefix_match,
        COUNT(DISTINCT rl.id)::int AS log_count
      FROM matched m
      LEFT JOIN reading_logs rl ON rl.work_id = m.id
      GROUP BY m.id, m.slug, m.title, m.first_published_year, m.exact_title_match, m.title_prefix_match
      ORDER BY
        m.exact_title_match DESC,
        m.title_prefix_match DESC,
        COUNT(DISTINCT rl.id) DESC,
        m.title ASC
      LIMIT ${LIMIT}
    )
    SELECT
      r.id,
      r.slug,
      r.title,
      r.first_published_year,
      r.exact_title_match,
      r.title_prefix_match,
      (
        SELECT e.cover_url
        FROM editions e
        WHERE e.work_id = r.id AND e.cover_url IS NOT NULL
        ORDER BY e.created_at
        LIMIT 1
      ) AS cover_url,
      r.log_count,
      COALESCE(
        json_agg(
          json_build_object('name', a.name, 'slug', a.slug)
          ORDER BY wa.position
        ) FILTER (WHERE a.id IS NOT NULL),
        '[]'::json
      ) AS authors_json
    FROM ranked r
    LEFT JOIN work_authors wa ON wa.work_id = r.id
    LEFT JOIN authors a ON a.id = wa.author_id
    GROUP BY r.id, r.slug, r.title, r.first_published_year, r.exact_title_match, r.title_prefix_match, r.log_count
    ORDER BY
      r.exact_title_match DESC,
      r.title_prefix_match DESC,
      r.log_count DESC,
      r.title ASC
  `)

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    first_published_year: row.first_published_year ?? null,
    cover_url: row.cover_url ?? null,
    log_count: Number(row.log_count),
    authors: (typeof row.authors_json === 'string'
      ? (JSON.parse(row.authors_json) as { name: string; slug: string }[])
      : (row.authors_json as { name: string; slug: string }[])),
  }))
}

/**
 * Record a search that returned no results.
 * Fire-and-forget: errors are caught and logged so they never block or fail the response.
 *
 * Rules (TASK-026):
 * - Store the query as typed, trimmed (raw text is the signal, including typos; do not normalise).
 * - Queries shorter than 2 characters are ignored (empty by design, not by catalog absence).
 * - Anonymous searches record user_id as null.
 * - Errors are caught and logged, never throwing or rejecting.
 */
export async function recordSearchMiss(query: string, userId: string | null = null): Promise<void> {
  const term = query.trim()
  if (term.length < 2) return

  try {
    await db.insert(search_misses).values({
      query: term,
      user_id: userId,
    })
  } catch (err: unknown) {
    console.error('[search] search_misses insert failed:', err)
  }
}
