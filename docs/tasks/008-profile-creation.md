# TASK-008 — Profile creation and handle selection

## Goal

After first sign-in, let a user choose a handle and display name, creating their `users` row.

## Context

A better-auth identity exists the moment the OTP verifies, *before* any `users` row. That gap is the real registration gate: no `users` row means every service query returns nothing. The handle becomes a permanent public URL that other people link to, so it must be chosen deliberately.

## Scope

### Included

- `POST /api/users`
- `/app/bem-vindo`
- Handle validation, reserved names, transliteration, collision suggestions
- `PATCH /api/users/me`
- `/app/perfil`

### Explicitly excluded

- Avatar upload (initials only)
- Public profile display (TASK-016)

## Dependencies

- TASK-007

## Expected files/components

```
server/api/users/index.post.ts
server/api/users/me.patch.ts
server/services/users.ts
app/pages/app/bem-vindo.vue
app/pages/app/perfil.vue
shared/schemas/user.ts
```

## Implementation requirements

1. Middleware: an authenticated user with no `users` row is redirected to `/app/bem-vindo` from anywhere in `/app/**`.
2. `POST /api/users` accepts `{ handle, display_name }`.
3. Handle rules: `^[a-z0-9_]{3,20}$`. Reserved: `livro`, `entrada`, `app`, `api`, `entrar`, `admin`, `sobre`, `me`, `sair`, `perfil`, `novo`.
4. **Transliteration is client-side and visible.** `João` becomes `joao` in the input as the user types, so they see and can edit it. Never transliterate silently server-side.
5. On collision return `409` with up to three suggestions (`joao2`, `joao_silva`, `joaos`).
6. Verify allowlist membership again here — this is the second of the two checks.
7. Default `profile_visibility` to `'publico'`. With only two levels, `privado` is an escape hatch; a private default would leave the social product with nothing to show.
8. `PATCH /api/users/me` updates `display_name`, `bio` (≤ 500 chars), `profile_visibility`. **The handle is immutable in the MVP** — changing it breaks every shared link.
9. `/app/perfil` shows the visibility toggle with plain-Portuguese copy explaining what each setting means.

## Data/API changes

- `POST /api/users` → 201 `{ id, handle, display_name }`
- `PATCH /api/users/me` → 200

## UX requirements

- `/app/bem-vindo` explains that the handle becomes a public address and cannot be changed.
- Live preview: `meulivros.app/@joao`.
- Handle availability is checked as the user types, debounced.
- Collision suggestions are clickable.
- The visibility toggle says what it does: *"Público — qualquer pessoa com o link pode ver"* / *"Privado — só você"*.

## Security requirements

- Reserved handles are rejected server-side, not only in the UI.
- Allowlist re-verified at profile creation.
- A second `POST /api/users` from a user who already has a profile returns `409`, never a second row.
- `display_name` and `bio` render escaped everywhere (Vue default; no `v-html`).

## Testing requirements

- Unit: handle validation accepts `joao_123`, rejects `jo`, `João`, `joao-silva`, `admin`, a 21-char string.
- Integration: creating a profile twice returns 409 and leaves exactly one row.
- Integration: a taken handle returns 409 with a non-empty suggestions array.
- Integration: a `users` row is created with `profile_visibility = 'publico'`.
- Integration: `PATCH` cannot change the handle.

## Acceptance criteria

- [ ] After first sign-in, the user lands on `/app/bem-vindo`
- [ ] Typing `João Silva` yields a suggested handle of `joao_silva`
- [ ] Submitting `admin` returns 409
- [ ] Submitting `jo` returns 400
- [ ] Submitting a taken handle returns 409 with ≥1 suggestion
- [ ] A successful submission creates one row with `profile_visibility = 'publico'`
- [ ] A second submission by the same user returns 409 and creates no row
- [ ] An authenticated user with no profile cannot reach `/app/novo`
- [ ] `PATCH /api/users/me` with a `handle` field leaves the handle unchanged
- [ ] A bio of 501 characters returns 400

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Handle immutability is a deliberate MVP simplification. Changing a handle means either breaking every shared link or maintaining redirects, and neither is worth building for 30 people. Say so on the page so nobody is surprised.
