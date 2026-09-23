# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Today:** a static, single-page personal reading library (pt-BR, Letterboxd-style dark grid). No build step, no package manager, no tests — Vue 3 and Google Charts load from CDN `<script>` tags in `index.html`.

**Where it is going:** a small social reading platform for the owner's ~30-person university friend group. Multi-user, pt-BR-first, invite-only, zero infrastructure cost. Planning is complete; implementation has not started.

**Read [docs/README.md](docs/README.md) before doing any architectural work.** The full plan lives in `docs/`, and `docs/tasks/` holds 26 executable tasks.

---

## Current state (pre-migration)

Must be served over HTTP — the app `fetch`es `livros.json`, so `file://` fails on CORS.

```bash
python -m http.server 8000
```

| File | Role |
|---|---|
| `index.html` | The whole app: markup + one inline `createApp({ setup() })` block. All state, filtering, sorting, stats and the map |
| `livros.json` | The runtime data source — 86 books |
| `styles.css` | CSS custom properties on `:root`. Dark only, one 600px breakpoint |
| `generos.txt` | Genre vocabulary (drifted: 26 labels in the data vs ~15 here) |
| `livros_lidos_atualizado.csv` | **Stale.** 83 records vs 86. Not read at runtime. Deleted in TASK-019 |

Once TASK-001 runs, these move to `legacy/` and stay runnable until the new app reaches parity.

### Book record shape

```json
{
  "title": "...", "author": "...", "country": "EUA", "original_language": "inglês",
  "year": 2005, "publisher": "...", "pages": 400, "read_in": 2014, "rate": 4,
  "review": null, "source": "Físico",
  "series_name": "...", "series_number": "1",
  "genre": ["Ficção", "Aventura", "Fantasia"],
  "isbn": "9788598078397", "cover_url": null
}
```

### Data landmines — verified, and they break naive code

| Landmine | Consequence |
|---|---|
| `year` reaches **−500** | `first_published_year` must be a **signed** integer. No `> 0` check |
| `series_number` contains `'1-2'` and `'0.1'` | The column is **text**, never numeric |
| 64 ISBN-13, **19 ISBN-10**, **3 Amazon ASINs** | Normalise to ISBN-13 before any uniqueness constraint. An ASIN stores as `isbn13 = NULL` |
| `original_language` has `'português'` and `'Português'` | Case-fold before mapping |
| `read_in` is a **year**, not a date | Needs a precision flag alongside the date |
| Reviews contain 178 `<br>` and nothing else | Convert to `\n`; store plain text |
| `country` includes `'Roma Antiga'` | No ISO code exists |
| Array order encodes reading order within a year | Preserve it — every sort uses it as a tiebreak |

---

## Target architecture

Full detail in [docs/architecture.md](docs/architecture.md). Summary:

| Layer | Choice |
|---|---|
| Framework | Nuxt 4 (Vue 3, TypeScript, SSR) |
| Backend | Nuxt server routes, same project |
| Hosting | Vercel Hobby, region `gru1` |
| Database | **Neon** Postgres (not Supabase — Supabase free pauses after 7 days and needs a manual restore) |
| Query layer | Drizzle ORM + `postgres.js` |
| Auth | better-auth, **`handle`-or-email + password**; email OTP (Gmail SMTP) kept only for first-access activation and password reset. Not Google OAuth — it 403s inside WhatsApp's WebView; not OTP-per-sign-in — it forces an app switch out of that same WebView on every session expiry |
| Authorization | Server-side helper, **no RLS** |
| Search | Local Postgres `ILIKE` (Open Library averages 8.4s and has 40% coverage of Brazilian editions) |
| Analytics | One `search_misses` table |

---

## Architectural principles

1. **Anti-overengineering is the primary constraint.** When choosing between a simple solution that works today and a sophisticated one for hypothetical scale, choose simple. Justify any complexity with a concrete MVP requirement.
2. **TypeScript-first**, `strict: true`.
3. **PostgreSQL is the source of truth.** Nothing the product depends on is fetched from a third party at read time.
4. **External catalog is enrichment, never dependency.** The product works identically when Open Library is down.
5. **One project, one deploy.** No separate API, no second repo.
6. **Authorization lives in one place** — the visibility helper.
7. **Reviews are plain text.** No HTML is accepted, stored or rendered.
8. **Incremental migration.** The legacy site keeps working until parity.
9. **Measure before optimising.** Every performance decision in `docs/` traces to an observed number.

---

## Folder structure (post-TASK-001)

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
- `strict: true`. No `any` — use `unknown` and narrow.
- Types inferred from the Drizzle schema (`typeof users.$inferSelect`), never hand-duplicated.
- `shared/schemas/` holds Zod schemas imported by **both** the form and the route. One definition.

### Database
- `snake_case` tables and columns; plural table names.
- `server/db/schema.ts` is the source of truth.
- Migrations generated with `drizzle-kit`, **committed**, applied manually from a laptop against `DATABASE_URL_DIRECT` — never from CI.
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

### Security — non-negotiable
- **`v-html` is banned repository-wide.** ESLint enforces it. Reviews are plain text; there is no HTML to sanitise.
- Every read of `reading_logs` goes through `visibleLogs(viewer)`. `Viewer` is a **required** parameter, so forgetting it is a compile error.
- Ownership checks happen **in the query**, not after fetching.
- Secrets only in `server/`. Nothing secret in `runtimeConfig.public`.
- `cover_url` must parse as `https:` — this blocks `javascript:` reaching `<img src>`.
- 500 responses never carry stack traces or database messages.

### Frontend
- Components are presentational: props in, events out. Data fetching lives in pages.
- Server-render by default; client-side only where interaction demands it.
- No Pinia until two distant components genuinely share mutable state.
- Every list needs empty, error and loading states.
- All UI copy in pt-BR.
- Dates default from the **browser's** local date — the server is UTC and the cohort is UTC−3, so a server default records tomorrow for anything logged after 21:00.

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
2. Read the documents it links. They contain decisions already made — do not re-derive them.
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
5. **Can this decision be postponed?** If yes — postpone it.

[docs/architecture-review.md](docs/architecture-review.md) lists what was deliberately *not* built and why. Read it before proposing Redis, a queue, a cache, an ORM change, or a service. Most of those arguments have already been had.

### Things that will look like bugs but are deliberate

- **No `UNIQUE (user_id, work_id)` on `reading_logs`** — its absence is what makes re-reads work.
- **`reading_logs.edition_id` is nullable and usually null** — picking an edition is optional by design.
- **`editions.isbn13` has a *partial* unique index** — "no ISBN" must be a repeatable legal state.
- **No RLS** — all access already passes through trusted server routes.
- **No cached counts** — aggregates are live.
- **Search does not call Open Library** — it averages 8.4s and misses 60% of Brazilian editions.
- **There are two user tables, and `session` points at the other one.** better-auth owns `ba_user`, `account`, `session` and `verification`; the application owns `users`. `session."userId"` references **`ba_user.id`**, never `users.id`, and the two ids are different values for the same person. Joining `session` to `users` returns zero rows — which reads as "this account has no sessions" and is indistinguishable from real revocation. Reach `session` through `ba_user`, matching on `email`.
- **A revoked session keeps working for up to 5 minutes.** `session.cookieCache` is enabled with `maxAge: 5 * 60`, which skips the `session` table on every request. Both `revokeSessionsOnPasswordReset` and change-password's `revokeOtherSessions` delete the row immediately, but a client whose cached cookie is still valid stays signed in until that copy expires. The trade-off is deliberate and is documented where the cache is enabled in `server/services/auth.ts`. **Assert revocation against the `session` table, never by replaying the cookie** — a test that replays it is asserting something the code does not promise.

---

## Deferred, deliberately

Follows, activity feed, likes, lists, want-to-read, notifications, comments, statistics/year-in-review, author/genre/country pages, Goodreads import, SEO/sitemaps, moderation tooling, recommendations, PWA.

Each is additive and changes no existing table — which is why deferring them is safe. Reasoning in [docs/mvp-definition.md](docs/mvp-definition.md) §4.

**One hard gate:** if public registration is ever opened, moderation tooling ships first.
