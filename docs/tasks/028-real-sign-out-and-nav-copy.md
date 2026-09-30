# TASK-028 - Real sign-out and member nav copy

## Goal

"Sair" ends the session. The member nav names the action it performs.

## Context

UX round of 2026-09-27 ([ux-round-2026-09-27.md](../reports/ux-round-2026-09-27.md)), block A.

`app/layouts/app.vue:10` renders "Sair" as `<NuxtLink to="/entrar">`. Nothing in `app/**` calls better-auth's `sign-out`, so a member who taps "Sair" on a borrowed phone stays signed in. `/api/auth/sign-out` is already on the allowlist in `server/services/auth.ts`.

The nav also says "Cadastrar livro" for a link whose page (after TASK-029) is where you **register a reading**. "Cadastrar" is reserved for adding a work to the catalog.

## Scope

### Included

- `app/layouts/app.vue`: "Sair" becomes a `<button type="button">` styled like the other nav links that signs out.
- Nav label `Cadastrar livro` → `Registrar leitura` (same `href`, `/app/novo`).
- Update the nav assertions in `tests/unit/routes.test.ts` that check these labels.

### Explicitly excluded

- New nav entries (Membros, Atividade) and the mobile bottom nav - TASK-037.
- The header search - TASK-031.
- Any change to `server/services/auth.ts` or the auth allowlist.
- Labels outside `app/layouts/app.vue`.

## Dependencies

None.

## Expected files/components

```
app/layouts/app.vue
tests/unit/routes.test.ts   (nav label assertions only)
```

## Implementation requirements

1. On click: `await authClient.signOut()` (`app/utils/auth-client.ts`), with a bounded wait - if it has not settled in 10 s, continue anyway.
2. Then reset the shared session state: `useState('auth:session')` → `{ user: null, fetched: false }`. Resolve `useState` in `setup()`, not inside the handler after an `await` (see `docs/agent-workflow.md`, NUXT_E1001).
3. Then leave with a **full navigation** to `/` (`window.location.assign('/')` or `navigateTo('/', { external: true })`), so no client-side state from the member session survives.
4. While signing out the button is disabled and reads "Saindo…".
5. A failed sign-out request still clears local state and navigates - the user asked to leave.

## Security requirements

- The sign-out goes through better-auth's own endpoint. Do not delete cookies by hand from JS.

## Testing requirements

- Unit: the nav renders `Registrar leitura` → `/app/novo`, `Perfil`, and a `button` named `Sair` (not a link to `/entrar`).

## Acceptance criteria

- [ ] `grep -n 'to="/entrar"' app/layouts/app.vue` returns nothing
- [ ] `grep -rn "signOut" app/layouts/app.vue` matches
- [ ] Nav shows "Registrar leitura" linking to `/app/novo`
- [ ] After clicking "Sair", `GET /api/users/me` from the same browser answers 401
- [ ] `tests/unit/routes.test.ts` asserts the new labels

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer)
