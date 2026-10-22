# TASK-032 - Remove internal wording from user-facing copy

## Goal

No screen mentions "MVP", and no screen shows a domain the app does not have.

## Context

UX round of 2026-09-27 ([ux-round-2026-09-27.md](../reports/ux-round-2026-09-27.md)), block A.

- `app/pages/app/perfil.vue:28`: "O nome de usuário é definitivo e não pode ser alterado no MVP."
- `app/pages/app/bem-vindo.vue:13` and `:58` spell the domain `meulivros.app`. There is no production domain yet, and the landing spells it `meuslivros.app`.

## Scope

### Included

- `app/pages/app/perfil.vue`: that one sentence.
- `app/pages/app/bem-vindo.vue`: the domain references.

### Explicitly excluded

- `app/components/landing/**` - the owner is editing it.
- Any other copy.

## Dependencies

None.

## Expected files/components

```
app/pages/app/perfil.vue
app/pages/app/bem-vindo.vue
```

## Implementation requirements

1. `perfil.vue`: the sentence becomes **"O nome de usuário é definitivo: ele faz parte do endereço do seu perfil e dos links que você já compartilhou."**
2. `bem-vindo.vue`: every place that prints a domain before the handle shows the **current origin** instead, from `useRequestURL().host` resolved in `setup()` (same value on server and client). Example output on localhost: `localhost:3000/@diogo`.
3. Do not hardcode any domain anywhere.

## Testing requirements

- Existing tests that assert these strings are updated; no new test required.

## Acceptance criteria

- [ ] `grep -rn "MVP" app/pages app/components --include=*.vue` returns nothing outside `app/components/landing/`
- [ ] `grep -rn "meulivros.app\|meuslivros.app" app/pages` returns nothing
- [ ] `bem-vindo.vue` uses `useRequestURL()`

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer)
