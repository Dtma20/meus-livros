# TASK-003 — Define the Drizzle schema

## Goal

Express the ten-table schema from [database.md](../database.md) in `server/db/schema.ts`.

## Context

The single most expensive thing to get wrong. Work/Edition/ReadingLog placement, the absence of a uniqueness constraint that would break re-reads, and three data-shape landmines found by inspecting the real corpus all live here. Read [database.md](../database.md) in full before starting — this task implements it and adds nothing.

## Scope

### Included

- Enums: `visibility`, `date_precision`, `book_format`, `genre_kind`
- Tables: `users`, `allowed_emails`, `authors`, `works`, `work_authors`, `editions`, `genres`, `work_genres`, `reading_logs`, `search_misses`
- Indexes, FKs, CHECK constraints, delete behaviour
- Drizzle `relations()`
- Exported inferred types

### Explicitly excluded

- Generating or applying migrations (TASK-004)
- better-auth's tables — its CLI generates them (TASK-007)
- `follows`, `lists`, `likes`, `shelf_items` — deferred features

## Dependencies

- TASK-002

## Expected files/components

```
server/db/schema.ts
server/db/types.ts
```

## Implementation requirements

1. Transcribe the DDL from [database.md](../database.md) §3 exactly. Where Drizzle cannot express something, leave a `// hand-written in migration` comment — TASK-004 adds it.
2. **Three landmines that must be handled, each verified against the real data:**
   - `works.first_published_year` is a **signed** integer. The corpus contains `-500`. No unsigned type, no `> 0` check.
   - `works.series_number` is **text**, not numeric. Real values include `'1-2'` and `'0.1'`.
   - `editions.isbn13` is `char(13)` with a **partial** unique index (`WHERE isbn13 IS NOT NULL`). "No ISBN" must be a repeatable legal state.
3. **`reading_logs` must NOT have `unique(user_id, work_id)`.** Add a comment saying so and why — someone will try to add it.
4. `reading_logs.rating` is `numeric(2,1)` with `CHECK (rating >= 0.5 AND rating <= 5.0 AND (rating*2) = trunc(rating*2))`.
5. `reading_logs.review` is `text`. There is no `review_html`.
6. `visibility` columns on `users.profile_visibility` and `reading_logs.visibility`, both `NOT NULL DEFAULT 'publico'`.
7. Delete behaviour per [database.md](../database.md) §5. In particular `works → reading_logs` is **RESTRICT**, never CASCADE.
8. Indexes: `reading_logs (user_id, finished_on DESC NULLS LAST)`, `reading_logs (work_id)`, partial `reading_logs (created_at DESC) WHERE visibility='publico'`, `work_authors (author_id)`, `editions (work_id)`.
9. Export `type User = typeof users.$inferSelect` etc. for every table.
10. Mark `search_text` and the `f_unaccent` function as hand-written for TASK-004.

## Data/API changes

Defines the entire schema. No runtime behaviour yet.

## UX requirements

None.

## Security requirements

- `visibility` columns default to `'publico'` at the database level, not only in application code.
- The rating CHECK is a database constraint, not only Zod — a bug in a route must not be able to write `3.7`.

## Testing requirements

Type-level only at this stage: a test file that imports every exported type and constructs one object of each, proving the schema compiles and the inferred types are usable.

## Acceptance criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npx drizzle-kit generate` produces SQL without error
- [ ] The generated SQL contains `integer` (not unsigned) for `first_published_year`
- [ ] The generated SQL contains `text` for `series_number`
- [ ] The generated SQL contains **no** unique constraint on `(user_id, work_id)` in `reading_logs`
- [ ] The generated SQL contains the partial unique index on `editions.isbn13`
- [ ] The generated SQL contains `ON DELETE RESTRICT` for `reading_logs.work_id`
- [ ] Both `visibility` columns show `DEFAULT 'publico'`
- [ ] Ten application tables are present, no more

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Have this reviewed before TASK-004. It is the one artifact in the project where a mistake is expensive rather than annoying.

If you find yourself wanting a `books` table instead of `works` + `editions`, read [architecture-review.md](../architecture-review.md) §3 — that argument was made, considered, and rejected for a specific reason.
