# TASK-054 - Dashboard: content before empty states

## Context

Visual-audit round of 2026-09-28. Findings and measurements: [visual-audit-2026-09-28.md](../reports/visual-audit-2026-09-28.md). Agent prompt: [PROMPT-frontend-melhorias.md](../agent-prompts/PROMPT-frontend-melhorias.md). Tokens `--danger-text`, `--success`, `--highlight-soft`, `--highlight-glow` and `color-scheme: dark` are already in `tokens.css` (commit 2b4ec2f) - use them, do not edit `tokens.css`. Tasks 049-059 run in parallel; touch only the files listed below.

At 375 the member's first screen is "Lendo atualmente" with a dashed empty box and "Minha estante" with a lone 24px "+" button and another dashed box; the finished-books carousel and group activity start below y=812 (`app/pages/index.vue:31,117,119,124`). `ShelfSection.vue` uses `1.05rem` (`:225`) and `11px` (`:252`), off the type scale.

## Implementation requirements

1. When "Lendo atualmente" has no items, render it as one compact row (≤ 56px tall): muted text "Nada em leitura agora" + link "Começar a ler →" to `/app/novo`. Same for "Minha estante" ("Nenhum livro esperando na estante" + "Adicionar livro →" to `/app/novo?tab=novo`). Remove the lone "+" button; its action is the row link.
2. Order: when a section is empty, its compact row renders **after** the carousel and the activity feed; when it has items, it keeps its current place.
3. `ShelfSection.vue`: `1.05rem` → `var(--font-size-lg)`, `11px` → `var(--font-size-xs)`.
4. Loading and error states unchanged.

## Explicitly excluded

- `ReadingCarousel.vue`, `FeedItem.vue` (TASK-055). Data fetching.

## Expected files

```
app/pages/index.vue
app/components/dashboard/ShelfSection.vue
```

## Acceptance criteria

- [ ] With 0 in-progress and 0 shelf books at 375×812, the first carousel cover top < 812 (reviewer measures with `@MeusLivros`)
- [ ] Each empty section renders ≤ 56px tall
- [ ] `grep -n "1.05rem\|11px" app/components/dashboard/ShelfSection.vue` returns nothing

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
