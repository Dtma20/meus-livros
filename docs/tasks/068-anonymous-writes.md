# TASK-068 - Anonymous writes: no forged log lines, bounded search misses

## Context

Security round of 2026-09-28, findings **B-6** and **B-10** of the pre-deploy review.

- **B-6.** `server/api/observability/client-errors.post.ts` spreads the client's `input.context` into the log context. `server/utils/logger.ts` (~line 238) picks `context._rawError` and passes it **raw** to `console.error(formatted, rawErrorArg)`, skipping sanitisation and email redaction. An anonymous `POST` with `{"message":"x","context":{"_rawError":"line\n{\"level\":\"ERROR\",...}"}}` writes arbitrary text, newlines included, into production logs.
- **B-10.** `GET /api/search` inserts into `search_misses` on every empty result, anonymous and unlimited. `search_misses` is the MVP's one analytics table (TASK-026), so anonymous misses stay recorded - but bounded.

## Implementation requirements

1. `client-errors.post.ts`: drop any `_rawError` key from the client's context before logging (destructure it out). The client can never set it.
2. `server/utils/logger.ts`: pass `rawErrorArg` to `console.error` only when it is an `Error` instance; anything else is ignored. On 2026-09-28 `grep -rn "_rawError" server` found no server code that sets it - the only source is the client context - so the guard costs nothing today; re-run the grep and list any writer in the report.
3. `server/api/search/index.get.ts`: for an **anonymous** viewer, record the miss only while `checkRateLimit('search_miss:ip:<ip>', 30)` (from `server/services/rate-limit.ts` - call it, do not edit that file; IP from `server/utils/client-ip.ts`) allows it. Signed-in viewers stay unlimited. The rate-limit check is part of the fire-and-forget: it never delays or fails the search response, and the response is identical either way.

## Explicitly excluded

- `server/services/rate-limit.ts` (TASK-067), `server/services/search.ts`. Changing what `search_misses` stores. Removing `/api/observability/client-errors` or its own rate limit.

## Expected files

```
server/api/observability/client-errors.post.ts
server/utils/logger.ts
server/api/search/index.get.ts
tests/unit/logger.test.ts
tests/unit/client-error.test.ts   (or the test that covers the client-errors route - check)
tests/unit/search-misses.test.ts  (or tests/integration/search.test.ts - whichever covers recordSearchMiss from the route)
```

## Acceptance criteria

- [ ] Unit: a client-errors request whose context carries `_rawError: 'forjado\n...'` produces a `console.error` call with exactly one argument (the formatted line), and that line does not contain `forjado` unescaped.
- [ ] Unit: logger with `_rawError: new Error('x')` still passes the Error as the second argument; with `_rawError: 'texto'` it does not.
- [ ] Unit or integration: 31 anonymous empty searches from one IP record 30 misses; a signed-in viewer's 31st is recorded.
- [ ] The search response body is the same whether or not the miss was recorded.
- [ ] Each new test fails on today's code.

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` pass (run by the reviewer, not the agent)
