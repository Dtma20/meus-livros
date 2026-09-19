# TASK-009 — Catalog services and ISBN normalisation

## Goal

Server-side services for creating and reading works, editions and authors, including ISBN-10 → ISBN-13 normalisation and duplicate detection.

## Context

The catalog layer everything else builds on. TASK-019 uses these same services to import the 86 books, which is deliberate: the migration exercises the real code path rather than a parallel one.

## Scope

### Included

- `server/services/catalog.ts`
- ISBN normalisation and validation
- Slug generation with collision handling
- Author matching/creation by slug
- Duplicate-work detection
- `POST /api/works`, `POST /api/works/:id/editions`

### Explicitly excluded

- Search (TASK-010)
- The UI (TASK-011)
- Open Library (TASK-012)

## Dependencies

- TASK-004

## Expected files/components

```
server/services/catalog.ts
server/utils/isbn.ts
server/utils/slug.ts
server/api/works/index.post.ts
server/api/works/[id]/editions.post.ts
shared/schemas/work.ts
```

## Implementation requirements

1. `normalizeIsbn(raw)`:
   - Strip hyphens and whitespace; strip a trailing `.0` (the CSV export wrote ISBNs as floats).
   - Length 10 → drop the check digit, prefix `978`, recompute the EAN-13 check digit.
   - Validate the ISBN-13 checksum. Return `null` on failure — never store a malformed ISBN.
   - 22 of the 86 corpus ISBNs are ISBN-10, so this path is well exercised.
2. `slugify(text)`: unaccent, lowercase, non-alphanumerics to `-`, collapse repeats, trim. Collisions get `-2`, `-3`.
3. `findOrCreateAuthor(name, country?)`: match by slug, create if absent.
4. `createWork(input, userId)`:
   - Validate with Zod. `first_published_year` range `-3000..2100` — **signed**, the corpus contains `-500`.
   - `series_number` is a string, max 20 chars.
   - Create/link authors with ascending `position`.
   - Link genres by id; reject ids not in `genres`.
   - Optionally create one edition.
5. Duplicate detection: same `f_unaccent(lower(title))` **and** ≥1 shared author slug → return `409` with the existing work. **`?forcar=1` bypasses it** — a false duplicate block dead-ends the activation path, which is worse than a duplicate row.
6. `createEdition`: normalise the ISBN first, then insert. A unique violation maps to `409`, never a 500.
7. Catalog rows carry no visibility. Anyone may create; **there is no delete endpoint**.
8. `cover_url` must parse as a URL with an `https:` scheme.

## Data/API changes

- `POST /api/works` → 201 `{ id, slug }` | 409 `{ error: 'conflito', work }`
- `POST /api/works/:id/editions` → 201 | 409

## UX requirements

None directly — TASK-011 builds the UI.

## Security requirements

- Session required for both endpoints.
- Rate limit: 30 works/user/hour.
- `cover_url` scheme validated — blocks `javascript:` and `data:` reaching `<img src>`.
- `created_by` recorded on every catalog row for later repair.
- All input is Zod-validated; title ≤ 300, authors ≤ 5.

## Testing requirements

- Unit `normalizeIsbn`: `'8535902775'` → a valid ISBN-13; `'9788535902778'` unchanged; `'9788535902779'` (bad checksum) → null; `'9788598078397.0'` → cleaned; `'abc'` → null.
- Unit `slugify`: `'Ficção Científica'` → `'ficcao-cientifica'`; collisions suffix correctly.
- Integration: creating a work with `first_published_year: -500` succeeds.
- Integration: `series_number: '1-2'` and `'0.1'` both persist unchanged.
- Integration: a duplicate title+author returns 409; with `?forcar=1` it creates a second row.
- Integration: two editions with null ISBN both insert; two with the same ISBN → 409.
- Integration: `cover_url: 'javascript:alert(1)'` returns 400.

## Acceptance criteria

- [ ] All ISBN unit cases pass, including the `.0` suffix
- [ ] A work with year `-500` is created and reads back as `-500`
- [ ] `series_number` `'0.1'` round-trips exactly
- [ ] A duplicate returns 409 carrying the existing work
- [ ] `?forcar=1` creates the duplicate and returns 201
- [ ] Two null-ISBN editions coexist
- [ ] A duplicate ISBN returns 409, not 500
- [ ] `javascript:` cover URLs are rejected with 400
- [ ] An unauthenticated `POST /api/works` returns 401
- [ ] The 31st work in an hour returns 429

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Write `normalizeIsbn` first and test it against all 86 real ISBNs from `legacy/livros.json` before anything else — TASK-019 depends on all 86 normalising cleanly and staying distinct.

The `?forcar=1` escape hatch matters more than it looks. Blocking a legitimate book because a fuzzy match misfired means the user cannot log what they just read, which is the one thing the product exists to do.
