import { inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import type { Viewer } from './visibility'
import { search_misses, works } from '../db/schema'
import { slugify } from '../utils/slug'
import { searchOpenLibrary } from './open-library'
import type { SearchResult } from '../../shared/schemas/search'

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
 *   3. log_count DESC — **visible logs only**
 *
 * log_count counts only what the viewer may see. Counting every log would rank
 * results by activity the viewer cannot look at, and it would say out loud that
 * a private entry exists — the same leak the 404-instead-of-403 rule closes, by
 * a different door.
 *   4. title ASC
 */
export async function searchWorks(query: string, viewer: Viewer): Promise<SearchWork[]> {
  // The spec says: q shorter than 2 chars → return empty array, not an error.
  const term = query.trim()
  if (term.length < 2) return []

  // Clean tokens for multi-word matching
  const tokens = term
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2)

  // Escaped in JS, bound as a parameter; every LIKE/ILIKE below declares
  // ESCAPE '\' so the backslashes are honoured. (In the sql template
  // literal the backslash is written doubled: '\\' renders as '\' in SQL.)
  const escaped = escapeLikeWildcards(term)

  // Single-pass query: one scan of works using EXISTS for author match to avoid
  // fan-out from multi-author works and avoid needing DISTINCT in matched.
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
      SELECT
        w.id,
        w.slug,
        w.title,
        w.first_published_year,
        (w.search_text = (SELECT norm FROM q)) AS exact_title_match,
        (w.search_text LIKE (SELECT pattern FROM q) || '%' ESCAPE '\\') AS title_prefix_match,
        similarity(w.search_text, (SELECT norm FROM q)) AS title_similarity
      FROM works w
      WHERE w.search_text ILIKE '%' || (SELECT pattern FROM q) || '%' ESCAPE '\\'
        OR EXISTS (
          SELECT 1 FROM work_authors wa
          JOIN authors a ON a.id = wa.author_id
          WHERE wa.work_id = w.id
            AND f_unaccent(lower(a.name)) ILIKE '%' || (SELECT pattern FROM q) || '%' ESCAPE '\\'
        )
        OR similarity(w.search_text, (SELECT norm FROM q)) > 0.25
        OR word_similarity((SELECT norm FROM q), w.search_text) > 0.35
        ${
          tokens.length >= 2
            ? sql`OR (
                SELECT bool_and(
                  w.search_text ILIKE '%' || f_unaccent(lower(t)) || '%'
                  OR EXISTS (
                    SELECT 1 FROM work_authors wa2
                    JOIN authors a2 ON a2.id = wa2.author_id
                    WHERE wa2.work_id = w.id
                      AND f_unaccent(lower(a2.name)) ILIKE '%' || f_unaccent(lower(t)) || '%'
                  )
                )
                FROM unnest(${tokens}::text[]) as t
              )`
            : sql``
        }
    ),
    ranked AS (
      SELECT
        m.id,
        m.slug,
        m.title,
        m.first_published_year,
        m.exact_title_match,
        m.title_prefix_match,
        m.title_similarity,
        -- DISTINCT is not needed: matched produces exactly one row per work,
        -- so each rl.id appears at most once per group.
        COUNT(rl.id)::int AS log_count
      FROM matched m
      LEFT JOIN (reading_logs rl JOIN users ru ON ru.id = rl.user_id)
        ON rl.work_id = m.id
       AND (
             (${viewer?.id ?? null}::uuid IS NOT NULL AND rl.user_id = ${viewer?.id ?? null}::uuid)
             OR (rl.visibility = 'publico' AND ru.profile_visibility = 'publico')
           )
      GROUP BY m.id, m.slug, m.title, m.first_published_year, m.exact_title_match, m.title_prefix_match, m.title_similarity
      ORDER BY
        m.exact_title_match DESC,
        m.title_prefix_match DESC,
        m.title_similarity DESC,
        COUNT(rl.id) DESC,
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
    GROUP BY r.id, r.slug, r.title, r.first_published_year, r.exact_title_match, r.title_prefix_match, r.title_similarity, r.log_count
    ORDER BY
      r.exact_title_match DESC,
      r.title_prefix_match DESC,
      r.title_similarity DESC,
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
 * Searches the local catalogue first and seamlessly complements with Open Library
 * results, with local results prioritized at the top and deduplication applied.
 */
export async function searchHybridWorks(
  query: string,
  viewer: Viewer,
): Promise<SearchResult[]> {
  const term = query.trim()
  if (term.length < 2) return []

  // 1. Local search (fast, prioritised)
  const localWorks = await searchWorks(term, viewer)
  const localResults: SearchResult[] = localWorks.map((w) => ({
    id: w.id,
    slug: w.slug,
    title: w.title,
    authors: w.authors,
    first_published_year: w.first_published_year,
    cover_url: w.cover_url,
    log_count: w.log_count,
    source: 'local',
  }))

  // 2. Open Library online lookup (automatic complement)
  let externalResults: SearchResult[] = []
  try {
    const extResp = await searchOpenLibrary(term)
    if (extResp.results && extResp.results.length > 0) {
      const localTitles = new Set(localWorks.map((w) => slugify(w.title)))
      const localOlKeys = new Set<string>()

      const extKeys = extResp.results.map((r) => r.ol_work_key).filter(Boolean)
      if (extKeys.length > 0) {
        const found = await db
          .select({ ol_work_key: works.ol_work_key })
          .from(works)
          .where(inArray(works.ol_work_key, extKeys))
        for (const f of found) {
          if (f.ol_work_key) localOlKeys.add(f.ol_work_key)
        }
      }

      externalResults = extResp.results
        .filter((r) => {
          if (r.ol_work_key && localOlKeys.has(r.ol_work_key)) return false
          const titleSlug = slugify(r.title)
          if (localTitles.has(titleSlug)) return false
          return true
        })
        .slice(0, 10)
        .map((r) => ({
          title: r.title,
          authors: r.authors.map((name) => ({ name, slug: slugify(name) })),
          first_published_year: r.first_publish_year,
          cover_url: r.cover_url,
          ol_cover_id: r.ol_cover_id,
          ol_work_key: r.ol_work_key,
          language: r.language,
          log_count: 0,
          source: 'externo',
        }))
    }
  } catch (err) {
    console.error('[search] Erro ao buscar Open Library na busca híbrida:', err)
  }

  return [...localResults, ...externalResults]
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
