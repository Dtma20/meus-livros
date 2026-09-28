# TASK-031 - Search in the header

## Goal

A book search is reachable from every page, for members and visitors, the way Letterboxd's header search is.

## Context

UX round of 2026-09-27 ([ux-round-2026-09-27.md](../ux-round-2026-09-27.md)), block A.

The only search in the app lives inside `LogForm`, which no page shows. `GET /api/search` already accepts anonymous callers (`server/api/search/*.ts` resolves `viewer` as `null`). `SearchBox` with `navigateOnSelect` (default `true`) already navigates to `/livro/<slug>` on select.

The footer line "Dados bibliográficos parcialmente do Open Library" is ungrammatical (`docs/frontend-audit.md`) and no longer true: Open Library search was removed on 2026-09-24; only cover images still come from it.

## Scope

### Included

- New `app/components/search/HeaderSearch.vue`
- `app/layouts/default.vue`: place `HeaderSearch` in the header; fix the footer line.

### Explicitly excluded

- **Do not modify `SearchBox.vue`.** Wrap it.
- `app/layouts/app.vue` (TASK-028) and the mobile bottom nav (TASK-037).
- Searching users. Works only.
- Any server change.

## Dependencies

None.

## Expected files/components

```
app/components/search/HeaderSearch.vue   (new)
app/layouts/default.vue
```

## Implementation requirements

1. **≥ 768 px:** `HeaderSearch` renders `SearchBox` inline between the logo and the nav, max-width ~360 px, taking the free space.
2. **< 768 px:** it renders a search icon button (`aria-label="Buscar livros"`, ≥ `--target-min-size`). Tapping it opens a full-width row under the header containing `SearchBox`, focused. `Esc` or a close button (`aria-label="Fechar busca"`) closes it and returns focus to the icon.
3. Selecting a result navigates to `/livro/<slug>` (SearchBox default) and closes the mobile row.
4. The breakpoint decision is CSS (`@media`), not `matchMedia` in JS, so SSR and hydration render the same DOM.
5. Hide `HeaderSearch` on `/entrar/**` (read `useRoute().path` in setup).
6. Footer text becomes **"Capas de livros via Open Library"**.
7. The results dropdown must sit above page content (`z-index` from tokens if one exists; otherwise a local value, reported in DECISOES).

## UX requirements

- No horizontal scroll at 320 px with the header search present.
- The skip link and `<main id="conteudo-principal">` stay as they are.

## Testing requirements

- Unit (`// @vitest-environment happy-dom`, stubs as in `tests/unit/routes.test.ts`): the default layout renders a search control; on `/entrar` it does not.

## Acceptance criteria

- [ ] `app/layouts/default.vue` renders `HeaderSearch`
- [ ] `git diff --stat` does not list `SearchBox.vue`
- [ ] At 375 px the header shows an icon button, and tapping it reveals a focused search input
- [ ] Footer reads "Capas de livros via Open Library"
- [ ] `/entrar` shows no header search

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer)
