# TASK-037 - Mobile bottom navigation and new nav entries

## Goal

On a phone, the four things a member does are one thumb away: Início, Atividade, Registrar, Perfil. On desktop the header links to the new pages.

## Context

UX round of 2026-09-27 ([ux-round-2026-09-27.md](../ux-round-2026-09-27.md)), wave 2.

The cohort uses the site from WhatsApp's in-app browser on Android. Header links today are small (`docs/frontend-audit.md`: 19 px tall).

## Scope

### Included

- `app/layouts/app.vue`: desktop nav gains "Atividade" and "Membros"; a fixed bottom bar under 768 px.

### Explicitly excluded

- The anonymous layout.
- PWA, icons packages, new dependencies.

## Dependencies

**TASK-028, TASK-031, TASK-035, TASK-036 merged.** Do not start before.

## Expected files/components

```
app/layouts/app.vue
tests/unit/routes.test.ts   (nav assertions)
```

## Implementation requirements

1. **≥ 768 px** header nav: `Atividade` (`/atividade`), `Membros` (`/membros`), `+ Registrar leitura` (`/app/novo`, visually primary), `Perfil`, `Sair` (the TASK-028 button).
2. **< 768 px**: header nav reduces to `Sair`; a `<nav aria-label="Navegação inferior">` fixed to the bottom with five items - Início `/`, Atividade `/atividade`, **Registrar** `/app/novo` (centre, emphasised), Membros `/membros`, Perfil `/@<handle>`. Each item: inline SVG icon + label, ≥ 48 px tall.
3. Active item via `aria-current="page"` (NuxtLink exact-active).
4. Respect `env(safe-area-inset-bottom)`; add bottom padding to the page so the bar never covers content.
5. Breakpoint in CSS only - same DOM on server and client.

## Acceptance criteria

- [ ] At 375 px a bottom nav with 5 links is visible and no content is hidden behind it at the end of `/@<handle>`
- [ ] At 1440 px the header shows Atividade, Membros, Registrar leitura, Perfil, Sair
- [ ] Each bottom item's box is ≥ 48 px tall
- [ ] No hydration warning in the console on a full reload of `/` signed in

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer)
