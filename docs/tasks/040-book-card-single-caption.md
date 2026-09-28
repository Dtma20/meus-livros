# TASK-040 - One caption element in BookCard

## Context

Frontend round of 2026-09-27. Agent prompt: [PROMPT-frontend-melhorias.md](../PROMPT-frontend-melhorias.md). Runs in parallel with the other tasks 039-048; touch only the files listed below.

TASK-033 renders the title and author twice in `app/components/book/BookCard.vue`: an `.overlay` (desktop, on hover) and a `.caption` (touch, under the poster), each with its own copy of the clamp CSS. Two DOM copies of the same text, hidden by media query, is what `docs/PROMPT-frontend-melhorias.md` asked to unify.

## Implementation requirements

- A single text block (`title` 2-line clamp, `author` 1-line clamp) rendered once.
- `@media (hover: hover) and (pointer: fine)`: that block is absolutely positioned over the bottom of the poster with the existing gradient, hidden (`opacity: 0`) until `:hover` / `:focus-visible` of the card.
- `@media (hover: none)`: the same block sits in normal flow under the poster, always visible.
- Keep `aria-hidden="true"` on it and the card's current `aria-label` (it already includes the rating with a decimal comma).
- Keep the `prefers-reduced-motion` handling.

## Explicitly excluded

- Props of `BookCard`. `BookCover`, `BookGrid`, callers.

## Expected files

```
app/components/book/BookCard.vue
tests/unit/book-card.test.ts
```

## Acceptance criteria

- [ ] The title text occurs exactly once in the rendered HTML of a card
- [ ] `grep -c "line-clamp" app/components/book/BookCard.vue` is at most 2 (one per line of text, no duplicate blocks)
- [ ] The card's `aria-label` is unchanged for a rated book (`"Título, de Autor (4,5 de 5 estrelas)"`)
- [ ] The text block is `aria-hidden="true"`

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
