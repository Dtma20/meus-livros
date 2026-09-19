# TASK-015 — Work page

## Goal

`/livro/{slug}` — a book's page showing its metadata and everyone's visible entries for it.

## Context

The only cross-user surface in the MVP: the page where you discover that three friends also read this book and disagreed about it. Small, and the one place the Work/Edition model earns its keep.

## Scope

### Included

- `/livro/[slug]` server-rendered with OG
- Work metadata, authors, genres, series
- All visible reading logs for the work
- Average rating across visible logs

### Explicitly excluded

- Editing a work
- Edition switching UI
- Similar books, recommendations

## Dependencies

- TASK-013

## Expected files/components

```
app/pages/livro/[slug].vue
server/services/works.ts   (extended)
```

## Implementation requirements

1. Server-rendered. Fetch work + authors + genres + editions + visible logs.
2. Logs filtered through `visibleLogs(viewer)` — a private entry never appears, including in the average.
3. Show: cover (from the best available edition), title, authors (with country), original language, first publication year, series position, genres, and the editions on record.
4. **`first_published_year` may be negative.** Render `-500` as `"500 a.C."`, not `"-500"`.
5. Average rating computed over visible logs only, with the count shown (*"4,3 · 3 leituras"*). Hidden when there are no rated visible logs — never render "0,0".
6. Entries listed newest first, each linking to its permalink, with reader handle, rating and a review excerpt.
7. OG tags: title, author, cover; description is the work metadata plus the read count.
8. `log_count` includes only visible logs.

## Data/API changes

None — reuses services.

## UX requirements

- A reader landing from a shared entry can see who else read it and what they thought.
- Editions listed compactly; absent entirely when there is only one and it adds nothing.
- Genres link nowhere in the MVP (no genre pages) — render as plain chips rather than dead links.
- Empty state when nobody visible has logged it: *"Ninguém registrou esse livro ainda."*

## Security requirements

- Visible logs only, via the helper.
- Private entries excluded from the list **and** from the average — a leaked average is a leak.
- Work metadata is user-supplied via manual add; render escaped.

## Testing requirements

- Integration: a work with 3 público and 1 privado log shows 3 to an anonymous viewer.
- Integration: the owner of the privado log sees 4.
- Integration: the average excludes the privado log for anonymous viewers.
- Integration: a work with `first_published_year = -500` renders `500 a.C.`.
- Integration: a work with no visible logs renders the empty state, not `0,0`.
- Integration: an unknown slug returns 404.

## Acceptance criteria

- [ ] `/livro/{slug}` returns 200 with title, authors and genres
- [ ] A work with 3 público and 1 privado log shows exactly 3 entries anonymously
- [ ] The privado log's owner sees 4
- [ ] The average rating excludes entries the viewer cannot see
- [ ] `first_published_year = -500` renders as `500 a.C.`
- [ ] A work nobody has logged shows the empty state and no rating
- [ ] Each listed entry links to its `/entrada/{id}`
- [ ] An unknown slug returns 404 via `error.vue`
- [ ] OG tags are present and absolute

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

The negative-year rendering is not a curiosity: the corpus contains a work from −500 and rendering it as `-500` looks broken on the first page anyone checks.

Including a private entry in a public average is a subtle leak — with few readers, an average shifting from 4.0 to 4.3 reveals both that an entry exists and roughly what it says.
