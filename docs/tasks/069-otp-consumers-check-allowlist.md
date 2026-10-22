# TASK-069 - Codes stop working when the invite is removed

## Context

This comes from the follow-up to the 2026-09-28 security round, recorded in [security-review-2026-09-28-status.md](../reports/security-review-2026-09-28-status.md). It covers two items: what TASK-063 left of **M-1**, and the `name`/`image` observation.

TASK-063 made `removeInvite` delete the member's sessions and password credential. The OTP rows in better-auth's `verification` table are left alone, and a code lives 10 minutes (`expiresIn: 60 * 10` in `server/services/auth.ts`). Two branches of `handleAuthRequest` consume a code without consulting the allowlist:

- **`/sign-in/email-otp`** passes the original request straight to `auth.handler(request)`, with its headers and its raw body. A sign-in code issued before the removal still signs the person in, and a new session appears right after the admin revoked them all.
- **`/email-otp/reset-password`** validates the password and then forwards the original headers and the raw `bodyText`. A reset code issued before the removal still sets a new password, which brings back the credential TASK-063 deleted.

Both branches also forward whatever else the client put in the body, such as `name` and `image`. The better-auth email-OTP endpoints read those fields. `send-verification-otp` and `forget-password/email-otp` already avoid this: they rebuild the body and headers through `forwardOtpRequest` and `FORWARDED_HEADERS`.

The reviewer decided on 2026-09-30, by delegation from the owner, to check the allowlist at the moment a code is **consumed**. `removeInvite` stays as it is. The consuming check also covers any other way a row could leave `allowed_emails`, and all of it lives in the one file that owns the auth flow.

## Implementation requirements

1. **`/sign-in/email-otp`:**
   - Validate with `verifyOtpSchema` (`shared/schemas/auth.ts`) over `readJsonBody(request)`. On failure, return the branch's existing `400 validacao` `Código inválido ou expirado.`
   - If `!(await isEmailAllowed(email))`, return that same 400 **without calling better-auth**.
   - Otherwise forward a request that the server builds itself. The headers are `content-type: application/json` plus `FORWARDED_HEADERS`. The body is `JSON.stringify({ email, otp })` and carries nothing else.
   - Keep the current handling of the response: `stripSessionToken` on success, and the fixed 400 on failure.
2. **`/email-otp/reset-password`:**
   - Keep the password-rule check exactly as it is today.
   - After it, if the address is not allowed, return the branch's existing `400 validacao` `Código inválido ou expirado.` without calling better-auth.
   - Otherwise forward a body built from `{ email, otp, password }` only, with the same header construction as step 1.
   - The response is returned as today: `response` on success, the fixed 400 on failure.
3. Factor the header construction from `forwardOtpRequest` into a small helper that all three call sites use. `forwardOtpRequest` keeps its behaviour and its signature.
4. A refusal for a non-allowed address writes one `logger.warn` (module `auth`, operation `sign_in_otp` or `reset_password`) with the address passed through `redactEmail`.

## Explicitly excluded

- `server/services/invites.ts`: `removeInvite` does not delete `verification` rows.
- `/set-password`, `/entrar`, `/change-password`, the two branches that request a code, and the rate limits.
- `server/api/auth/[...all].ts` (TASK-070).
- The 5-minute `cookieCache` window, which is deliberate (`CLAUDE.md`).
- Timing equalisation (TASK-024).

## Expected files

```
server/services/auth.ts
tests/integration/auth.test.ts
```

## Acceptance criteria

- [ ] Integration, sign-in:
  1. An allowlisted, not yet activated address requests a code, read from the captured email the way the existing activation test does.
  2. The `allowed_emails` row is deleted.
  3. `POST /api/auth/sign-in/email-otp` with that code returns 400 `validacao`.
  4. **Querying the `session` table** through `ba_user.email` returns 0 rows for that address.
- [ ] Integration, reset: an activated member requests a reset code, the invite is removed with `removeInvite`, and `POST /api/auth/email-otp/reset-password` with that code and a valid new password returns 400. No `credential` row exists in `account` for that address.
- [ ] Integration: a sign-in whose body also carries `"name": "x", "image": "https://evil.test/a.png"` succeeds for an allowlisted address, and `ba_user.name` and `ba_user.image` for that address are unchanged.
- [ ] The existing activation, reset and sign-in tests still pass unchanged.
- [ ] The first two cases fail on today's code.

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` and `npm run build` pass. The reviewer runs them, not the agent.
