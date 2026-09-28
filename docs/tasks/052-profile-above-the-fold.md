# TASK-052 - Profile: books above the fold, quieter handle

## Context

Visual-audit round of 2026-09-28. Findings and measurements: [visual-audit-2026-09-28.md](../visual-audit-2026-09-28.md). Agent prompt: [PROMPT-frontend-melhorias.md](../PROMPT-frontend-melhorias.md). Tokens `--danger-text`, `--success`, `--highlight-soft`, `--highlight-glow` and `color-scheme: dark` are already in `tokens.css` (commit 2b4ec2f) - use them, do not edit `tokens.css`. Tasks 049-059 run in parallel; touch only the files listed below.

At 1440×900 the reading map is 770px tall and the first cover starts at y=1195; at 1920 the map is 1008px and the first cover at y=1577. Blur test: the amber map and the amber `@handle` (32px/700, `app/pages/@[handle].vue:564-567`) dominate the page, not the books.

## Implementation requirements

1. `ReadingMap.vue`: the map area is at most `320px` tall at every width (keep aspect with `preserveAspectRatio="xMidYMid meet"` on the SVG, centred). Keep the title row and the unmapped-country note. The click-to-filter behaviour is unchanged.
2. `@[handle].vue` `.handle`: `font-size: var(--font-size-lg)`, `font-weight: 500`, `color: var(--text-color)`; on `:hover`/`:focus-visible` `color: var(--highlight)`. The display name stays the dominant heading.
3. No other change to the page (TASK-043's stats and TASK-042's filters stay as they are).

## Explicitly excluded

- The map geometry file, the grid, filters, diary.

## Expected files

```
app/components/profile/ReadingMap.vue
app/pages/@[handle].vue
```

## Acceptance criteria

- [ ] At 1440×900 and 1920×1000, the first `a.card` top < viewport height (reviewer measures)
- [ ] `button.handle` computes font-size ≤ 18px and color `rgb(153, 170, 187)` at rest
- [ ] Clicking a country still filters the grid

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
