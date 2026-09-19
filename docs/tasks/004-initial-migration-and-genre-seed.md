# TASK-004 — Initial migration and genre seed

## Goal

Apply the schema to Neon and seed the 26 genres.

## Context

Unblocks auth, catalog and migration simultaneously — the widest bottleneck in the graph. Also adds the three SQL objects Drizzle cannot express.

## Scope

### Included

- Generate and apply the initial migration
- Hand-written SQL: `f_unaccent`, the generated `search_text` column, the partial unique index
- Seed 26 genres from [migration.md](../migration.md) §5
- Regenerate `generos.txt` from the seed

### Explicitly excluded

- Migrating `livros.json` (TASK-019)
- better-auth tables (TASK-007)

## Dependencies

- TASK-003

## Expected files/components

```
server/db/migrations/0000_*.sql
server/db/migrations/0001_search_and_indexes.sql   (hand-written)
scripts/seed-genres.ts
legacy/generos.txt   (regenerated)
```

## Implementation requirements

1. `npm run db:generate`, then **read the generated SQL before applying it**. Drizzle occasionally emits a drop where a rename was intended.
2. Hand-write `0001`:
   ```sql
   CREATE FUNCTION f_unaccent(text) RETURNS text
     AS $$ SELECT public.unaccent('public.unaccent', $1) $$
     LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE;

   ALTER TABLE works ADD COLUMN search_text text
     GENERATED ALWAYS AS (f_unaccent(lower(title))) STORED;

   CREATE INDEX works_search_idx ON works (search_text text_pattern_ops);

   CREATE UNIQUE INDEX editions_isbn13_key ON editions (isbn13)
     WHERE isbn13 IS NOT NULL;
   ```
   The `f_unaccent` wrapper is **required**: `unaccent()` is `STABLE`, and Postgres rejects a `STABLE` function in a generated column with *"generation expression is not immutable"*.
3. Apply with `npm run db:migrate` against `DATABASE_URL_DIRECT`.
4. `scripts/seed-genres.ts` inserts the 26 rows from [migration.md](../migration.md) §5 with stable, hardcoded ids. Idempotent (`ON CONFLICT DO NOTHING`).
5. Regenerate `legacy/generos.txt` from the seeded rows, grouped by `kind`, so file and database agree.

## Data/API changes

Creates every application table and seeds `genres`.

## UX requirements

None.

## Security requirements

- Migrations run from a laptop against the direct endpoint, never from CI.
- The applied migration must be committed before the code that depends on it is deployed.

## Testing requirements

- An integration test asserting all 10 tables exist.
- A test asserting `select count(*) from genres` = 26.
- A test asserting `f_unaccent('Ficção Científica')` = `'Ficcao Cientifica'`.
- A test asserting an `INSERT` into `reading_logs` with `rating = 3.7` is **rejected** by the database.

## Acceptance criteria

- [ ] All 10 application tables exist in Neon
- [ ] `select count(*) from genres` returns 26
- [ ] `select f_unaccent('coração')` returns `coracao`
- [ ] `works.search_text` is populated automatically on insert and is not writable
- [ ] Two editions with `isbn13 = NULL` can coexist; two with the same non-null ISBN cannot
- [ ] `INSERT INTO reading_logs (..., rating) VALUES (..., 3.7)` raises a check violation
- [ ] `INSERT INTO reading_logs (..., rating) VALUES (..., 4.5)` succeeds
- [ ] Two `reading_logs` rows with the same `(user_id, work_id)` both insert successfully
- [ ] `legacy/generos.txt` lists exactly the 26 seeded genres
- [ ] Re-running the seed changes nothing

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

The re-read acceptance criterion is the important one. If two logs for the same user and work cannot both insert, a uniqueness constraint crept in and re-reads are broken.

Genre ids are hardcoded and stable because TASK-019 references them by id.
