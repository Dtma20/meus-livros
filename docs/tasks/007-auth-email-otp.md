# TASK-007 — better-auth + email OTP + allowlist

> **Partially superseded by [TASK-027](027-password-sign-in.md).** This task is merged and everything in it was built. What changed afterwards is *when* the code is used: the daily sign-in became `handle`-or-email + password, and the six-digit code was narrowed to first-access activation and password reset. The OTP mechanism, the allowlist gate, the identical-response rule, the Postgres rate limiter and the deny-by-default `/api/auth/**` allowlist all survive unchanged — TASK-027 changes what sits in front of them.
>
> **This file is history. Do not edit it to match the new design; read [TASK-027](027-password-sign-in.md) and [architecture.md](../architecture.md) §3.5 for what is true now.** The "Explicitly excluded → Password auth" line below is the specific item that was reversed.

## Goal

Authentication by one-time code sent to email, restricted to allowlisted addresses.

## Context

Google OAuth cannot be used. Google returns `403 disallowed_useragent` for OAuth initiated inside an embedded WebView, and WhatsApp's Android in-app browser is one — so OAuth fails in the exact channel this product lives in. Email OTP works everywhere, and it collapses the invite gate and the login identifier into the same field. See [architecture.md](../architecture.md) §3.5.

## Scope

### Included

- better-auth with the email-OTP plugin
- Gmail SMTP via `nodemailer` for delivery (the spec said Resend; see the note below)
- `allowed_emails` gate
- Sessions, rate limiting
- `/entrar` page

### Explicitly excluded

- Profile creation (TASK-008)
- Any OAuth provider
- Password auth
- An admin UI for managing the allowlist — rows are inserted by hand

## Dependencies

- TASK-004

## Expected files/components

```
server/utils/auth.ts
server/api/auth/[...all].ts
server/db/migrations/0002_better_auth.sql
app/pages/entrar.vue
server/utils/rate-limit.ts
```

## Implementation requirements

1. Install `better-auth` and its email-OTP plugin. Let its CLI generate the auth tables into the same migration journal — do not hand-write them.
2. Configure the Drizzle adapter against the existing connection.
3. OTP: 6 digits, 10-minute expiry, single use, max 5 verification attempts per code.
4. **Allowlist check before sending.** If the address is not in `allowed_emails`, send nothing — but return the **same status, body and approximate timing** as a success. Whether an address is invited is not public information.
5. Delivery via Gmail SMTP (`nodemailer` + a Google app password). The email is pt-BR, plain, and contains only the code and its expiry. **Reversed from Resend during implementation** — Resend refuses to send from a domain it cannot verify by DNS, and the sender is an `@gmail.com` address. Reasoning in [architecture.md](../architecture.md) §3.5.
6. Rate limiting in a Postgres table (no Redis): 5 requests per email per hour, 20 per IP per hour. Exceeding either returns `429` with `{ error: 'muitas_tentativas' }`.
7. Session cookie: httpOnly, Secure, SameSite=Lax, 30-day rolling. **Database-backed**, not a stateless sealed cookie, so sessions can be revoked.
8. `/entrar`: email field → code field, in one page, two steps. Keeps the email visible so the user knows where the code went. Offers "reenviar código" after 60 seconds.
9. After verification, redirect to `?next=` if present and same-origin, else `/`.

## Data/API changes

- Adds better-auth tables.
- Adds a rate-limit table.
- `ALL /api/auth/**` handled by better-auth.

## UX requirements

- Two steps, one page. Never lose the typed email.
- The code input is `inputmode="numeric"` `autocomplete="one-time-code"` so mobile keyboards and autofill behave.
- A wrong code shows an inline error and keeps the field focused.
- The error for "not allowlisted" is **identical** to the error for "code sent" — from the user's perspective, a code was sent.
- **Must work inside WhatsApp's in-app browser.** This is the whole point.

## Security requirements

- Account enumeration: identical response and timing for allowlisted and non-allowlisted addresses. Never "este email não foi convidado".
- Codes are single use and invalidated on success.
- Rate limits on both email and IP.
- OTP codes never appear in logs.
- `BETTER_AUTH_SECRET` is at least 32 random bytes and differs per environment.
- Sessions must be revocable server-side.

## Testing requirements

- Integration: an allowlisted address receives a code (the `nodemailer` transport mocked) and can verify it.
- Integration: a non-allowlisted address gets the same HTTP response, and **no email is sent**.
- Integration: a wrong code fails; six wrong codes kill the code.
- Integration: a used code cannot be reused.
- Integration: the sixth request in an hour for one email returns 429.
- Timing: the allowlisted and non-allowlisted paths do not differ by an order of magnitude.

## Acceptance criteria

- [ ] An allowlisted address receives a 6-digit code and completes sign-in
- [ ] A non-allowlisted address gets an identical response and **zero** emails are sent
- [ ] An incorrect code returns 400 with `{ error: 'validacao' }`
- [ ] A code fails after 5 incorrect attempts
- [ ] A verified code cannot be used a second time
- [ ] A code older than 10 minutes fails
- [ ] The 6th request in one hour for one email returns 429
- [ ] The session cookie is httpOnly, Secure, SameSite=Lax
- [ ] Deleting the session row logs the user out on the next request
- [ ] Sign-in completes **on a real Android phone inside WhatsApp's in-app browser**
- [ ] `grep -ri "otp\|codigo" server/**/*.log` finds no code values

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Insert your own email into `allowed_emails` by hand before testing; there is no UI.

The WhatsApp WebView acceptance criterion is not optional and cannot be verified in a desktop browser. Test it on a real phone before calling this done — it is the specific failure mode that ruled out OAuth.

A personal Gmail account allows 500 messages/day. Plenty, but never point a test loop at the live transport — `setTransport()` in `server/utils/email.ts` exists so tests inject a mock.
