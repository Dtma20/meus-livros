# TASK-026 — `search_misses` instrumentation

## Goal

Record searches that returned nothing.

## Context

The only instrumentation in the MVP. Everything else worth knowing is already a column: `signed_up` is `users.created_at`, `book_logged` is `reading_logs.created_at`, and the metric that decides the project — friends who logged three books in the first month — is a `GROUP BY`.

What is **not** derivable is what people looked for and did not find, and that single signal tests the biggest assumption in the architecture: that a community-built catalog plus manual entry is good enough.

## Scope

### Included

- Writing a row on every zero-result local search
- A documented query for reading the data

### Explicitly excluded

- Any third-party analytics
- Event tracking beyond this one table
- A dashboard — `psql` is the interface

## Dependencies

- TASK-010

## Expected files/components

```
server/services/search.ts   (extended)
docs/runbook-metrics.md
```

## Implementation requirements

1. On a zero-result `/api/search`, insert `{ query, user_id, created_at }` into `search_misses`.
2. **Fire and forget.** The insert must never block or fail the response — wrap it, catch and log any error, and return the search result regardless.
3. Store the query as typed, trimmed. Do not normalise — the raw text is the signal, including typos.
4. `user_id` is null for anonymous searches.
5. Do not record queries shorter than 2 characters (those return empty by design, not by absence).
6. `docs/runbook-metrics.md` documents the queries that matter:

```sql
-- Most-missed queries
SELECT query, count(*) FROM search_misses
GROUP BY query ORDER BY count(*) DESC LIMIT 30;

-- Miss rate trend by week: is the catalog filling up?
SELECT date_trunc('week', created_at) AS week, count(*)
FROM search_misses GROUP BY 1 ORDER BY 1;

-- THE metric that decides the project
SELECT u.handle, count(*) AS livros
FROM reading_logs l JOIN users u ON u.id = l.user_id
WHERE l.created_at > now() - interval '30 days'
GROUP BY u.handle HAVING count(*) >= 3;
```

7. Document how to interpret it: a miss for a book that *is* in the catalog is a **search** problem (matching, plurals, partial titles); a miss for one that is not is expected early and should **decay** as the catalog fills. If it does not decay after ~3 months, the manual-add flow has too much friction and deserves real work.

## Data/API changes

Writes to `search_misses`. No new endpoint.

## UX requirements

None. Must be completely invisible, and must never slow a search down.

## Security requirements

- Queries may contain personal text. `user_id` links a person to what they searched for — treat the table as user data: include it in backups, delete it on account deletion (the FK is `ON DELETE SET NULL`, which is sufficient).
- The write must never block the response, and a failure must never surface to the user.
- Not exposed through any API.

## Testing requirements

- Integration: a zero-result search inserts exactly one row with the exact query text.
- Integration: a search with results inserts nothing.
- Integration: a 1-character query inserts nothing.
- Integration: an anonymous search inserts a row with `user_id IS NULL`.
- Integration: a forced failure of the insert still returns a normal search response.

## Acceptance criteria

- [ ] A zero-result search creates one row containing the exact query text
- [ ] A search returning results creates no row
- [ ] A 1-character query creates no row
- [ ] An anonymous search creates a row with `user_id IS NULL`
- [ ] A simulated insert failure does not affect the search response or status
- [ ] Search latency is unchanged (within noise) with instrumentation enabled
- [ ] `docs/runbook-metrics.md` exists with all three queries and interpretation notes

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Resist adding more events. Every one proposed so far is either already a column or answers a question nobody at this scale will act on. If a second table is ever genuinely needed, the bar is: name the decision it would change.
