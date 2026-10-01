# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Today:** a Nuxt 4 application at the repository root, built task by task from the plan in `docs/`. Tasks 001-068 are on `develop`, except the launch gates: 023 (deploy to Vercel) has not been done, 024 (security hardening pass) is open, and 022 (backups) has its workflow and runbook but no committed public key - without which the workflow refuses to dump - and no recorded restore. 012's Open Library lookup was merged and then removed on 2026-09-24; books enter by manual entry only. The app has not been deployed. The original static site is kept in `legacy/`.

**Where it is going:** a small social reading platform for the owner's ~30-person university friend group. Multi-user, pt-BR-first, invite-only, zero infrastructure cost. What is left before the first invite is deployment and the pre-launch checks - see [docs/agent-workflow.md](docs/agent-workflow.md) §5.

**Read [docs/README.md](docs/README.md) before doing any architectural work.** The full plan lives in `docs/`, and `docs/tasks/` holds the task files, 001-070 (051 has none - the reviewer did it directly).

---

## Current state

The Nuxt app is the root: `app/`, `server/`, `shared/`, `package.json`. `npm run dev` runs it against the database in `.env`. For a local database, `docker-compose.yml` defines a Postgres container, and `npx tsx scripts/dev.ts` starts Docker, waits for Postgres, seeds the genres and runs `nuxt dev` (it is not wired into `package.json`). `npm run test` refuses to run against a missing or stale `.vercel/output` bundle - run `npm run build` first.

`docs/reports/` holds dated round reports (UX, visual audit, pre-deploy security review, the 2026-09-30 frontend code review) and the agent reports from the correction rounds of 012 and 018. `docs/agent-prompts/` holds the prompts handed to implementing agents.

The pre-Nuxt site lives in `legacy/` and stays runnable until the new app reaches parity; it must be served over HTTP, see [legacy/README.md](legacy/README.md). Its `livros.json` (86 books) was imported by TASK-019. The data quirks that break naive code - a year of −500 (signed column), `series_number` values like `'1-2'` (text column), ISBN-10s and Amazon ASINs (normalise, ASIN stores as `isbn13 = NULL`), `read_in` as a year (precision flag), array order as the reading-order tiebreak - are listed in [docs/migration.md](docs/migration.md) §2. Read it before touching import, ISBNs, dates or sorting.

---

## Architecture

Nuxt 4 SSR with server routes in the same project, on Vercel Hobby (`gru1`); **Neon** Postgres through Drizzle + `postgres.js`; better-auth with **`handle`-or-email + password**, email OTP only for first-access activation and password reset; authorization in one server-side helper, **no RLS**; search is local Postgres `ILIKE`; analytics is one `search_misses` table. Each choice and the alternative it beat (Supabase, Google OAuth, OTP per sign-in, Open Library search) is argued in [docs/architecture.md](docs/architecture.md) - read it before proposing to swap any of them.

---

## Architectural principles

1. **Anti-overengineering is the primary constraint.** When choosing between a simple solution that works today and a sophisticated one for hypothetical scale, choose simple. Justify any complexity with a concrete MVP requirement.
2. **TypeScript-first**, `strict: true`.
3. **PostgreSQL is the source of truth.** Nothing the product depends on is fetched from a third party at read time.
4. **External catalog is enrichment, never dependency.** The product works identically when Open Library is down.
5. **One project, one deploy.** No separate API, no second repo.
6. **Authorization lives in one place** - the visibility helper.
7. **Reviews are plain text.** No HTML is accepted, stored or rendered.
8. **Incremental migration.** The legacy site keeps working until parity.
9. **Measure before optimising.** Every performance decision in `docs/` traces to an observed number.

---

## Folder structure

```
app/          pages/ components/ composables/ assets/css/
server/       api/ db/{schema.ts,migrations/} services/ utils/
shared/       schemas/            # Zod schemas shared by client and server
scripts/      one-off migrations
tests/        unit/ integration/
docs/         the plan + tasks/
legacy/       the pre-Nuxt site, runnable until parity
```

---

## Conventions

### TypeScript
- `strict: true`. No `any` - use `unknown` and narrow.
- Types inferred from the Drizzle schema (`typeof users.$inferSelect`), never hand-duplicated.
- `shared/schemas/` holds Zod schemas imported by **both** the form and the route. One definition.

### Database
- `snake_case` tables and columns; plural table names.
- `server/db/schema.ts` is the source of truth.
- Migrations generated with `drizzle-kit`, **committed**, applied manually from a laptop against `DATABASE_URL_DIRECT` - never from CI.
- Never edit an applied migration. Add a new one.
- Migrations must be backward compatible with the previous release: add a column, deploy code that writes it, *then* make it `NOT NULL`.
- Timestamps are `timestamptz`, always.

### API
- Routes are thin: validate → authorize → call a service → shape the response.
- **Only `server/services/**` may import the `db` handle.** ESLint enforces this. `scripts/**` is exempt: one-off migrations run from a laptop and need the schema, and nothing under `scripts/` is bundled into the app.
- Zod-validate every body and query string. Client validation is a convenience; the server always revalidates.
- Error shape: `{ error: 'codigo_snake_case', message: 'Mensagem em português.' }`.
- **A private resource returns 404, never 403.** A 403 confirms it exists.
- All mutations are POST/PATCH/DELETE. No GET mutates.

### Security - non-negotiable
- **`v-html` is banned repository-wide.** ESLint enforces it. Reviews are plain text; there is no HTML to sanitise.
- Every read of `reading_logs` goes through `visibleLogs(viewer)`. `Viewer` is a **required** parameter, so forgetting it is a compile error.
- Ownership checks happen **in the query**, not after fetching.
- Secrets only in `server/`. Nothing secret in `runtimeConfig.public`.
- `cover_url` must parse as `https:` - this blocks `javascript:` reaching `<img src>`.
- 500 responses never carry stack traces or database messages.

### Frontend
- Components are presentational: props in, events out. Data fetching lives in pages.
- Server-render by default; client-side only where interaction demands it.
- No Pinia until two distant components genuinely share mutable state.
- Every list needs empty, error and loading states.
- All UI copy in pt-BR.
- Dates default from the **browser's** local date - the server is UTC and the cohort is UTC−3, so a server default records tomorrow for anything logged after 21:00.

### Testing
- Vitest. Unit tests for pure logic; integration tests for four things: the visibility helper, rating validation, ISBN normalisation, and the `livros.json` migration.
- No coverage threshold, no E2E framework, no snapshot tests.
- Acceptance criteria must be objectively verifiable. "Search works well" is not a criterion.

### Git
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- **One task, one commit or PR.** A task needing a second commit was too big.
- Commit messages in English; UI copy in Portuguese.
- `typecheck` and `lint` pass before every commit.

---

## How to approach a task here

1. **Read the task file in `docs/tasks/` completely**, including its Explicitly excluded section.
2. Read the documents it links. They contain decisions already made - do not re-derive them.
3. Check dependencies are done.
4. Implement only what is in scope. Out-of-scope improvements go in the PR description, not the diff.
5. Verify every acceptance criterion literally. They are written to be checkable.
6. Run `typecheck`, `lint`, `test`.

### Before adding any dependency or infrastructure

Ask, in order:

1. Does the MVP actually require this?
2. What simpler solution solves the same problem?
3. What concrete evidence justifies the complexity?
4. What operational burden does it add?
5. **Can this decision be postponed?** If yes - postpone it.

[docs/architecture-review.md](docs/architecture-review.md) lists what was deliberately *not* built and why. Read it before proposing Redis, a queue, a cache, an ORM change, or a service. Most of those arguments have already been had.

### Things that will look like bugs but are deliberate

- **No `UNIQUE (user_id, work_id)` on `reading_logs`** - its absence is what makes re-reads work.
- **`reading_logs.edition_id` is nullable and usually null** - picking an edition is optional by design.
- **`editions.isbn13` has a *partial* unique index** - "no ISBN" must be a repeatable legal state.
- **No RLS** - all access already passes through trusted server routes.
- **No cached counts** - aggregates are live.
- **Search does not call Open Library** - it averages 8.4s and misses 60% of Brazilian editions.
- **There are two user tables, and `session` points at the other one.** better-auth owns `ba_user`, `account`, `session` and `verification`; the application owns `users`. `session."userId"` references **`ba_user.id`**, never `users.id`, and the two ids are different values for the same person. Joining `session` to `users` returns zero rows - which reads as "this account has no sessions" and is indistinguishable from real revocation. Reach `session` through `ba_user`, matching on `email`.
- **A revoked session keeps working for up to 5 minutes.** `session.cookieCache` is enabled with `maxAge: 5 * 60`, which skips the `session` table on every request. Both `revokeSessionsOnPasswordReset` and change-password's `revokeOtherSessions` delete the row immediately, but a client whose cached cookie is still valid stays signed in until that copy expires. The trade-off is deliberate and is documented where the cache is enabled in `server/services/auth.ts`. **Assert revocation against the `session` table, never by replaying the cookie** - a test that replays it is asserting something the code does not promise.

---

## Deferred, deliberately

The post-MVP list and the reason each item can wait are in [docs/mvp-definition.md](docs/mvp-definition.md) §4. Every deferred feature is additive and changes no existing table.

**One hard gate:** if public registration is ever opened, moderation tooling ships first.
