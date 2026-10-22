# TASK-062 - Reading statistics: pages

## Context

Statistics round of 2026-09-28 (`STAT-1`). Agent prompt: [PROMPT-estatisticas.md](../agent-prompts/PROMPT-estatisticas.md). **Depends on TASK-060 (endpoint `GET /api/users/:handle/stats`, types in `shared/schemas/stats.ts`) and TASK-061 (`app/components/stats/BarList.vue`, `YearColumns.vue`), both merged.**

Owner decisions: stats per member at `/@handle/estatisticas` (all years) and a shareable year-in-review at `/@handle/ano/<ano>`. Visitors see only what `visibleLogs` lets them see - the endpoint already enforces it.

Nuxt nests `pages/@[handle]/*.vue` under `pages/@[handle].vue` if both exist, so the profile page must move into the folder first.

## Implementation requirements

1. **Move** `app/pages/@[handle].vue` → `app/pages/@[handle]/index.vue` with `git mv`, content unchanged except imports that break. Update the import path in the five tests that import it: `tests/unit/diary.test.ts`, `home-layout.test.ts`, `profile-page.test.ts`, `routes.test.ts`, `use-book-filters.test.ts` (path strings only; a `describe` title mentioning the old path may be updated too). `/@handle` must keep working exactly as before.
2. `app/pages/@[handle]/estatisticas.vue`:
   - `await useAsyncData` on `/api/users/${handle}/stats` (why `await`: see `docs/agent-prompts/repo-state.md` - without it a 404 answers 200). 404 → `showError({ statusCode: 404 })` the same way `@[handle]/index.vue` does it.
   - Content, top to bottom: heading `Estatísticas de <display_name>` with a link back to `/@handle`; stat tiles (reuse `app/components/profile/StatBox.vue`) for livros, páginas, autores, países, nota média (`–` when null); `YearColumns` (`basePath` `/@handle`); `BarList` for gêneros, autores (`to` = `/autor/...` is **not** a route - omit `to`), países, idiomas; `RatingHistogram` fed with `ratings.flatMap(r => Array(r.count).fill(r.rating))`; formats as a `BarList` with labels `Físico`, `E-book`, `Audiolivro`, `Não informado`.
   - Empty state (`totals.books === 0`) with `EmptyState.vue`: owner viewing → "Registre um livro terminado para ver suas estatísticas." with action to `/app/novo`; anyone else → "Nenhuma leitura pública ainda.". Error state with `ErrorState.vue` and retry. Loading state with `LoadingSkeleton.vue`.
   - `useSeoMeta`: title `Estatísticas de <display_name>`, description/ogDescription `<display_name> já leu <N> livros e <P> páginas.` (numbers formatted with the same hand-made thousands separator as TASK-061, not `Intl`), `ogUrl`, `ogType: 'profile'`.
3. `app/pages/@[handle]/ano/[ano].vue`:
   - Validate `ano` in the page: not an integer → `showError({ statusCode: 404 })` before fetching.
   - Fetch with `?ano=<ano>`. Same sections as the all-years page **except `YearColumns`** (with `?ano` the response's `byYear` has a single entry, so a column chart says nothing). In its place, a year switcher: `<nav aria-label="Outros anos">` with one link per entry of `years` to `/@handle/ano/<year>` (current one `aria-current="page"`), plus a link `Todos os anos` to `/@handle/estatisticas`.
   - Heading `<display_name> em <ano>`; OG title the same; OG description `<display_name> leu <N> livros em <ano>.` (singular `1 livro`). Empty year (0 books) → empty state "Nenhuma leitura registrada em <ano>." (not a 404 - the year exists as a URL).
4. Profile page link: in `app/pages/@[handle]/index.vue`, next to the header stats, a `NuxtLink` "Ver estatísticas" to `/@handle/estatisticas`. This is the only content change allowed in that file.
5. Tests: `tests/unit/stats-pages.test.ts` (`// @vitest-environment happy-dom`; copy the `vi.hoisted` stubs and `Suspense` mounting from `tests/unit/profile-page.test.ts`).

## Explicitly excluded

- `server/**`, `shared/**`, `app/components/stats/**` (if a component needs a change, stop and report). A generated OG image. Cohort stats. Any change to `/@handle` beyond the move and the link.

## Expected files

```
app/pages/@[handle]/index.vue            (moved from app/pages/@[handle].vue)
app/pages/@[handle]/estatisticas.vue
app/pages/@[handle]/ano/[ano].vue
tests/unit/diary.test.ts
tests/unit/home-layout.test.ts
tests/unit/profile-page.test.ts
tests/unit/routes.test.ts
tests/unit/use-book-filters.test.ts
tests/unit/stats-pages.test.ts
```

## Acceptance criteria

- [ ] `test -f 'app/pages/@[handle].vue'` fails; `git log --follow 'app/pages/@[handle]/index.vue'` shows the old history
- [ ] Browser (reviewer): `/@<handle>` renders the profile as before, and "Ver estatísticas" goes to `/@<handle>/estatisticas`
- [ ] Browser (reviewer): `/@<handle>/estatisticas` shows the same `livros` total as the endpoint's `totals.books`, no console hydration warning
- [ ] Browser (reviewer): a year column click lands on `/@<handle>/ano/<year>` and its heading reads `<display_name> em <year>`
- [ ] `curl` of `/@<handle>/ano/2025` HTML contains `og:description` with `em 2025`
- [ ] `/@<handle>/ano/abc` → 404; `/@nao_existe/estatisticas` → 404; private profile as anonymous → 404
- [ ] Test: page with `totals.books: 0` as a non-owner shows "Nenhuma leitura pública ainda."
- [ ] Test: year page with `years: [2023, 2024]` at `ano=2024` renders two year links, the 2024 one with `aria-current="page"`
- [ ] 320px: no horizontal page scroll on either page
- [ ] `grep -rn "Intl\|toLocaleString\|v-html" 'app/pages/@[handle]'` returns nothing

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` pass (run by the reviewer, not the agent)
