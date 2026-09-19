# TASK-012 — Open Library optional lookup

## Goal

An explicit, non-blocking "buscar dados online" action that pre-fills the add-book form from Open Library.

## Context

Open Library is **enrichment, never dependency**. Measured: 40% coverage of Brazilian editions, 8.4s average search latency (range 2.5–21s), with hard timeouts. It must never sit in a synchronous path, and the product must work identically when it fails. See [book-catalog.md](../book-catalog.md).

## Scope

### Included

- `GET /api/search/externo`
- `ExternalLookup.vue` — an explicit button
- 2-second hard timeout
- Mapping OL results into form fields

### Explicitly excluded

- Automatic lookup on typing
- Any background sync or catalog mirror
- Caching — results are persisted on accept or discarded
- Overwriting existing local data

## Dependencies

- TASK-011

## Expected files/components

```
server/api/search/externo.get.ts
server/services/open-library.ts
app/components/search/ExternalLookup.vue
```

## Implementation requirements

1. `GET /api/search/externo?q=` — **session required**, so anonymous traffic cannot use us as a proxy to a free public API.
2. Call `https://openlibrary.org/search.json?q=&limit=5&fields=key,title,author_name,cover_i,first_publish_year,language`.
3. **Hard 2-second `AbortController` timeout.** On timeout, non-200, or malformed JSON: return `{ results: [], indisponivel: true }` with status **200**. A slow upstream must never become our error page.
4. Descriptive `User-Agent` identifying the project and a contact address, per Open Library's guidance.
5. Parse responses with Zod — third-party data is untrusted input.
6. Map: `key` → `ol_work_key`, `title`, `author_name[]`, `first_publish_year`, `cover_i` → `ol_cover_id`, `language[0]` → ISO 639-1.
7. **Store `ol_cover_id`, and prefer `https://covers.openlibrary.org/b/id/{id}-M.jpg` over ISBN-keyed cover URLs.** Cover lookups by identifiers other than CoverID/OLID are rate-limited; by CoverID they are not.
8. Selecting a result **pre-fills the form for review**. Nothing is saved directly, and nothing already typed is silently overwritten — show what will change.
9. Rate limit 20/user/hour, protecting Open Library rather than us.
10. Genres are **never** imported — OL `subjects` are free-text English noise.

## Data/API changes

`GET /api/search/externo?q=` → `200 { results: [...], indisponivel?: boolean }`

## UX requirements

- A button labelled *"Buscar dados online"*, never automatic.
- Loading state names the wait: *"Consultando o Open Library…"*.
- On unavailable/empty: *"Não conseguimos buscar online agora. Você pode preencher à mão."* — never an error page.
- Results show cover, title, author, year so the user can pick correctly.
- Picking one fills the form and leaves the user in control of every field.

## Security requirements

- Session required.
- 2s timeout enforced server-side; the client cannot extend it.
- Responses Zod-validated; `cover_url` scheme-checked before it can be persisted.
- Rate limited.
- Open Library data is untrusted: it never bypasses the same validation as hand-typed input.

## Testing requirements

- Integration (mocked): a normal response maps correctly to form fields.
- Integration (mocked): a 3-second response yields `{ results: [], indisponivel: true }` with status 200 in about 2 seconds.
- Integration (mocked): a 500 from OL yields the same shape, status 200.
- Integration (mocked): malformed JSON yields the same shape and logs.
- Integration: an unauthenticated request returns 401.
- Unit: mapping produces `ol_cover_id` from `cover_i`.

## Acceptance criteria

- [ ] The lookup only runs on an explicit button press
- [ ] A response slower than 2s returns `{ results: [], indisponivel: true }` with status 200
- [ ] An Open Library 500 produces no error page anywhere in the UI
- [ ] Results map into the form without saving anything
- [ ] Already-typed values are not silently overwritten
- [ ] `ol_cover_id` is persisted when present, and cover URLs prefer `/b/id/`
- [ ] Genres are never populated from the response
- [ ] An unauthenticated request returns 401
- [ ] The 21st lookup in an hour returns 429
- [ ] Requests carry a descriptive `User-Agent`

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Test with a real query for `Histórias da meia-noite Machado de Assis` — measured as returning **zero results**. That is a normal outcome, and the UI must handle it gracefully rather than treating it as an anomaly.

Do not be tempted to raise the timeout because "sometimes it takes 8 seconds". The whole point is that the user is never made to wait on a service that fails 60% of the time anyway.
