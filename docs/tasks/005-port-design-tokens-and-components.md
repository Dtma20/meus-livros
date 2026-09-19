# TASK-005 — Port design tokens and base components

## Goal

Extract the existing visual language from `legacy/index.html` and `legacy/styles.css` into Vue components and CSS tokens.

## Context

This is **real work, not a copy-paste**. The existing file is one 421-line `setup()` block with no component boundaries. The discovery documents described it as porting "almost verbatim"; that is false, and the honest estimate is half a day to a day. The visual language itself is good and should be preserved.

## Scope

### Included

- `assets/css/tokens.css` from the existing `:root`
- `BookCover.vue`, `BookCard.vue`, `BookGrid.vue`, `StarRating.vue`, `ReviewText.vue`, `EmptyState.vue`
- Responsive grid

### Explicitly excluded

- Pages (TASK-006)
- `FilterBar` (TASK-016)
- `ReadingMap` (TASK-025)
- Data fetching of any kind — these components take props

## Dependencies

- TASK-001

## Expected files/components

```
app/assets/css/tokens.css
app/components/book/{BookCover,BookCard,BookGrid,StarRating}.vue
app/components/log/ReviewText.vue
app/components/ui/EmptyState.vue
```

## Implementation requirements

1. Port the seven `:root` tokens unchanged (`--bg-color: #14181c` etc.). Add a spacing scale, a type scale, radii and `--danger`.
2. `StarRating.vue`: display mode from `legacy/index.html:385` (`★` repeated, `½` for halves). Props `{ rating: number | null }`. Renders nothing when null. Exposes `role="img"` with an `aria-label` like `"4,5 de 5 estrelas"` (pt-BR decimal comma).
3. `BookCover.vue`: fallback chain per [book-catalog.md](../book-catalog.md) §5 — `cover_url` → `ol_cover_id` → ISBN **with `?default=false`** → inline SVG initials. Requires an `alt` prop; no default.
   - The `?default=false` is load-bearing: without it Open Library returns HTTP 200 with a 43-byte blank GIF and `onerror` never fires.
   - The placeholder is a locally generated inline SVG data URI, **not `ui-avatars.com`** — no third-party dependency.
4. `BookCard.vue`: renders as an `<a>`, not `<div @click>`. Keyboard-reachable and middle-clickable.
5. `ReviewText.vue`: renders plain text via `{{ }}` with `white-space: pre-wrap`. **Must not contain `v-html`.**
6. `BookGrid.vue`: 2 columns under 600px, 4 under 900px, 6 above. 16px gutters, no horizontal scroll at 320px.
7. All components are presentational — props in, events out, no fetching, no store.

## Data/API changes

None.

## UX requirements

- Dark theme only.
- Visible focus rings on every interactive element. Do not remove outlines.
- Text contrast at least AA (the existing `#9ab` on `#14181c` is ~6.6:1 — keep it).
- Covers use `loading="lazy"`.

## Security requirements

- `ReviewText` must never use `v-html`; the lint rule enforces it.
- `BookCover` must reject a `src` whose scheme is not `https:` or `data:` and fall back to the placeholder — a `javascript:` URL in `cover_url` must not reach `<img src>`.

## Testing requirements

- `StarRating`: 4.5 renders `★★★★½`; 3 renders `★★★`; `null` renders nothing.
- `BookCover`: with only an ISBN, `src` ends with `?default=false`; with nothing, `src` starts with `data:image/svg+xml`.
- `BookCover`: a `cover_url` of `javascript:alert(1)` renders the placeholder.
- `ReviewText`: input `<b>oi</b>` renders the literal string, and the DOM contains no `<b>` element.

## Acceptance criteria

- [ ] All six components render in isolation with mock props
- [ ] `StarRating` with 4.5 produces exactly `★★★★½`
- [ ] `BookCover` with no cover data produces an inline SVG data URI containing the title's initials
- [ ] `BookCover` ISBN URLs contain `?default=false`
- [ ] `ReviewText` with `<script>alert(1)</script>` shows that text literally and executes nothing
- [ ] `grep -r "v-html" app/` returns nothing
- [ ] `grep -r "ui-avatars" app/` returns nothing
- [ ] At a 320px viewport there is no horizontal scroll
- [ ] Every `<img>` has a non-empty `alt`

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Keep `legacy/index.html` open beside you. The CSS is good; the goal is to preserve the look exactly while changing the structure underneath.

Budget this at 4 hours, not 1. Decomposing a monolithic `setup()` always takes longer than it looks.
