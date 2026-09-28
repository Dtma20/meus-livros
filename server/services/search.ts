import { logger } from '../utils/logger'
import { sql } from 'drizzle-orm'
import { db } from '../db'
import type { Viewer } from './visibility'
import { search_misses } from '../db/schema'

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

export function escapeLikeWildcards(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export async function searchWorks(query: string, viewer: Viewer): Promise<SearchWork[]> {
  const term = query.trim()
  if (term.length < 2) return []

  const tokens = term
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2)

  const escaped = escapeLikeWildcards(term)

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
        -- Sem guarda para % ou _: similarity/word_similarity comparam
        -- trigramas contra um parâmetro vinculado, e os tokens já saem
        -- sem % e _ do regex de limpeza acima. Desligar o fuzzy aqui
        -- zerava a busca aproximada para queries como "harry_potter".
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
                FROM unnest(ARRAY[${sql.join(tokens.map((t) => sql`${t}`), sql`, `)}]::text[]) as t
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

export async function recordSearchMiss(query: string, userId: string | null = null): Promise<void> {
  const term = query.trim()
  if (term.length < 2) return

  try {
    await db.insert(search_misses).values({
      query: term,
      user_id: userId,
    })
  } catch (err: unknown) {
    logger.error('search_misses insert failed', {
      module: 'search',
      source: 'database',
      error: err as Error,
    })
  }
}
