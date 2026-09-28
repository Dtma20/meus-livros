# TASK-065 - The session token never reaches JavaScript

## Context

Security round of 2026-09-28, finding **B-8** of the pre-deploy review. The session cookie is `httpOnly`, but the same token comes back in JSON bodies that our wrappers in `server/services/auth.ts` pass through from better-auth unchanged: `/entrar` (sign-in returns `{ redirect, token, user }`), `/sign-in/email-otp`, `/change-password` and `/get-session`. No XSS vector exists today; this removes a defence-in-depth gap. A `grep` on 2026-09-28 found no `app/` code reading `.token` from any of these responses.

## Implementation requirements

1. In `server/services/auth.ts`, every branch listed above returns the better-auth response with the token removed from the JSON body: top-level `token`, and `session.token` in `get-session`. Leave every other field as it is.
2. **Keep every header of the original response**, above all every `Set-Cookie` (there can be more than one - use `headers.getSetCookie()` / copy the `Headers` object, never `headers.get('set-cookie')`, which returns only the first). Drop `content-length`, because the body changes. Keep the status.
3. Non-JSON or empty bodies (e.g. `get-session` returning `null`) pass through unchanged.
4. One small helper in `auth.ts` does this; the four branches call it.
5. Confirm with `grep -rn "token" app/` that no client code depends on the field; list what you found in the report.

## Explicitly excluded

- The branches `/set-password`, `/email-otp/reset-password`, `/email-otp/send-verification-otp`, `/forget-password/email-otp` (other tasks). Changing cookie attributes. `server/services/rate-limit.ts`.

## Expected files

```
server/services/auth.ts
tests/integration/auth.test.ts
```

## Acceptance criteria

- [ ] Integration: a successful `POST /api/auth/entrar` body has no `token` key anywhere, and the response still sets the session cookie (assert on `getSetCookie()`, not `get('set-cookie')`).
- [ ] Integration: `GET /api/auth/get-session` with that cookie returns a body with `user` and no `session.token`.
- [ ] Integration: change-password success still sets a cookie and has no `token` in the body.
- [ ] The sign-in page test (`tests/unit/sign-in-page.test.ts`) and `tests/integration/body-after-session.test.ts` still pass unchanged.
- [ ] The new assertions fail on today's code.

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` pass (run by the reviewer, not the agent)
