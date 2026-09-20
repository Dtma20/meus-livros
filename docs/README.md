# meus-livros — technical entry point

**What we're building:** a small social reading platform in Brazilian Portuguese — "Letterboxd for books" — for the owner's ~30-person university friend group. Read → log → rate/review → share to WhatsApp → someone else discovers → logs their own.

**Status:** implementation under way. Eight of 26 tasks are merged — scaffold, database, schema, migration, design system, routing shell, catalog services and search. The database holds the 86 migrated books. Current state and what is still in flight: [agent-workflow.md](agent-workflow.md) §5.

---

## Start here

| If you want to… | Read |
|---|---|
| Understand the system shape | [architecture.md](architecture.md) |
| Know exactly what ships in v1 | [mvp-definition.md](mvp-definition.md) |
| Write a migration or a query | [database.md](database.md) |
| Add a server route | [api.md](api.md) |
| Add a page or component | [frontend.md](frontend.md) |
| Touch user input or auth | [security.md](security.md) |
| Work on book search or covers | [book-catalog.md](book-catalog.md) |
| Move the 86 existing books | [migration.md](migration.md) |
| Deploy, back up, or set env vars | [infrastructure.md](infrastructure.md) |
| Know what we deliberately did *not* build | [architecture-review.md](architecture-review.md) |
| Find an unresolved decision | [open-questions.md](open-questions.md) |
| Delegate a task to an agent, or pick up where a session stopped | [agent-workflow.md](agent-workflow.md) |
| **Start coding** | **[tasks/README.md](tasks/README.md)** |

The product discovery that preceded all of this is in [product-discovery.md](product-discovery.md) and [feature-backlog.md](feature-backlog.md). Those are **historical context**. Where they disagree with the documents above, the documents above win — several of their recommendations were overturned by measurement (see [architecture-review.md](architecture-review.md) §"What the discovery got wrong").

---

## The stack, in one table

| Layer | Choice | One-line reason |
|---|---|---|
| Framework | **Nuxt 4** (Vue 3, TypeScript) | Vue continuity with the existing code, and SSR is non-negotiable because WhatsApp link previews are the entire distribution channel |
| Backend | **Nuxt server routes** (`server/api/**`), same project | One repo, one deploy, one language. No separate API service |
| Hosting | **Vercel Hobby** (free, non-commercial) | Zero-config Nitro preset, full Node runtime, region `gru1` (São Paulo) |
| Database | **Neon free** Postgres | Resumes automatically in <1s after idle. Supabase free *pauses after 7 days and needs a manual dashboard click* — unacceptable for a project with intermittent use |
| Query layer | **Drizzle ORM** + `postgres.js` | Real SQL, real TypeScript types, migrations versioned in git |
| Auth | **better-auth**, email OTP via **Gmail SMTP** (`nodemailer`) | Google OAuth returns `403 disallowed_useragent` inside WhatsApp's Android WebView — it breaks in the exact channel this product lives in |
| Registration gate | **Email allowlist** table | Invite-only without codes, cookies, claim races or an admin UI |
| Authorization | **Server code**, no RLS | All access already passes through trusted server routes; RLS would be a second mental model for zero added safety |
| Search | **Local Postgres `ILIKE`** over an unaccented generated column | ~1,500 rows. Open Library search averages **8.4s** and is unusable synchronously (measured — see below) |
| Catalog | **The community's own books** + manual add; Open Library as *optional* enrichment | Only **40%** of the owner's Brazilian editions exist in Open Library (measured) |
| Analytics | One `search_misses` table | The metric that decides the project is a `GROUP BY` over `reading_logs` |
| Testing | **Vitest** + a handful of integration tests | Enough to protect the visibility rule and the migration |

Total infrastructure cost: **R$ 0,00/month.** See [infrastructure.md](infrastructure.md) for the numbers and the ceilings.

---

## The three measurements that shaped this architecture

Every one of these overturned a recommendation from the discovery phase. All were run against the real data in `livros.json`.

1. **Open Library has 12 of 30 Brazilian editions (40%).** Harry Potter/Rocco: 5 of 7 missing. Percy Jackson/Intrínseca: 4 of 5 missing. Companhia das Letras: 4 missing.
   → Open Library cannot be the catalog. The community's own table is the catalog; manual entry is a **primary path**, not a fallback.
2. **Open Library search averages 8.4s (range 2.5s–21s, with outright timeouts).**
   → It cannot sit in a synchronous search box. Search is local and instant; Open Library is an optional "buscar dados online" button with a 2s timeout.
3. **Supabase free projects pause after 7 days idle and require a manual dashboard restore** (not a 10–30s cold start, as the discovery doc assumed).
   → Neon instead. This also deletes the keep-alive cron, the monitoring for that cron, and the GitHub-Actions-disabled-after-60-days problem that came with it.

---

## Core data model

Ten tables. The full DDL is in [database.md](database.md).

```
users ──< reading_logs >── works ──< work_authors >── authors
                │             │
                │             ├──< work_genres >── genres
                │             │
                └──> editions ─┘
```

**`reading_logs` is the atomic unit** — one row per *reading occasion*, not one per book. There is deliberately no `UNIQUE (user_id, work_id)`, which is what makes re-reads work and what Goodreads structurally cannot do.

**Work vs Edition vs Reading Log** — the rule, asked in this order, first YES wins:

1. *Would two people reading different translations still agree on this?* → **Work** (title, author, original language, first publication year, genre, series)
2. *Would this change if I bought a different printing, with my opinion unchanged?* → **Edition** (ISBN, publisher, page count, cover, edition year)
3. *Would another reader holding the same physical copy disagree with me?* → **Reading Log** (rating, review, dates, format, visibility)

`reading_logs.edition_id` is **nullable and usually null**. Picking an edition is a secondary, collapsed control — forcing a bibliographic decision at the moment someone finishes a book is the highest-friction thing you can insert into the activation path.

---

## Application structure

```
meus-livros/
├── app/
│   ├── pages/          # file-based routes
│   ├── components/     # BookCard, StarRating, FilterBar, ReadingMap…
│   ├── composables/
│   └── assets/css/     # ports the existing styles.css tokens
├── server/
│   ├── api/            # server routes — the only place that touches the DB
│   ├── db/
│   │   ├── schema.ts   # Drizzle schema — single source of truth
│   │   └── migrations/ # generated SQL, committed
│   ├── services/       # business logic, called by routes
│   └── utils/          # auth helpers, visibility guards
├── scripts/            # one-off: the livros.json migration
├── tests/
├── docs/
└── legacy/             # the original index.html, kept runnable until parity
```

## MVP routes

| Route | Public? | Rendering | Purpose |
|---|---|---|---|
| `/` | yes | SSR | Landing + 10 most recent público entries |
| `/@{handle}` | yes | SSR | Profile: poster grid, filters, stats |
| `/livro/{slug}` | yes | SSR | Work page + everyone's público entries for it |
| `/entrada/{id}` | yes | SSR | **The review permalink — the object that gets pasted into WhatsApp** |
| `/entrar` | yes | SSR | Email OTP sign-in |
| `/app/**` | no | SSR, `no-store` | Authenticated: log a book, edit profile |

Only the four public routes carry Open Graph tags. There is no sitemap and no SEO work — the channel is a group chat, not Google.

---

## Critical path

```
001 scaffold → 002 db connection → 003 schema → 004 migrations
  → 007 auth → 010 search → 011 log a book → 014 entry page (OG) → 019 data migration → 023 deploy
```

Eleven tasks on the critical path out of 26 total. Everything else parallelises around them. Full graph in [tasks/README.md](tasks/README.md).

## First task to execute

**[tasks/001-scaffold-nuxt-project.md](tasks/001-scaffold-nuxt-project.md)** — stand up the Nuxt 4 + TypeScript project alongside the existing static site without breaking it.

Do not start task 001 before answering the two blocking questions in [open-questions.md](open-questions.md).
