# TASK-027 — Password sign-in, with the OTP narrowed to activation and reset

## Goal

Make the daily sign-in `handle` **or** email + password. Keep the six-digit email code, but only at first access and at password reset.

## Context

[TASK-007](007-auth-email-otp.md) shipped email OTP as the only sign-in path. It works, and it is not being removed — it is being moved off the critical path.

The reason is the distribution channel. A member taps a `/entrada/{id}` link in WhatsApp, which opens Android's in-app WebView. Signing in there with a code means leaving the app for a mail client, waiting on Gmail delivery, copying six digits, and switching back to a WebView that may have reloaded the page underneath them. That happens on first access **and on every 30-day session expiry**. A password is filled by Google Password Manager, iCloud Keychain or Samsung Pass behind a fingerprint, and never leaves the device.

The second reason is architectural: under OTP, Gmail SMTP is a hard dependency of every single sign-in. Under a password it is a rare path.

Full reasoning, including what this costs, in [architecture.md](../architecture.md) §3.5. The security rules this task must satisfy are in [security.md](../security.md) §4 and §8; the route contract is in [api.md](../api.md) §2.

**This is a change to shipped, merged code**, not a greenfield task. Read `server/services/auth.ts`, `app/pages/entrar.vue` and `tests/integration/auth.test.ts` before starting.

## Scope

### Included

- better-auth's `emailAndPassword` enabled; `account.password` already exists in migration `0002_better_auth.sql`
- A resolver that accepts a `handle` **or** an email as the sign-in identifier
- `/entrar` rebuilt as an identifier + password form
- `/entrar/ativar` — first access: email → code → choose a password
- `/entrar/senha` — forgot password: email → code → new password
- Change password from `/app/perfil`, requiring the current password
- Rate limits for sign-in and password change, in the existing `rate_limit` table
- Opening exactly two previously-denied better-auth routes in the `/api/auth/**` allowlist, each behind the same rate limit and generic response as the existing OTP send
- Updating `tests/integration/auth.test.ts` to cover the new flows

### Explicitly excluded

- Any OAuth provider. The `403 disallowed_useragent` finding is unchanged
- Passkeys / WebAuthn
- A password-strength meter, `zxcvbn`, or a breach-corpus (HIBP) lookup
- Password expiry or rotation policies
- Changing an email address — `request-email-change` stays denied
- An admin UI for the allowlist. Rows are still inserted by hand
- Removing the email-OTP plugin. It stays installed; it is the reset mechanism, and it is the documented fallback if members lock themselves out

## Dependencies

- TASK-007 (merged)
- TASK-008 (merged) — `users.handle` is what makes the second identifier possible

## Expected files/components

```
server/services/auth.ts              # emailAndPassword, the identifier resolver, the new allowlist entries
server/services/rate-limit.ts        # checkSignInLimit, checkPasswordChangeLimit
shared/schemas/auth.ts               # senha, identificador, and the three flow schemas
app/utils/auth-client.ts             # drop nothing; add the password client methods
app/pages/entrar/index.vue           # rebuilt: identifier + password (moved from entrar.vue)
app/pages/entrar/ativar.vue          # new
app/pages/entrar/senha.vue           # new
app/pages/app/perfil.vue             # add the change-password form
tests/integration/auth.test.ts       # rewritten around the three flows
```

No schema migration. `account.password` and `users.handle` both already exist.

## Implementation requirements

1. **Enable `emailAndPassword`** in the better-auth config with `minPasswordLength: 8` and `maxPasswordLength: 128`. Do not configure a custom hasher — scrypt is the default and is correct.
2. **Identifier resolution.** `POST /api/auth/entrar` takes `{ identificador, senha }`. If `identificador` matches `^[a-z0-9_]{3,20}$` and contains no `@`, look it up in `users.handle` and substitute the email; otherwise treat it as an email. Then delegate to better-auth's `sign-in/email`.
3. **The not-found branch must not be fast.** If no account resolves, still verify the submitted password against a fixed dummy hash before replying. Returning early makes an unknown handle measurably faster than a wrong password, which is an enumeration oracle.
4. **One failure message.** Unknown identifier and wrong password both return `400 { error: 'validacao', message: 'E-mail, usuário ou senha incorretos.' }`.
5. **Weak-password floor.** Reject, in the shared Zod schema: fewer than 8 or more than 128 characters, and a case-insensitive match against `12345678`, `123456789`, `password`, `senha123`, `meuslivros`, the user's own handle, or the local-part of their email. No other composition rule.
6. **Activation.** `/entrar/ativar` requests a code through the existing `send-verification-otp` path — allowlist check, rate limit and identical-response rule all unchanged. It must also send nothing, with the same generic response, when the address **already has a password**; otherwise the endpoint reports which invitees have signed up. After the code verifies, `POST /api/auth/set-password` sets the first password.
7. **Reset.** Open `forget-password/email-otp` and `email-otp/reset-password` in the `/api/auth/**` allowlist. Both carry the same per-email and per-IP rate limits and the same generic response as activation. A reset request for an unknown address sends nothing and looks identical. The code is consumed by the password change, not by its verification.
8. **Change password.** `POST /api/auth/change-password` with `revokeOtherSessions: true`. The current password is mandatory — a stolen session must not be upgradeable into a permanent takeover. The session performing the change survives; every other session for that user is deleted.
9. **Rate limits**, in the existing Postgres counter (no Redis): 10 sign-in attempts per identifier per hour, 30 per IP per hour, 10 password changes per user per hour. The existing 5/email and 20/IP code limits are unchanged. Count the attempt **before** resolving the identifier, so a spray across unknown handles still trips the IP counter.
10. **The deny-by-default list stays a list.** Add exactly the two reset routes. Do not replace the allowlist with a prefix match; that is what the default-deny exists to prevent.
11. **Nothing secret in a log.** No password, no hash, no code — not on a validation failure, not in a 500 correlation record.

## Data/API changes

- No migration.
- `/api/auth/**` allowlist gains `sign-in/email`, `set-password`, `change-password`, `forget-password/email-otp`, `email-otp/reset-password`.
- `sign-in/email-otp` stays, now used only inside activation.
- Route contract table in [api.md](../api.md) §2.1.

## UX requirements

- All copy in pt-BR.
- `/entrar`: one field labelled **"E-mail ou usuário"** with `autocomplete="username"`, one password field with `autocomplete="current-password"`. A `<form>` with both fields present on first paint — password managers do not offer to save a credential they never saw submitted together.
- A visible "mostrar senha" toggle. Typing a password blind on a phone keyboard is the main cause of a failed attempt.
- Links to `/entrar/senha` ("Esqueci minha senha") and `/entrar/ativar` ("Primeiro acesso").
- Password fields on activation and reset use `autocomplete="new-password"`.
- `/entrar/ativar` and `/entrar/senha` keep the typed email visible at the code step, and offer "reenviar código" after 60 seconds — matching the flow TASK-007 already built.
- After sign-in, redirect to `?next=` if present and same-origin, else `/`.
- **Must work inside WhatsApp's in-app browser.** Unchanged, and still the point.

## Security requirements

All of [security.md](../security.md) §4 applies. The ones that fail silently if skipped:

- Unknown identifier and wrong password are indistinguishable in body **and** in timing.
- Activation and reset requests are indistinguishable for allowlisted, non-allowlisted, unknown and already-activated addresses.
- Changing a password requires the current one and revokes the user's other sessions.
- Sign-in is rate limited on both the identifier and the IP.
- No password, hash or code reaches any log.

## Testing requirements

- Integration: sign-in by handle succeeds; sign-in by email succeeds; both issue a session.
- Integration: wrong password and unknown handle return byte-identical bodies.
- Timing: the unknown-identifier path and the wrong-password path do not differ by an order of magnitude.
- Integration: the 11th sign-in attempt for one identifier within an hour returns 429.
- Integration: activation for an allowlisted address sets a password and signs in; the transport is mocked.
- Integration: an activation request for an already-activated address sends **zero** emails and returns the same body as one for a fresh invitee.
- Integration: reset sets a new password, invalidates the old one, and deletes the user's other sessions.
- Integration: a reset code cannot be replayed after the password changes.
- Integration: `change-password` without `currentPassword` is rejected.
- Integration: a password of 7 characters, and `senha123`, are both rejected server-side.

## Acceptance criteria

- [ ] Sign-in with `handle` + password succeeds and sets a session cookie
- [ ] Sign-in with email + password succeeds and sets a session cookie
- [ ] An unknown handle and a wrong password return the same status and the same body
- [ ] The unknown-identifier and wrong-password paths differ by less than an order of magnitude in time
- [ ] The 11th sign-in attempt for one identifier in an hour returns 429
- [ ] The 31st sign-in attempt from one IP in an hour returns 429
- [ ] A 7-character password and `senha123` are rejected by the server, not only the form
- [ ] First access: an allowlisted address receives a code, sets a password, and lands on `/app/bem-vindo`
- [ ] An activation request for an already-activated address sends zero emails and returns the same body as one for a fresh invitee
- [ ] An activation request for a non-allowlisted address sends zero emails and returns the same body
- [ ] Reset: the old password stops working and the new one works
- [ ] Reset deletes the user's other sessions; the session that performed it survives
- [ ] A reset code cannot be used twice
- [ ] `change-password` without the current password returns 400
- [ ] `POST /api/auth/request-email-change` still returns 404
- [ ] No password, hash or OTP value appears in any log output
- [ ] Sign-in completes **on a real Android phone inside WhatsApp's in-app browser**, and the phone's password manager offers to save the credential
- [ ] `npm run test`, `npm run typecheck` and `npm run lint` pass

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] [tasks/007](007-auth-email-otp.md) carries the superseded banner and is not edited otherwise
- [ ] `docs/agent-prompts/repo-state.md` drops the "vai mudar e ainda não mudou" note

## Notes / implementation guidance

The email-OTP plugin stays installed. Do not take this task as licence to remove it — it is the reset mechanism, and [architecture-review.md](../architecture-review.md) §5 names re-adding OTP as a second sign-in option as the documented response if members lock themselves out faster than reset absorbs.

`setTransport()` in `server/utils/email.ts` is how tests inject a mock. Never point a test loop at the live Gmail transport.

**`entrar.vue` has to become `entrar/index.vue`.** In Nuxt, a `pages/entrar.vue` sitting beside a `pages/entrar/` directory becomes the *parent* of those routes and must render `<NuxtPage />` — which silently turns `/entrar` into a shell. Move the file into the directory instead. The route path does not change.

The existing two-step `/entrar` markup is a good starting point for `/entrar/ativar` and `/entrar/senha` — both are the same shape. Move it rather than rewriting it, and leave the "reenviar código" timer intact.

The WhatsApp WebView criterion cannot be verified in a desktop browser, and the password-manager half of it cannot be verified at all without a real phone. It is the criterion that motivated the whole task.
