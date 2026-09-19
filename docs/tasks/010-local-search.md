# TASK-010 — Local catalog search

## Goal

Instant search over the community's own works, matching title and author, accent-insensitive.

## Context

Open Library **cannot** serve this: measured at 40% coverage of Brazilian editions and an 8.4s average latency with outright timeouts. Search must be local and instant. See [book-catalog.md](../book-catalog.md) §1.

The catalog starts with the owner's 86 books and grows as friends add theirs — a book added by one person is immediately findable by the other 29.

## Scope

### Included

- `GET /api/search`
- `SearchBox.vue`
- Accent-insensitive matching over title and author
- Result ranking

### Explicitly excluded

- Open Library (TASK-012)
- Manual add UI (TASK-011)
- Postgres FTS / `pg_trgm` — `ILIKE` over ~1,500 rows is a sub-millisecond scan

## Dependencies

- TASK-009

## Expected files/components

```
server/api/search/index.get.ts
server/services/search.ts
app/components/search/SearchBox.vue
```

## Implementation requirements

1. `GET /api/search?q=` — `q` trimmed, 2–100 chars. Shorter returns `{ works: [] }` with **200**, not an error.
2. Match `works.search_text ILIKE '%' || f_unaccent(lower($1)) || '%'` **or** the same over `authors.name`. `$1` is a **bound parameter**, never concatenated.
3. Return at most 20, each `{ id, slug, title, authors[], first_published_year, cover_url, log_count }`.
4. Ranking: exact title match, then title prefix, then `log_count` descending, then title. A book several friends have read should surface first.
5. `SearchBox.vue`: debounced 250ms, aborts the in-flight request on a new keystroke, shows a loading state, keyboard navigable (arrows + Enter).
6. Zero results renders the manual-add path prominently — see TASK-011. **This is the ~60% case for Brazilian editions and must look like a next step, not a failure.**
7. No authentication required. Search results only expose catalog rows, which carry no visibility.

## Data/API changes

`GET /api/search?q=` → `200 { works: [...] }`

## UX requirements

- Results appear as you type, without pressing Enter.
- `dostoievski` matches `Dostoiévski`; `ficcao` matches `Ficção`.
- Loading state does not clear previous results (no flicker).
- The empty state is an invitation to add the book, not an error.

## Security requirements

- The query is a bound parameter. A `%` or `_` typed by a user is a literal wildcard in their own search — harmless — but must never reach the query as concatenated text.
- `q` capped at 100 chars.
- Rate limit 120/IP/hour — generous, since this is as-you-type.

## Testing requirements

- Integration: `dostoievski` returns works whose author is `Dostoiévski`.
- Integration: `ficcao` matches a work titled with `Ficção`.
- Integration: a partial title (`retorno do rei`) matches.
- Integration: an author-only query returns that author's works.
- Integration: `q` of 1 char returns 200 with an empty array.
- Integration: `q` of `%` returns 200 and does not return every row.
- Performance: with 1,500 works seeded, p95 under 150ms.

## Acceptance criteria

- [ ] Given `dostoievski`, results include works whose author slug is `fiodor-dostoievski`
- [ ] Given `ficcao`, a work containing `Ficção` in the title is returned
- [ ] Given `retorno`, `O retorno do rei` is returned
- [ ] Given `j`, the response is `200 { works: [] }`
- [ ] Given `%`, the response does not contain all works
- [ ] At most 20 results are ever returned
- [ ] A work with 5 logs ranks above an equally-matching work with 0
- [ ] With 1,500 works, p95 latency is under 150ms
- [ ] Typing quickly produces one request per 250ms pause, not per keystroke

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Do not add `tsvector` or `pg_trgm`. At 1,500 rows a sequential scan over a generated column is faster than index maintenance is worth. The documented upgrade trigger is ~50k works.

Seed a synthetic 1,500 rows for the performance test, then delete them.
