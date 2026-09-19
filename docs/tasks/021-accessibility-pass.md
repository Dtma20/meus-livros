# TASK-021 — Accessibility pass

> Carried over from TASK-001 review: the document has no `lang`. Set `app.head.htmlAttrs.lang` to `pt-BR` in `nuxt.config.ts` — the whole UI is Portuguese and screen readers currently guess.

## Goal

Make the app usable by keyboard and screen reader.

## Context

The legacy grid is **unusable** with a screen reader: cards are `<div @click>` with no role, and cover images have no `alt` attribute at all. Fixing this is correctness, not a feature — and the same fixes make cards middle-clickable and shareable, which matters for a product built around sharing links.

## Scope

### Included

- Semantic markup for cards and modals
- `alt` text everywhere
- Keyboard operability
- Focus management
- Contrast verification

### Explicitly excluded

- A full WCAG AA audit
- Screen-reader testing on every platform

## Dependencies

- TASK-016

## Expected files/components

Touches most components. No new files.

## Implementation requirements

1. **Cards become `<a href>`**, not `<div @click>`. Keyboard-reachable, middle-clickable, and they show a real URL on hover.
2. Every cover `<img>` gets `alt="Capa de {title}, de {author}"`. Decorative images get `alt=""`.
3. Modals: focus trap, **Escape closes** (the legacy app does not), focus restored to the trigger on close, `role="dialog"` + `aria-modal="true"`, and the close control is a `<button aria-label="Fechar">` rather than a `<span>`.
4. `StarRating` display: `role="img"` with `aria-label="4,5 de 5 estrelas"` (pt-BR decimal comma).
5. `RatingInput`: a real radio group, arrow-key operable, with a visible focus ring.
6. Every form input has an associated `<label>`. Errors use `aria-describedby` and `aria-invalid`.
7. Visible focus rings everywhere. **Do not remove outlines** without replacing them.
8. Headings form a sensible order — one `h1` per page, no skipped levels.
9. `lang="pt-BR"` on `<html>`.
10. Verify contrast: the existing `--text-color: #9ab` on `--bg-color: #14181c` is ~6.6:1 and passes AA. Any new colour must be checked.
11. A "pular para o conteúdo" skip link.

## Data/API changes

None.

## UX requirements

- The whole app is operable with a keyboard alone: sign in, search, log a book, navigate.
- Focus is never lost or trapped unexpectedly.
- Focus state is always visible.

## Security requirements

None specific. Note that `alt` text contains user-supplied titles and must be escaped like any other output.

## Testing requirements

- Manual: complete sign-in → search → log a book using only the keyboard.
- Manual: navigate a profile with a screen reader (NVDA or VoiceOver) and confirm cards announce title and author.
- Automated: `axe-core` against `/`, `/@handle`, `/livro/{slug}`, `/entrada/{id}` — zero critical violations.
- Automated: every `<img>` in rendered output has an `alt` attribute.

## Acceptance criteria

- [ ] Sign in, search, and log a book can be completed with the keyboard alone
- [ ] Every `<img>` has an `alt` attribute; covers name the title and author
- [ ] Book cards are `<a>` elements, focusable and middle-clickable
- [ ] Escape closes any open modal and returns focus to the trigger
- [ ] Modal close controls are `<button>` with an accessible name
- [ ] The rating input is operable with arrow keys
- [ ] Every input has an associated label
- [ ] `axe-core` reports zero critical violations on the four public routes
- [ ] Focus rings are visible on every interactive element
- [ ] `<html lang="pt-BR">`
- [ ] A screen reader announces a book card as its title and author

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Changing cards from `<div @click>` to `<a href>` is the single highest-value fix here and it also improves the product for sighted mouse users — middle-click to open in a new tab is exactly what people do when browsing a friend's shelf.
