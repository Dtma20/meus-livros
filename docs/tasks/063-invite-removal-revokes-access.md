# TASK-063 - Removing an invite revokes access

## Context

Security round of 2026-09-28, finding **M-1** of the pre-deploy review. `removeInvite` (`server/services/invites.ts`) only deletes the `allowed_emails` row. A member who already activated keeps signing in with their password and keeps every open session, because neither `/api/auth/entrar` nor `getSessionUserByHeaders` consults the allowlist. `docs/security.md` §12 presents removing the row as *the* control for a leaked allowlist address, and the admin screen asks only `Remover o convite de <email>?`.

Reviewer's decision (2026-09-28, owner delegated): removing the invite of an activated member **revokes their access** - their open sessions and their password credential are deleted in the same transaction as the allowlist row. Their `users` row and their readings stay; re-inviting them later lets them activate again with a new password through the normal first-access flow (`hasPassword` is false once the credential is gone).

## Implementation requirements

1. In `removeInvite`, inside one `db.transaction`, after deleting the `allowed_emails` row:
   - delete every row of better-auth's `session` table belonging to that address;
   - delete the `account` row with `"providerId" = 'credential'` belonging to that address.
2. **Reach `session` and `account` through `ba_user`, matching on `email`.** `session."userId"` and `account."userId"` reference `ba_user.id`, never `users.id` - the two ids differ for the same person (read "Things that will look like bugs" in `CLAUDE.md`). The better-auth tables are declared privately in `server/services/auth.ts` (`baUser`, `session`, `account`, lines ~27-60): read their column names there and use `db.execute(sql\`...\`)` with quoted camelCase columns from `invites.ts`. Do **not** edit `server/services/auth.ts` (other tasks own it).
3. The admin's own invite still cannot be removed (existing `convite_proprio` check).
4. `app/pages/app/admin/convites.vue`: the confirmation text for a row whose status is activated says the person loses access: `Remover o convite de <email>? A pessoa perde o acesso: as sessões abertas são encerradas e a senha deixa de valer.` Rows that were never activated keep the current text.
5. Log the removal with `logger.info` (module `invites`), with the address redacted by `redactEmail` from `server/utils/email.ts`, and the number of sessions deleted.

## Explicitly excluded

- `server/services/auth.ts`, `server/utils/session.ts`. Deleting the `users` row or the member's readings. Hiding a removed member's public readings. The 5-minute `cookieCache` window (deliberate, documented in `CLAUDE.md`).

## Expected files

```
server/services/invites.ts
app/pages/app/admin/convites.vue
tests/integration/invites.test.ts
```

## Acceptance criteria

- [ ] Integration (`tests/integration/invites.test.ts`, its existing fixtures): an activated invitee with two `session` rows and a `credential` account; after `removeInvite` by the admin, **querying the `session` table** (through `ba_user.email`) returns 0 rows and the `account` credential row is gone. Assert against the tables - never by replaying the cookie (`CLAUDE.md`, cookieCache).
- [ ] Integration: after removal, `POST /api/auth/entrar` (or the service the route calls) with the old handle and password fails the same way a wrong password fails.
- [ ] Integration: another member's sessions are untouched.
- [ ] Removing a never-activated invite still works and deletes no session of anyone.
- [ ] The test fails on today's code.

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` pass (run by the reviewer, not the agent)
