# TASK-019 — Migrate the 86 books

## Goal

Import 86 books, 85 ratings and 56 reviews from `legacy/livros.json` into Postgres as the owner's reading history.

## Context

**This is not a routine import.** It is the only content that exists at launch — the first friend who signs up must land on a site with 86 books and 56 reviews, not an empty room. It is also the best available test of the schema: if the 86 rows do not round-trip cleanly, the schema is wrong.

Read [migration.md](../migration.md) in full first. This task implements it and adds nothing.

## Scope

### Included

- `scripts/migrate-livros.ts`
- The owner's `users` and `allowed_emails` rows
- Authors, works, editions, work_genres, reading_logs
- Every validation in [migration.md](../migration.md) §7
- Deleting `legacy/livros_lidos_atualizado.csv`

### Explicitly excluded

- Any Open Library enrichment during import
- Migrating any other user
- Deleting `legacy/livros.json` — it stays as the source of record

## Dependencies

- TASK-004, TASK-009

## Expected files/components

```
scripts/migrate-livros.ts
tests/integration/migration.test.ts
```

## Implementation requirements

1. **One transaction.** Any failure rolls back completely — there is no partial-import state to reason about.
2. Insert order per [migration.md](../migration.md) §3: users → genres (already seeded) → authors → works → work_authors → editions → work_genres → reading_logs.
3. Reuse the TASK-009 catalog services rather than writing parallel insert logic — the migration should exercise the real code path.
4. **Every mapping table comes from [migration.md](../migration.md) §4 and §5.** Do not invent mappings.
5. **An unmapped genre, country or language must stop the migration**, not be silently dropped. Silent dropping is exactly how the current 26-vs-15 genre drift happened.
6. Review conversion: `<br><br>` → `\n\n`, `<br>` → `\n`, then **assert no `<` remains in any review**. That assertion is what makes the "reviews are plain text" security property true rather than assumed.
7. `finished_on = make_date(read_in, 1, 1)`, `finished_precision = 'ano'`. `started_on` stays NULL — it was never recorded and must not be invented.
8. `editions.published_year` stays **NULL**. `book.year` is the *work's* first publication, not this printing's; copying it would assert that a modern Companhia das Letras printing of an 1899 novel was published in 1899.
9. `editions.language = 'pt'` — all 46 publishers in the corpus are Brazilian imprints.
10. **Preserve reading order**: `created_at = make_date(read_in,1,1) + (array_index * interval '1 minute')`. Array order encodes reading sequence within a year, and TASK-016's sorting depends on it.
11. Idempotent guard: refuse to run if `reading_logs` is non-empty, unless `--force` is passed.
12. Regenerate `legacy/generos.txt` from the seeded genres and delete `legacy/livros_lidos_atualizado.csv` (3 records stale) in the same commit.

## Data/API changes

Populates every catalog table plus one user and 86 logs.

## UX requirements

None — a script. It should print a clear summary and stop loudly on any validation failure.

## Security requirements

- Runs against `DATABASE_URL_DIRECT` from a laptop, never from CI.
- Owner identity comes from `OWNER_EMAIL` / `OWNER_HANDLE` / `OWNER_NAME`, never hardcoded.
- The owner's email is inserted into `allowed_emails` so sign-in uses the normal flow.
- The review assertion is a security control, not a nicety.

## Testing requirements

Run against the real 86 rows, not fixtures. Assert:

- `works` = 86, `editions` = 86, `reading_logs` = 86
- `authors` = the expected count (59, or 61 if multi-author splits occur) — asserted, not assumed
- logs with a non-null review = **56**
- logs with a non-null rating = **85**
- `select count(*) from reading_logs where review like '%<%'` = **0**
- `min(first_published_year)` = **-500**
- every `edition_id` is non-null and belongs to its `work_id`
- `sum(page_count)` equals the sum of `pages` in the JSON
- all 86 `isbn13` values are distinct and valid
- `work_genres` count equals the sum of genre-array lengths

Plus spot checks: *O retorno do rei* (series `O Senhor dos Anéis` #3, read 2026, review with paragraph breaks); the Pollyanna omnibus keeps `series_number = '1-2'`; the Robots prequel keeps `'0.1'`; the unrated book has `rating IS NULL`, not 0.

## Acceptance criteria

- [ ] The script completes and reports 86 works, 86 editions, 86 logs
- [ ] `select count(*) from reading_logs where review is not null` returns 56
- [ ] `select count(*) from reading_logs where rating is not null` returns 85
- [ ] `select count(*) from reading_logs where review like '%<%'` returns 0
- [ ] `select min(first_published_year) from works` returns -500
- [ ] The Pollyanna omnibus has `series_number = '1-2'`
- [ ] The Robots prequel has `series_number = '0.1'`
- [ ] The unrated book has `rating IS NULL`
- [ ] A review renders with its original paragraph breaks on `/entrada/{id}`
- [ ] Ordering by `finished_on DESC, created_at DESC` reproduces the legacy app's order
- [ ] Introducing an unmapped genre into a copy of the JSON causes the script to **abort**
- [ ] A forced failure mid-run leaves all tables empty
- [ ] Re-running without `--force` refuses and changes nothing
- [ ] `legacy/livros_lidos_atualizado.csv` is deleted
- [ ] `legacy/livros.json` still exists, unchanged

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Run this against a throwaway Neon branch first. Branches are free and created in seconds — there is no reason to test a destructive import against the real database.

Verify the migration before inviting anyone. Rollback is only clean while no other user has logged anything, because `ON DELETE RESTRICT` will correctly block deleting works that other people's entries reference. That ordering *is* the rollback plan.
