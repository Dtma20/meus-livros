# TASK-067 - Rate limits: bounded keys, a cleanup, no lockout, a limit on import

## Context

Security round of 2026-09-28, findings **M-4**, **M-5** and **B-5** of the pre-deploy review. All three live in `server/services/rate-limit.ts` and the import route.

- **M-5.** `checkRateLimit` inserts a row per key per hour window. Keys embed `body.email` / `body.identificador` with no length bound, so anonymous traffic writes arbitrarily large keys; the identifier row is written even when the IP limit already tripped (`Promise.all`); nothing ever deletes old rows. A key beyond the btree tuple limit of `rate_limit_key_window_unique` makes Postgres fail. Growth is unbounded on a free-tier Neon quota.
- **B-5.** `checkSignInLimit` has one bucket of 10 per identifier per hour, shared across all IPs, counted before the password is checked. Anyone can lock a member out for an hour with 10 wrong attempts (20 per account, handle and email being separate buckets).
- **M-4.** `POST /api/library/import` accepts 1,000 books per request with no hourly limit, bypassing the 30 works/hour and 60 logs/hour limits of the normal flows. `livroJsonSchema.title` allows 500 characters against the 300 documented in `docs/security.md` §7.

## Implementation requirements

1. **Bounded keys.** `checkRateLimit` stores `sha256(key)` hex (`node:crypto`) instead of the raw key. Callers keep passing readable keys. This also stops storing email addresses in `rate_limit`. (Existing rows become orphans that the cleanup below removes; no migration.)
2. **IP first.** In `checkOtpRequestLimit` and `checkSignInLimit`, check the IP bucket first and return the 429 body without touching the identifier bucket when the IP is over.
3. **Cleanup.** Export `pruneRateLimits()`: `DELETE FROM rate_limit WHERE window_start < date_trunc('hour', now()) - interval '1 day'`. `checkRateLimit` calls it fire-and-forget on roughly 1 in 100 calls (never awaited, errors caught and logged with `logger.warn`). No cron, no new infrastructure.
4. **No lockout.** `checkSignInLimit(identifier, ip)` uses three buckets: `signin:idip:<identifier>:<ip>` 10/h, `signin:id:<identifier>` 50/h, `signin:ip:<ip>` 30/h. A victim is locked only if an attacker spends 50 attempts in the hour; brute force across IPs stays capped at 50/h per account. Record the trade-off in the report.
5. **Import limit.** `server/api/library/import.post.ts`: after `requireSessionUser`, `checkRateLimit('import:user:<id>', 3)`; over → `429 { error: 'muitas_tentativas', message: 'Muitas importações em pouco tempo. Tente de novo daqui a uma hora.' }`, before parsing the body.
6. `shared/schemas/export-import.ts`: `title` max 300.

## Explicitly excluded

- `server/services/auth.ts` (the call sites of `checkSignInLimit` / `checkOtpRequestLimit` keep their signatures). A Redis or any cache. A Vercel cron. Changing any other limit value.

## Expected files

```
server/services/rate-limit.ts
server/api/library/import.post.ts
shared/schemas/export-import.ts
tests/unit/<new rate-limit test, with db mocked>  and/or  tests/integration/<rate-limit test against the database>
tests/integration/auth.test.ts   (only if an existing sign-in lockout assertion changes meaning - say so)
```

## Acceptance criteria

- [ ] Integration or unit: a 5,000-character key is accepted and the stored `key` is 64 hex characters.
- [ ] Integration: with the IP bucket already over, a call to `checkOtpRequestLimit` inserts no identifier row.
- [ ] Integration: `pruneRateLimits()` deletes a row with `window_start` two days ago and keeps one from the current hour.
- [ ] Integration: 10 failed sign-ins for identifier X from IP A → the 11th from A is 429, the first from IP B is not.
- [ ] Integration: the 4th import within an hour for one user → 429, and no work was created by it.
- [ ] `livroJsonSchema` rejects a 301-character title.
- [ ] Each new test fails on today's code.

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` pass (run by the reviewer, not the agent)
