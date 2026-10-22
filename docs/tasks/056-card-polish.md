# TASK-056 - Aligned stars and a placeholder that looks like a book

## Context

Visual-audit round of 2026-09-28. Findings and measurements: [visual-audit-2026-09-28.md](../reports/visual-audit-2026-09-28.md). Agent prompt: [PROMPT-frontend-melhorias.md](../agent-prompts/PROMPT-frontend-melhorias.md). Tokens `--danger-text`, `--success`, `--highlight-soft`, `--highlight-glow` and `color-scheme: dark` are already in `tokens.css` (commit 2b4ec2f) - use them, do not edit `tokens.css`. Tasks 049-059 run in parallel; touch only the files listed below.

In one grid row at 375, cards measure 328px and 314px because one title takes two lines and the other one, so the stars sit at different heights. A cover that fails renders the SVG built at `BookCover.vue:86`: flat `#2c3440` with two grey initials, which reads as a broken image next to real covers. A broken cover's `alt` would render in UA link blue because nothing sets `color` on the image.

## Implementation requirements

1. `BookCard.vue`: the stars row aligns across a grid row. Make the card a column flex with the stars (`.info`) at `margin-top: auto`, **and** give the touch caption a `min-height` of two title lines + one author line so short titles reserve the space. Desktop overlay unchanged.
2. `BookCover.vue` placeholder SVG (2:3 viewBox): vertical gradient `#232a31`→`#2c3440` (token values; `var()` cannot live in a data URI), a 4px `#f59e0b` spine on the left, the **title** in a serif stack (`Lora, Georgia, serif`), white at 85% opacity, wrapped to at most 3 lines of ~14 characters (split on spaces in JS; escape `& < > " '`), and the author below in a sans stack, `#99aabb`. When there is no title, keep the initials fallback.
3. `.book-cover-img { color: var(--text-color); }` so alt text is never UA blue.
4. SSR and client must build the same SVG string (no `Intl`, no randomness).

## Explicitly excluded

- Props of either component. TASK-039's shimmer/loading logic.

## Expected files

```
app/components/book/BookCard.vue
app/components/book/BookCover.vue
tests/unit/book-cover.test.ts
tests/unit/book-card.test.ts
```

## Acceptance criteria

- [ ] In any row of `/@MeusLivros` at 375, every `.info` has the same `getBoundingClientRect().top` (±1px) (reviewer measures)
- [ ] Unit test: placeholder SVG for "O retorno do rei" contains the escaped title text and `#f59e0b`
- [ ] Unit test: a title with `&` and `<` is escaped in the SVG
- [ ] Placeholder uses no colour outside the token values listed above

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
