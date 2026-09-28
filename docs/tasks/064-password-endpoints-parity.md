# TASK-064 - Password endpoints: one rule, a rate limit, no wasted scrypt

## Context

Security round of 2026-09-28, findings **B-3** and **B-4** of the pre-deploy review, plus a defect the reviewer measured in `shared/schemas/auth.ts`.

- **B-3.** `isForbiddenPassword` receives `handle` only in change-password. Reset (`/email-otp/reset-password`) calls it with `{ email }` alone, so a member can reset their password to their own handle, against `docs/security.md` §4.1. (Set-password runs before the member has a `users` row, so there is no handle to compare there - that is not a defect.)
- **B-4.** `/set-password` has no rate limit, and better-auth hashes the password (`update-user.mjs:217`) before refusing with `PASSWORD_ALREADY_SET` (`:231`). Any valid session can make the server run scrypt without limit.
- **`emailSchema`.** `z.email().trim().toLowerCase()` validates **before** trimming: measured on 2026-09-28, `' A@B.co '` fails with `invalid_format` and `'A@B.co'` passes as `'a@b.co'`. The `.trim()` does nothing. The forms trim by hand, so users are not hit today; any direct API caller is.

## Implementation requirements

1. `server/services/auth.ts`, branch `/email-otp/reset-password`: look up the `users` row by the (normalised) email and pass its `handle` to `isForbiddenPassword` when it exists. The response for a forbidden password stays the current `400 validacao` for every address, whether or not a `users` row exists.
2. `server/services/auth.ts`, branch `/set-password`, after the session check and before calling better-auth:
   - rate limit with `checkRateLimit` from `server/services/rate-limit.ts` (call it, do not edit that file): key `setpw:email:<sessionEmail>`, 10 per hour; over the limit → `429` with the `muitas_tentativas` body the other branches return;
   - if `hasPassword(sessionEmail)` is already true, answer the existing `400 { error: 'validacao', message: 'Não foi possível definir a senha.' }` without calling better-auth.
3. `shared/schemas/auth.ts`: `emailSchema` trims and lower-cases **before** validating (`z.string().trim().toLowerCase().pipe(z.email({ error: 'Informe um e-mail válido.' }))` or equivalent in zod 4). Keep the pt-BR message for a non-string and for a bad format. Check every importer of `emailSchema` (`grep -rn emailSchema app server shared tests`) still type-checks with the new schema type.

## Explicitly excluded

- The branches `/entrar`, `/sign-in/email-otp`, `/change-password`, `/get-session` (TASK-065 edits those). `server/services/rate-limit.ts` (TASK-067). Anything about the email OTP send/forget branches (fixed in `9ba2aab`).

## Expected files

```
server/services/auth.ts
shared/schemas/auth.ts
tests/integration/auth.test.ts
tests/unit/<the unit test that covers shared/schemas/auth.ts, or a new tests/unit/auth-schema.test.ts>
```

## Acceptance criteria

- [ ] Integration: reset with `password` equal to the member's handle → 400 `validacao`; the same body for an address with no `users` row → the same status and body.
- [ ] Integration: the 11th `set-password` within an hour for one session → 429 `muitas_tentativas`.
- [ ] Integration: `set-password` for a session whose address already has a password → 400 `validacao`, and better-auth's `setPassword` is not reached (assert through a spy, or through the fact that no `account` row changes; say which in the report).
- [ ] Unit: `emailSchema.parse(' A@B.co ')` returns `'a@b.co'`; `emailSchema.safeParse('ab').success` is false with the pt-BR message.
- [ ] Each new test fails on today's code.
- [ ] Integration tests send no real email (follow how `auth.test.ts` already prevents it).

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` pass (run by the reviewer, not the agent)
