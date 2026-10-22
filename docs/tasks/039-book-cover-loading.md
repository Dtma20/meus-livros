# TASK-039 - Cover placeholder while the image loads

## Context

Frontend round of 2026-09-27. Agent prompt: [PROMPT-frontend-melhorias.md](../agent-prompts/PROMPT-frontend-melhorias.md). Runs in parallel with the other tasks 039-048; touch only the files listed below.

A lazy cover shows an empty `--card-bg` rectangle until it arrives; at 1440px the first paint of a profile showed 9 of 12 cards blank (`docs/frontend-audit.md`, P2). `app/components/book/BookCover.vue` is a bare `<img>` with an `@error` fallback chain (https `cover_url` → `olCoverId` → `isbn13` → SVG placeholder).

## Implementation requirements

- The poster area shows a subtle placeholder until the image fires `load`: `var(--card-bg)` base plus a slow shimmer (gradient on `var(--input-bg)`), then the image fades in (≤ 200ms opacity).
- `prefers-reduced-motion: reduce` → no shimmer, no fade; the placeholder is a flat colour.
- An image already complete on mount (cached, or SSR-hydrated) must not flash: check `img.complete && img.naturalWidth > 0` in `onMounted`.
- The fallback chain and the SVG placeholder on error stay exactly as they are.
- No layout shift: the component keeps filling its parent (the parent sets the 2/3 aspect ratio).

## Explicitly excluded

- Props, emits and the `alt` requirement unchanged.
- `BookCard.vue`, `BookGrid.vue`, any caller.

## Expected files

```
app/components/book/BookCover.vue
tests/unit/book-cover.test.ts   (new, or extend an existing BookCover test)
```

## Acceptance criteria

- [ ] Before `load`, the rendered element carries a loading state (class or data attribute) and shows the shimmer
- [ ] After `load` the loading state is gone
- [ ] Under `prefers-reduced-motion: reduce` no `animation` or `transition` is active
- [ ] On `error`, the existing fallback chain still runs (test: first src errors → next src)
- [ ] `grep -n "defineProps" -A10 app/components/book/BookCover.vue` shows the same props as before

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
