# TASK-055 - Type scale and nav spacing

## Context

Visual-audit round of 2026-09-28. Findings and measurements: [visual-audit-2026-09-28.md](../reports/visual-audit-2026-09-28.md). Agent prompt: [PROMPT-frontend-melhorias.md](../agent-prompts/PROMPT-frontend-melhorias.md). Tokens `--danger-text`, `--success`, `--highlight-soft`, `--highlight-glow` and `color-scheme: dark` are already in `tokens.css` (commit 2b4ec2f) - use them, do not edit `tokens.css`. Tasks 049-059 run in parallel; touch only the files listed below.

Off-scale sizes in regular use: site title `1.35rem`/`1.15rem` (`app/layouts/default.vue:97,216` → 21.6/18.4px), stars `0.9rem` (`StarRating.vue:37` → 14.4px), card/feed titles `1.05rem` (`FeedItem.vue:122`), carousel `11px` (`ReadingCarousel.vue:275,282`). The dashboard shows 11 distinct sizes at 375. Off-scale spacing clusters in the nav: `padding: 4px 10px` on `.nav-link` and `.site-title`, `.bottom-nav-link padding 6px 2px, gap 3px`. "Sair" renders 16px while the other nav links render 14px.

## Implementation requirements

1. Site title: `var(--font-size-xl)` desktop, `var(--font-size-lg)` below 600px.
2. Stars: `var(--font-size-sm)`.
3. `FeedItem` title `1.05rem` → `var(--font-size-lg)`; `ReadingCarousel` `11px` → `var(--font-size-xs)`.
4. `.nav-link`, `.site-title`: horizontal padding `var(--space-3)`, vertical `var(--space-1)` (TASK-048's 44px min-height stays). `.nav-btn` ("Sair") gets the same `font-size` as `.nav-link`.
5. `.bottom-nav-link`: `padding: var(--space-2) var(--space-1)`, `gap: var(--space-1)`.
6. Do not change layout or colour.

## Explicitly excluded

- `ShelfSection.vue` (TASK-054), `BookCard.vue` (TASK-056), pages.

## Expected files

```
app/layouts/default.vue
app/layouts/app.vue
app/components/book/StarRating.vue
app/components/dashboard/ReadingCarousel.vue
app/components/feed/FeedItem.vue
```

## Acceptance criteria

- [ ] `grep -rnE "font-size: *(1\.35rem|1\.15rem|0\.9rem|1\.05rem|11px)" app/layouts app/components/book/StarRating.vue app/components/dashboard/ReadingCarousel.vue app/components/feed/FeedItem.vue` returns nothing
- [ ] On `/atividade` at 375 and 1440, at most 6 distinct computed font sizes, excluding the Nuxt DevTools overlay (reviewer measures)
- [ ] "Sair" and "Perfil" compute the same font-size

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
