# TASK-070 - Auth route errors in the project's shape

## Context

This comes from the follow-up to the 2026-09-28 security round, recorded in [security-review-2026-09-28-status.md](../reports/security-review-2026-09-28-status.md), which lists it under M-5.

`server/api/auth/[...all].ts` is the only API route that is not wrapped in `defineApiHandler` (`server/utils/api.ts`):

```ts
export default defineEventHandler(async (event) => {
  return handleAuthRequest(toWebRequest(event))
})
```

`handleAuthRequest` queries the database before better-auth ever runs: rate limits, `isEmailAllowed`, `hasPassword`, the `users` lookup. When one of those queries throws, the error skips the project's handler and lands in Nitro's default one, with three consequences:

- the response is not `{ error, message }`;
- it carries no `requestId`;
- the log line does not go through `logger`.

In dev it also carries the stack. `CLAUDE.md` requires: "500 responses never carry stack traces or database messages". Every other route gets this from `defineApiHandler`.

## Implementation requirements

1. Wrap the handler in `defineApiHandler`. It still returns the `Response` from `handleAuthRequest` unchanged when nothing throws. Check that `defineApiHandler` passes a returned `Response` through untouched: status, headers and every `set-cookie`. If it does not, stop and report instead of changing `defineApiHandler`.
2. A throw inside `handleAuthRequest` then comes out as `defineApiHandler`'s standard 500 `{ error, message, requestId }`, logged through `logger.error`.

## Explicitly excluded

- `server/services/auth.ts` (TASK-069 is working in that file).
- Changing `defineApiHandler`, and any other route.

## Expected files

```
server/api/auth/[...all].ts
tests/integration/<the file that already drives /api/auth over HTTP - check routes.test.ts and auth.test.ts>
```

## Acceptance criteria

- [ ] Integration over HTTP against the built bundle: a successful `POST /api/auth/entrar` still returns 200 and sets the session cookie. Compare the `set-cookie` headers before and after the change.
- [ ] Unit or integration test: when `handleAuthRequest` throws, for example a mocked service rejecting with an `Error` whose message contains `password authentication failed`, the response is 500 with a body of exactly the keys `error`, `message` and `requestId`, no stack, and no part of the thrown message.
- [ ] The second case fails on today's code.

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` and `npm run build` pass. The reviewer runs them, not the agent.
