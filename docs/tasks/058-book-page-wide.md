# TASK-058 - Book page on wide screens

## Context

Visual-audit round of 2026-09-28. Findings and measurements: [visual-audit-2026-09-28.md](../reports/visual-audit-2026-09-28.md). Agent prompt: [PROMPT-frontend-melhorias.md](../agent-prompts/PROMPT-frontend-melhorias.md). Tokens `--danger-text`, `--success`, `--highlight-soft`, `--highlight-glow` and `color-scheme: dark` are already in `tokens.css` (commit 2b4ec2f) - use them, do not edit `tokens.css`. Tasks 049-059 run in parallel; touch only the files listed below.

`.work-card` is capped at `max-width: 900px` (`app/pages/livro/[slug].vue:417`) and renders 680px wide at 1440 (53% of the width empty) and 868px at 1920 (55%). With one rating, `RatingHistogram` draws ten tracks and one bar - noise. `span.genre-chip` uses `padding: 0 10px`, off-scale.

## Implementation requirements

1. At ≥ 1024px: a two-column layout inside a container of `max-width: 1100px`. Left column 280px, `position: sticky; top: var(--space-6)`: cover, title block, rating, histogram, primary action, meta, genres. Right column: "Suas leituras", "Registros de leitura", "Edições cadastradas". Below 1024px the current single column stays exactly as is.
2. Render `RatingHistogram` only when there are ≥ 3 ratings (decide in the page; the component's API does not change).
3. `.genre-chip` padding → `var(--space-1) var(--space-3)`.

## Explicitly excluded

- Data, copy, the actions themselves.

## Expected files

```
app/pages/livro/[slug].vue
```

## Acceptance criteria

- [ ] At 1440 the content spans ≥ 1000px and the left column is sticky (reviewer measures)
- [ ] At 375 the page is visually unchanged (no horizontal scroll, same block order)
- [ ] Histogram absent for a book with 1 rating

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
