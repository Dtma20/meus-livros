# TASK-024 — Security hardening pass

## Goal

Work through the [security.md](../security.md) pre-launch checklist and close every gap.

## Context

The final gate before inviting anyone. Individually these items are small; collectively they are the difference between a product that can be shared with friends and one that cannot.

## Scope

### Included

- Every item in [security.md](../security.md) §13
- Rate limiting applied and verified
- CSP headers
- Secret leakage audit
- Error-leakage audit

### Explicitly excluded

- A penetration test
- Moderation tooling — invite-only, deferred (see [mvp-definition.md](../mvp-definition.md) §4)
- Two-factor auth

## Dependencies

- TASK-017, TASK-023

## Expected files/components

```
server/middleware/security-headers.ts
server/middleware/origin-check.ts
server/utils/rate-limit.ts   (applied)
```

## Implementation requirements

1. **CSP** per [security.md](../security.md) §2, set as a response header. `img-src` allows `'self'`, `https://covers.openlibrary.org` and `data:` — deliberately narrow.
2. Additional headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`.
3. **Origin check** on every mutating request — compare `Origin` against the expected host. Cheap insurance if a cookie setting is ever loosened.
4. Apply every rate limit from [security.md](../security.md) §8 and verify each fires.
5. **Secret audit**: build, then grep `.vercel/output/static` for each secret's value. Any hit is a blocking failure.
6. **Error audit**: force a 500, a Postgres unique violation, and a Zod failure. Confirm responses carry the documented shapes and no internals. Confirm unique violations map to 409, not 500.
7. **Log audit**: confirm OTP codes, session tokens and full email addresses never appear in logs.
8. `cover_url` scheme validation verified against `javascript:` and `data:text/html`.
9. Confirm request bodies are capped at 64 KB.
10. Re-run the four visibility tests from TASK-017 **against production**.

## Data/API changes

None.

## UX requirements

None — behaviour must not change for legitimate use. Verify that rate limits do not fire during ordinary usage, especially as-you-type search.

## Security requirements

This task is the security requirement. Every checklist item is blocking.

## Testing requirements

Work through [security.md](../security.md) §13 item by item, recording evidence for each:

- [ ] `grep -r "v-html" app/ server/` returns nothing
- [ ] The four visibility tests pass against production
- [ ] A privado entry returns 404, not 403, to a second account
- [ ] `rating: 3.7` and `rating: 6` are rejected server-side
- [ ] An OTP request for a non-allowlisted address is indistinguishable in status, body and timing
- [ ] No secret appears in the built client bundle
- [ ] CSP present on every response
- [ ] Session cookie httpOnly + Secure + SameSite=Lax
- [ ] `cover_url` rejects `javascript:` and `data:text/html`
- [ ] A 500 response contains no stack trace
- [ ] The backup restore from TASK-022 succeeded

Plus: each rate limit verified by exceeding it and observing 429.

## Acceptance criteria

- [ ] Every item in [security.md](../security.md) §13 is checked with recorded evidence
- [ ] Every rate limit in §8 fires when exceeded and returns 429
- [ ] Normal usage — including as-you-type search — never triggers a rate limit
- [ ] The secret grep over the client bundle finds nothing
- [ ] A duplicate ISBN returns 409, not 500
- [ ] A cross-origin POST with credentials is rejected
- [ ] OTP codes appear in no log output
- [ ] The four visibility tests pass against the production deployment
- [ ] A written summary of the audit is added to the PR

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Record evidence rather than ticking boxes — a command and its output per item. The value of this task is the evidence, not the checklist.

If anything here fails, fix it before inviting anyone. There is no acceptable version of "we will tighten that after launch" for a visibility leak.
