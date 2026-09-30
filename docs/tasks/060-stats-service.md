# TASK-060 - Reading statistics: service and route

## Context

Statistics round of 2026-09-28 (`STAT-1` in [feature-backlog.md](../feature-backlog.md)). The owner asked for it on 2026-09-28, overriding the deferral in [mvp-definition.md](../mvp-definition.md) §4. Agent prompt: [PROMPT-estatisticas.md](../agent-prompts/PROMPT-estatisticas.md). Runs in parallel with TASK-061; TASK-062 consumes this endpoint.

The profile payload (`server/services/profiles.ts`) cannot feed statistics: it stops at `.limit(100)` and carries no language. This task adds a dedicated aggregate endpoint.

## Implementation requirements

1. `shared/schemas/stats.ts`:
   - `statsQuerySchema`: `z.object({ ano: z.coerce.number().int().min(-9999).max(9999).optional() })`. `year` can be negative in this dataset, but `ano` is the *reading* year; the range only guards against junk.
   - Exported response types (TypeScript interfaces, same style as `shared/schemas/profile.ts`):
     ```ts
     interface StatsCount { label: string; count: number }
     interface StatsResponse {
       user: { handle: string; display_name: string }
       year: number | null                        // echo of ?ano, null = all years
       years: number[]                            // every year with ≥1 finished visible log, ascending, IGNORES ?ano
       totals: { books: number; pages: number; authors: number; countries: number; averageRating: number | null }
       byYear: { year: number; books: number; pages: number }[]   // ascending; when ?ano is set, a single entry
       genres: StatsCount[]                        // top 8, count desc, label asc
       authors: (StatsCount & { slug: string })[]  // top 8, count desc, label asc
       countries: StatsCount[]                     // all, count desc, label asc
       languages: StatsCount[]                     // all, count desc, label asc
       ratings: { rating: number; count: number }[] // only ratings that occur, ascending
       formats: { format: 'fisico' | 'ebook' | 'audio' | null; count: number }[]
     }
     ```
   - `languageLabel(code: string | null): string` with a fixed pt-BR map: `en inglês, pt português, de alemão, ru russo, fr francês, zh chinês, he hebraico, no norueguês, la latim, es espanhol, ja japonês, it italiano`. Unknown code → the code in upper case. `null` → `Não informado`. **No `Intl`** - labels render in SSR and Node/Chrome ICU differ (hydration break, see `docs/agent-prompts/repo-state.md`).
2. `server/services/stats.ts`, `getReadingStats(handle: string, viewer: Viewer, year: number | null): Promise<StatsResponse>`:
   - User lookup and 404 exactly like `getProfileByHandle`: unknown handle → 404 `nao_encontrado`; `profile_visibility = 'privado'` and viewer is not the owner → 404 (never 403).
   - Log set: `reading_logs.user_id = owner AND finished_on IS NOT NULL AND visibleLogs(viewer)` (join `users` - `visibleLogs` references `users.profile_visibility`). With `year`, also `EXTRACT(YEAR FROM finished_on) = year`. **No limit.**
   - Pages per log: the log's edition `page_count`; when `edition_id IS NULL`, the work's first edition in the same order `profiles.ts` uses for `firstOverall` (read its `firstEditionRows` query and copy the ordering). Missing page count counts 0.
   - `authors`/`countries`: a log counts once per distinct author (author name as label, author slug). Country label = `formatCountryName(country_code, country_label)` from `shared/schemas/profile.ts` (server-side, so safe); a log with two authors from the same country counts that country once; empty label is skipped. `totals.authors`/`totals.countries` = distinct count.
   - `genres`: `genres.label_pt`, a log counts once per genre of its work.
   - `languages`: `works.original_language` through `languageLabel`.
   - `averageRating`: mean of non-null ratings rounded to 1 decimal; `null` if none. `ratings[].rating` is a JS number (`numeric` comes back as string - convert).
   - Aggregation may run in SQL (`GROUP BY`) or in TypeScript over the selected rows; at ~1,500 logs either is fine. Keep it in one service file.
3. `server/api/users/[handle]/stats.get.ts`: thin route - `getRouterParam`, `parseOrThrow(statsQuerySchema, getQuery(event))`, optional session like `server/api/users/[handle].get.ts`, call the service. Invalid `ano` → 400 via `parseOrThrow`.
4. `tests/integration/stats.test.ts` (pattern: `tests/integration/profile.test.ts`, `trackSetup`/`removeFixtures`, `describe.skipIf(!hasDatabaseUrl)`), calling the service directly.
5. `tests/unit/stats-schema.test.ts` for `statsQuerySchema` and `languageLabel`.

## Explicitly excluded

- Any `app/**` file. `server/services/profiles.ts` (read it, do not change it). Cohort-wide stats. Caching. Migrations - the schema already has every column.

## Expected files

```
shared/schemas/stats.ts
server/services/stats.ts
server/api/users/[handle]/stats.get.ts
tests/integration/stats.test.ts
tests/unit/stats-schema.test.ts
```

## Acceptance criteria

- [ ] Integration: owner with 3 finished public logs in 2024 (100, 200 pages; one with `edition_id NULL` whose work has a 300-page edition) and 1 in 2025 → anonymous `year=null` gives `totals.books` 4, `byYear` `[{2024,3,600},{2025,1,…}]`, `years` `[2024,2025]`
- [ ] Integration: same owner, `year=2025` → `totals.books` 1, `byYear` length 1, `years` still `[2024,2025]`
- [ ] Integration: a private log is counted for the owner viewer and not for anonymous or another member
- [ ] Integration: an unfinished log (`finished_on NULL`) is never counted
- [ ] Integration: private profile → 404 for anonymous and for another member; 200 for the owner
- [ ] Integration: unknown handle → 404 with `error: 'nao_encontrado'`
- [ ] Integration: a work with two authors from the same country adds 1 to that country's count, 1 to each author
- [ ] Unit: `statsQuerySchema.safeParse({ ano: 'abc' }).success === false`; `{ ano: '2025' }` parses to `2025`; `{}` parses
- [ ] Unit: `languageLabel('en') === 'inglês'`, `languageLabel('xx') === 'XX'`, `languageLabel(null) === 'Não informado'`
- [ ] `grep -n "Intl" shared/schemas/stats.ts` returns nothing
- [ ] `grep -rn "from '../db'\|from '../../db'" server/api/users` returns nothing

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
