# TASK-061 - Reading statistics: chart components

## Context

Statistics round of 2026-09-28 (`STAT-1`). Agent prompt: [PROMPT-estatisticas.md](../PROMPT-estatisticas.md). Runs in parallel with TASK-060; TASK-062 places these components on the pages.

Owner decision: charts are hand-made CSS/SVG, **no chart library**. They must render identically in SSR and on the client and stay light inside WhatsApp's WebView. The rating histogram already exists - `app/components/book/RatingHistogram.vue` (prop `ratings: number[]`) - and is reused as is, not rewritten.

## Implementation requirements

1. `app/components/stats/BarList.vue` - horizontal bar list.
   - Props: `items: { label: string; count: number; to?: string }[]`, `title: string`, `unit?: { one: string; other: string }` (default `{ one: 'livro', other: 'livros' }`).
   - Renders a heading (`<h2>` with `title`) and an `<ol>`; each `<li>` shows the label, the number with its unit (`1 livro`, `3 livros`), and a bar whose width is `count / max * 100%` (the widest item is 100%). When `to` is present the label is a `<NuxtLink>`.
   - The bar is decorative (`aria-hidden="true"`); the number is real text, so a screen reader hears "Tolkien, 3 livros".
   - Long labels wrap; no horizontal scroll at 320px.
   - `items` empty → renders nothing (`v-if` on the root). The page owns the empty state.
2. `app/components/stats/YearColumns.vue` - books per year as vertical columns.
   - Props: `items: { year: number; books: number; pages: number }[]` (ascending), `title: string`, `highlightYear?: number | null`.
   - One column per item, height `books / max * 100%` of a fixed-height track, year below, book count above. `highlightYear` column uses `--highlight` (see `tokens.css`); the others the muted bar colour `RatingHistogram.vue` uses.
   - Each column is a `<NuxtLink>` to `ano/<year>` **relative to the current profile**: build the path from a `basePath: string` prop (e.g. `/@diogo`) → `${basePath}/ano/${year}`. Link `aria-label`: `2024: 12 livros, 3.400 páginas` (number formatting via a fixed `toLocaleString('pt-BR')`-free helper: thousands separator `.` done by hand, so SSR and client match).
   - More columns than fit: the track scrolls horizontally **inside its own container** (`overflow-x: auto`), the page never scrolls sideways. Each column ≥ 44px wide (touch target, `--target-min-size`).
   - `items` empty → renders nothing.
3. Styling: only tokens from `app/assets/css/tokens.css`; scoped styles; `prefers-reduced-motion: reduce` disables any grow-in transition.
4. Tests: `tests/unit/stats-components.test.ts` (`// @vitest-environment happy-dom` first line; mount helper pattern from `tests/unit/rating-histogram.test.ts`; stub `NuxtLink` as a component rendering `<a :href="to">`).

## Explicitly excluded

- Pages, routes, `server/**`, `shared/**`. `RatingHistogram.vue` (reuse, do not edit). `tokens.css` (do not edit). A pie/donut chart. Animations beyond an optional width/height transition.

## Expected files

```
app/components/stats/BarList.vue
app/components/stats/YearColumns.vue
tests/unit/stats-components.test.ts
```

## Acceptance criteria

- [ ] Test: `BarList` with counts `[4, 2, 1]` → three `li`; first bar style width `100%`, second `50%`, third `25%`
- [ ] Test: `BarList` text contains `1 livro` and `4 livros` (singular/plural)
- [ ] Test: `BarList` with `items: []` renders no `ol`
- [ ] Test: `BarList` item with `to` renders an `a` with that `href`; without `to` renders no `a`
- [ ] Test: `YearColumns` with `basePath: '/@diogo'` and years 2023, 2024 → links `/@diogo/ano/2023` and `/@diogo/ano/2024`
- [ ] Test: `YearColumns` `aria-label` for `{ year: 2024, books: 12, pages: 3400 }` is `2024: 12 livros, 3.400 páginas`
- [ ] Test: `YearColumns` with `highlightYear: 2024` marks only that column (a class or `aria-current="page"`)
- [ ] `grep -rn "toLocaleString\|Intl" app/components/stats` returns nothing
- [ ] `grep -rn "v-html" app/components/stats` returns nothing

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
