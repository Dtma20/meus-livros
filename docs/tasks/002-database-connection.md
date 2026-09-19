# TASK-002 — Neon + Drizzle connection

## Goal

Connect the app to a Neon Postgres database through Drizzle ORM, with separate pooled and direct connection paths.

## Context

Serverless functions must not hold a connection pool. The app uses Neon's pooled endpoint with `max: 1`; migrations and `pg_dump` need session state the pooler does not preserve, so they use the direct endpoint. Getting this wrong produces connection exhaustion under trivial load. See [architecture.md](../architecture.md) §3.4.

## Scope

### Included

- A Neon project and database
- `drizzle-orm` + `postgres` + `drizzle-kit`
- `server/db/index.ts` exporting a configured `db`
- `drizzle.config.ts`
- The `citext` and `unaccent` extensions

### Explicitly excluded

- Any table definition (TASK-003)
- Any migration (TASK-004)
- Any query

## Dependencies

- TASK-001

## Expected files/components

```
server/db/index.ts
drizzle.config.ts
.env.example   (updated)
```

## Implementation requirements

1. Create a Neon project. Record both connection strings.
2. `DATABASE_URL` = **pooled** endpoint (host contains `-pooler`). `DATABASE_URL_DIRECT` = direct endpoint.
3. `server/db/index.ts`: `postgres(process.env.DATABASE_URL!, { max: 1 })` wrapped in `drizzle()`.
4. `drizzle.config.ts` uses `DATABASE_URL_DIRECT`.
5. Fail fast: if `DATABASE_URL` is missing, throw a clear error at startup rather than at first query.
6. Enable extensions:
   ```sql
   CREATE EXTENSION IF NOT EXISTS citext;
   CREATE EXTENSION IF NOT EXISTS unaccent;
   ```
7. Add `db:generate`, `db:migrate`, `db:studio` scripts.
8. Document in `.env.example` **why** there are two URLs — the next person will otherwise use the wrong one.

## Data/API changes

Introduces the database connection. No schema yet.

## UX requirements

None.

## Security requirements

- Both URLs contain credentials. `.env` only; never committed, never logged.
- `server/db/index.ts` must never be importable from `app/` — the TASK-001 lint rule covers this; confirm it fires.
- `DATABASE_URL_DIRECT` is never set in the Vercel environment.

## Testing requirements

- An integration test that connects and runs `select 1`, skipped when `DATABASE_URL` is unset so CI without a database still passes.

## Acceptance criteria

- [ ] `select 1` through `db` returns 1
- [ ] `select extname from pg_extension` includes `citext` and `unaccent`
- [ ] Starting the app with `DATABASE_URL` unset throws a message naming the variable
- [ ] `DATABASE_URL` host contains `-pooler`; `DATABASE_URL_DIRECT` does not
- [ ] `npx drizzle-kit studio` connects
- [ ] Importing `~/server/db` from a file in `app/` fails lint

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

`max: 1` is not a typo and not a performance bug. Each serverless invocation gets its own process; Neon's pooler does the pooling. A larger `max` multiplies connections by concurrent invocations and exhausts the limit.

Use a Neon **branch** for local development rather than installing Postgres. Branches are copy-on-write, created in seconds, and free.
