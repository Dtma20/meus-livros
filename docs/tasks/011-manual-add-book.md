# TASK-011 — Manual add-book flow

## Goal

A form that lets any member add a book the catalog does not have.

## Context

**This is a primary path, not an error recovery.** Open Library lacks 60% of Brazilian editions, so "não encontrei" is the expected outcome most of the time. The form deserves real design attention: if adding a book is annoying, logging fails at the first step and the whole product fails with it.

## Scope

### Included

- `AddBookForm.vue`
- Wiring the search zero-state to it
- Genre picker from the seeded 26
- Optional edition fields

### Explicitly excluded

- Open Library prefill (TASK-012)
- Editing an existing work
- Cover upload — a URL only

## Dependencies

- TASK-010

## Expected files/components

```
app/components/search/AddBookForm.vue
app/components/search/GenrePicker.vue
app/pages/app/livro/novo.vue
```

## Implementation requirements

1. Reachable from the search zero-state **and** as a standalone page.
2. Required: `title`, at least one author. Everything else optional — a required field here is a reason to abandon.
3. Optional: `first_published_year` (signed, −3000..2100), `original_language` (a pt-BR select mapping to ISO 639-1), genres (0–4 from the 26), `series_name`, `series_number` (**free text** — `'1-2'` and `'0.1'` are real values).
4. Optional edition block, collapsed: ISBN, publisher, page count, published year, cover URL.
5. Authors as a tag input; existing authors autocomplete from `/api/search`, new names are created.
6. On 409 duplicate, show the existing work with its cover and ask *"é este?"* — accepting links to it, rejecting resubmits with `?forcar=1`.
7. Pre-fill `title` from the search query that produced the zero result.
8. On success, return the user to wherever they came from, carrying the new `work_id` so they can proceed straight to logging.

## Data/API changes

Consumes `POST /api/works`. No new endpoints.

## UX requirements

- Under a minute to complete for a motivated user. **Time it.**
- Two visible required fields; the rest progressively disclosed.
- Clear copy: *"Não encontrou? Adicione o livro — leva menos de um minuto."*
- Client validation mirrors the server's Zod schema, importing the same schema.
- Inline errors, in pt-BR, next to the field.
- Draft persisted to `localStorage` on change, restored on mount, cleared on success. Wrapped in try/catch — private-mode browsers throw.
- Mobile-first: the form is usable one-handed on a phone.

## Security requirements

- Session required.
- Rate limit 30/user/hour.
- `cover_url` must be `https:`.
- All fields Zod-validated server-side regardless of client validation.
- Title, author and publisher are user input and render escaped everywhere.

## Testing requirements

- Component: submitting only title + author succeeds.
- Component: the form is pre-filled from a search query.
- Component: a 409 renders the duplicate prompt with a working "não, é outro" path.
- Integration: a manually added work is findable via `/api/search` immediately afterwards.
- Integration: `series_number: '1-2'` round-trips.
- Manual: complete the form on a phone in under 60 seconds.

## Acceptance criteria

- [ ] From a search returning nothing, the add form is reachable in one tap with the title pre-filled
- [ ] Title + one author is sufficient to create a work
- [ ] The created work appears in `/api/search` results immediately
- [ ] A duplicate shows the existing work and offers both "é este" and "não, criar assim mesmo"
- [ ] "Criar assim mesmo" creates a second work
- [ ] `series_number` `'1-2'` persists unchanged
- [ ] A cover URL of `javascript:alert(1)` is rejected with an inline error
- [ ] A typed-then-refreshed form restores its draft
- [ ] The form completes in under 60 seconds on a phone
- [ ] Every input has an associated `<label>`

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Resist adding required fields. Every one is a reason for someone to give up, and a work with only a title and author is still a perfectly good catalog row that someone else can improve later.

The "é este?" prompt must always offer an escape. A false duplicate block is worse than a duplicate row.
