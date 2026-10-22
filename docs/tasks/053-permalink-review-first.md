# TASK-053 - Permalink: the review comes first

## Context

Visual-audit round of 2026-09-28. Findings and measurements: [visual-audit-2026-09-28.md](../reports/visual-audit-2026-09-28.md). Agent prompt: [PROMPT-frontend-melhorias.md](../agent-prompts/PROMPT-frontend-melhorias.md). Tokens `--danger-text`, `--success`, `--highlight-soft`, `--highlight-glow` and `color-scheme: dark` are already in `tokens.css` (commit 2b4ec2f) - use them, do not edit `tokens.css`. Tasks 049-059 run in parallel; touch only the files listed below.

For a visitor at 375×812, `/entrada/{id}` starts the review at y=962, below a 291px `ReadingBlocksSection` that says "224 de 224 páginas lidas (100%)" and "Nenhum trecho com anotação…". For the owner, `.actions-row` (`app/pages/entrada/[id].vue:640`, `flex-wrap: nowrap`) is 343px wide inside a 247px content box and escapes the card by 16px on each side. The card has `padding: 32px` at 375. The "Biblioteca de" label wraps to two lines beside the handle. `#3fb950` at `:682-683` and the owner's `delete-btn` in `--danger` (3.86:1 on the card) are off-token.

## Implementation requirements

1. Render the review section before `ReadingBlocksSection`.
2. `ReadingBlocksSection.vue`: for a **non-owner**, when the log is finished and has zero blocks, render nothing but a single line `Lido por completo · {N} págs.` (or nothing if pages are unknown) - no empty-state prompt, no "Registrar" action. Owner behaviour unchanged.
3. `.actions-row`: `flex-wrap: wrap; justify-content: center`.
4. The article card padding at `max-width: 540px` becomes `var(--space-4)`.
5. The "Biblioteca de" + name + handle line never breaks inside "Biblioteca de" (`white-space: nowrap` on that label; let the line wrap between label and name instead).
6. `#3fb950` → `var(--success)`; text-only danger on the card → `var(--danger-text)`.

## Explicitly excluded

- OG tags, share logic, the edit page.

## Expected files

```
app/pages/entrada/[id].vue
app/components/log/ReadingBlocksSection.vue
tests/unit/ (one new or extended test for requirement 2)
```

## Acceptance criteria

- [ ] Visitor at 375×812 on the 2,505-char review entry: `.review-section` top < 812
- [ ] Owner at 375: every button in `.actions-row` lies within the card's content box
- [ ] Card padding computes 16px below 540px
- [ ] `grep -n "3fb950" 'app/pages/entrada/[id].vue'` returns nothing
- [ ] Unit test: non-owner + finished + no blocks renders the one-line summary and no "Registrar" button

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
