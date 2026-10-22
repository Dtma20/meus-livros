# TASK-038 - Admin page for invites

## Goal

An admin adds and removes invited e-mail addresses from the site, instead of by hand in SQL.

## Context

Registration is invite-only: `POST /api/auth/email-otp/send-verification-otp` sends a code only if the address is in `allowed_emails` (`server/services/auth.ts` → `isEmailAllowed`). For any other address it answers `{ success: true }` and sends nothing, by design, so a stranger cannot learn who is invited. Today the only way to invite is an `INSERT` by hand, and on 2026-09-27 the owner spent days waiting for codes to addresses that were never in the table.

`users.is_admin` already exists (migration `0005_admin_flag.sql`, commit `1e69281`, `boolean NOT NULL DEFAULT false`). **Do not change the schema or add a migration.**

`allowed_emails` columns: `email citext NOT NULL` (PK), `invited_by uuid NULL`, `note text NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.

## Scope

### Included

- `server/utils/session.ts`: new `requireAdmin(event)`.
- New service `server/services/invites.ts`.
- New routes under `server/api/admin/convites/`.
- New shared Zod schema `shared/schemas/invites.ts`.
- New page `app/pages/app/admin/convites.vue`.
- `server/api/users/me.get.ts`: add `is_admin` to the response.
- `app/pages/app/perfil.vue`: a "Gerenciar convites" link, shown only when `is_admin`.
- Integration tests.

### Explicitly excluded

- Promoting/demoting admins from the UI (done by SQL for now).
- Sending an invitation e-mail. The admin tells the person out of band; the person goes to `/entrar/ativar`.
- Changes to `server/services/auth.ts`, the allowlist gate, or the OTP flow.
- Nav or layout changes.

## Dependencies

None (the column is merged).

## Expected files/components

```
server/utils/session.ts
server/services/invites.ts                 (new)
server/api/admin/convites/index.get.ts     (new)
server/api/admin/convites/index.post.ts    (new)
server/api/admin/convites/index.delete.ts  (new)
shared/schemas/invites.ts                  (new)
server/api/users/me.get.ts
app/pages/app/admin/convites.vue           (new)
app/pages/app/perfil.vue                   (one link)
tests/integration/invites.test.ts          (new)
```

## Data/API changes

All three routes: session required, admin required.

- `GET /api/admin/convites` → `{ invites: InviteView[] }`, newest first.
- `POST /api/admin/convites` body `{ email, note? }` → `201 { invite: InviteView }`.
- `DELETE /api/admin/convites` body `{ email }` → `204`. The e-mail goes in the body, not the path.

```ts
interface InviteView {
  email: string
  note: string | null
  created_at: string
  invited_by_handle: string | null
  status: 'pendente' | 'ativado'   // 'ativado' when ba_user has that email AND account.password is not null
  has_profile: boolean             // a users row exists with that email
}
```

## Implementation requirements

1. `requireAdmin(event)`: calls `requireSessionUser` (so anonymous → **401**), then loads the user's `is_admin` **in the query** (`WHERE id = $1 AND is_admin = true`). Not admin → **404** `{ error: 'nao_encontrado', message: 'Página não encontrada.' }` - per CLAUDE.md a private resource returns 404, never 403. The db query lives in a service function (only `server/services/**` imports `db`); `session.ts` calls it.
2. `shared/schemas/invites.ts`: `email` trimmed, lower-cased, `z.string().email().max(254)`; `note` optional, trimmed, max 200, empty string → null.
3. `addInvite`: insert with `invited_by = admin id`. Already present → **409** `{ error: 'convite_existente', message: 'Este e-mail já está na lista de convites.' }` (catch the unique violation the way `server/services/catalog.ts` does, via SQLSTATE `23505` on `cause`).
4. `removeInvite`: an admin cannot remove **their own** address → **400** `{ error: 'convite_proprio', message: 'Você não pode remover o seu próprio convite.' }`. Unknown address → 404. Removing an invite does **not** delete the account or profile; it only stops new codes and password resets.
5. `listInvites`: one query with `LEFT JOIN`s (no N+1) to compute `status`, `has_profile` and `invited_by_handle`. `ba_user` / `account` are better-auth tables: `ba_user.email` matches, `account."userId"` references `ba_user.id` (see the landmine in CLAUDE.md - never join `session`/`account` to `users.id`).
6. Routes use `defineApiHandler` + `parseOrThrow`; bodies via `readBody`.
7. Page `/app/admin/convites`: `definePageMeta({ layout: 'app', middleware: 'auth' })`, title "Convites". Loads with `useRequestFetch` + `await useAsyncData`. A 404 from the API renders the same not-found `EmptyState` a stranger would see (no hint that the page exists).
   - Form: "E-mail" + "Observação (opcional)" + button "Convidar". On success the row appears at the top and the form clears; 409 shows its message under the field.
   - List: e-mail, observação, "convidado por @handle", date (`formatFullDate`), a status badge "Pendente" / "Ativado", and a "Remover" button that asks `confirm('Remover o convite de <email>?')`. The admin's own row has no Remover button.
   - Helper text above the form, in pt-BR: "Quem estiver nesta lista pode ativar a conta em /entrar/ativar. O código chega por e-mail em até um minuto; peça para conferir o spam."
   - Empty, error and loading states from `app/components/ui/`. Client fetches get `timeout` (and `retry: 0` on GET).
8. `me.get.ts`: add `is_admin: user.is_admin`. `perfil.vue`: if `is_admin`, a link "Gerenciar convites" → `/app/admin/convites`.

## Security requirements

- Non-admin with a session: every `/api/admin/convites` method → 404, and nothing is written.
- Anonymous: 401.
- Never log full e-mail addresses; use `redactEmail` from `server/utils/email.ts` if logging.
- Admin status is read from the database on every request, never from the client or the cookie cache.

## Testing requirements

Integration (`describe.skipIf(!process.env.DATABASE_URL)`, fixtures via `removeFixtures(MARKER)` with the marker in every e-mail, handle and note; 30 s timeout; call the services and `requireAdmin` directly with a mocked event the way other integration tests do, or through the route handler):

- anonymous → 401; non-admin → 404 on GET, POST and DELETE, and the POST did not insert;
- admin adds → listed with status `pendente`; duplicate → 409;
- admin removes another invite → gone; removing own → 400;
- invalid e-mail → 400.

## Acceptance criteria

- [ ] Non-admin gets 404 on all three methods; anonymous gets 401
- [ ] Admin can add, list and remove; duplicate is 409; own removal is 400
- [ ] `status` is `ativado` only when a better-auth account with a password exists for that e-mail
- [ ] `/api/users/me` includes `is_admin`
- [ ] `/app/admin/convites` works for the admin and looks like a not-found page to anyone else
- [ ] No file under `server/db/` changed

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer)
