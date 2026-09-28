# TASK-033 - Title and author on the poster card

## Goal

A poster in the grid says which book it is: an overlay on hover/focus on desktop, a caption under the poster on touch screens.

## Context

UX round of 2026-09-27 ([ux-round-2026-09-27.md](../ux-round-2026-09-27.md)), block B.

`app/components/book/BookCard.vue` renders cover + stars. `title` and `author` are already props (used only for `aria-label`). While covers load, or when a cover is missing, the grid is a wall of identical rectangles (`docs/frontend-audit.md`, P2).

## Scope

### Included

- `app/components/book/BookCard.vue` template and styles.

### Explicitly excluded

- Callers of `BookCard` (`@[handle].vue`, dashboard components). No new props.
- `BookCover.vue`, `BookGrid.vue`.

## Dependencies

None.

## Expected files/components

```
app/components/book/BookCard.vue
tests/unit/book-card.test.ts   (new, or extend an existing BookCard test)
```

## Implementation requirements

1. Render title (and author when present) as **visible text** inside the card.
2. `@media (hover: hover) and (pointer: fine)`: the text sits in an overlay at the bottom of the poster (gradient from transparent to `--bg-color`), hidden by default, shown on `:hover` and `:focus-visible` of the card. Use `opacity` + `transform`, not `display`, so it animates and stays in the accessibility tree consistently.
3. `@media (hover: none)`: the text sits **under** the poster, always visible. Title clamped to 2 lines, author to 1, with ellipsis.
4. The card keeps its current `aria-label`; the visible text gets `aria-hidden="true"` so screen readers do not hear the title twice.
5. Nothing interactive inside the `<a>`.
6. Card width must not change; the caption adds height only on touch screens.
7. Colours and spacing from `tokens.css` only.

## Testing requirements

- Unit (`// @vitest-environment happy-dom`): the card renders the title text and the author text; the link keeps its `aria-label`.

## Acceptance criteria

- [ ] `BookCard` renders the title as text in the DOM
- [ ] Visible caption is `aria-hidden="true"`; `aria-label` unchanged
- [ ] No file other than `BookCard.vue` and its test changed
- [ ] At 1440 px the title appears on hover; at 375 px (touch emulation) it is visible under the poster

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer)
