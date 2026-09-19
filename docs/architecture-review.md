# Architecture review — the overengineering pass

A deliberate audit performed before finalising the plan. The test applied to every component:

> **If removing this makes the MVP significantly simpler without preventing the core loop from working, remove it.**

Several things were removed on that basis. They are listed here so nobody adds them back by reflex, and so the reasoning survives.

---

## 1. Complexity we deliberately avoided

| Avoided | Would have been for | What we do instead |
|---|---|---|
| **Redis** | Rate limiting, sessions, caching | A Postgres table. At 30 users a counter row *is* the correct implementation; Redis would be infrastructure for its own sake |
| **Elasticsearch / OpenSearch** | Book search | `ILIKE` over a generated unaccented column. ~1,500 rows is a sub-millisecond scan |
| **Postgres FTS + `pg_trgm`** | "Proper" search | Same. Dictionary config, GIN indexes and ranking are engineering for a corpus 30× larger. Documented ceiling: ~50k works |
| **Message queues / background workers** | Catalog sync, feed fan-out, OG generation, imports | Every one of those jobs belongs to a deferred feature. There is no background work in the MVP |
| **A separate API service or repo** | "Clean separation" | Nuxt server routes in the same project. One repo, one deploy, one language |
| **Microservices, CQRS, event sourcing** | — | Ten tables and CRUD |
| **Row-level security** | Público/privado | One server-side helper. RLS is mandatory when a browser talks to PostgREST directly; nothing does here, so it would be a second authorization model in a second language for zero added safety |
| **ISR / edge caching** | Fast public pages | Plain SSR. 30 users ≈ 2,000 views/month ≈ **0.2%** of Vercel's 1M invocations. A cache saves nothing measurable and breaks read-your-own-write |
| **A staging environment** | Safe deploys | Vercel preview deployments plus a Neon branch. A staging env is a second place for config to drift |
| **CI-run migrations** | Automated schema deploys | `npm run db:migrate` from a laptop. An automated migration against production on every push is a far larger foot-gun than a forgotten command |
| **An HTML sanitiser (DOMPurify)** | Safe reviews | **Plain text.** Measured: the entire 56-review corpus contains one tag type (`<br>` ×178). Not parsing HTML removes the vulnerability class instead of mitigating it, and removes a dependency with its own CVE history |
| **A design system / component library** | UI consistency | The existing `styles.css` tokens. A component library plus a Tailwind toolchain is a new system to learn in a project whose frontend already exists |
| **Pinia** | State management | `useAsyncData` + local refs. No two distant components share mutable state yet |
| **Sentry** | Error tracking | Vercel runtime logs. 30 users produce few enough errors to read by hand |
| **A custom ESLint rule enforcing anon-key-only rendering** | Cache-poisoning safety | Removed the invariant instead of policing it: no cached routes, no rule needed |
| **Two Postgres roles (DDL owner + DML runtime)** | Least privilege | One connection string. Per-table grants plus `ALTER DEFAULT PRIVILEGES` on every future table is a recurring break for a solo maintainer |
| **A polymorphic `likes` table** | Future likeability | No likes at all in the MVP |
| **`publishers`, `series`, `lists`, `follows`, `shelf_items` tables** | Completeness | Free text and deferral. All are purely additive later |
| **Cached aggregate columns** | Fast counts | Live aggregates. Sub-millisecond at ~10k logs with the right indexes |
| **Soft deletes** | Auditability | Hard deletes plus `pg_dump`. Soft deletes put `WHERE deleted_at IS NULL` on every query forever |
| **A 15-event analytics taxonomy** | Product insight | One `search_misses` table. Most proposed events are already columns: `signed_up` is `users.created_at`, `book_logged` is `reading_logs.created_at` |
| **`ui-avatars.com`** | Placeholder covers | Inline SVG data URI. Ten lines, no third party, works offline and inside WhatsApp's WebView |
| **Google OAuth + a WebView interstitial + `intent://` links** | Sign-in | Email OTP. Three pieces of fragile machinery replaced by one that simply works everywhere |
| **A keep-alive cron + monitoring for that cron** | Keeping the DB awake | Choosing Neon. One decision deleted four moving parts |

---

## 2. What the discovery phase got wrong

Every reversal below came from a measurement or a verified vendor fact, not from taste. Recorded because the discovery documents remain in the repository and will be read.

| Discovery said | Reality | Source |
|---|---|---|
| Supabase free "pauses after 7 days; cold start 10–30 s" | It pauses and requires a **manual dashboard restore** taking minutes. A friend group's usage is intermittent by definition | Vendor docs |
| Google OAuth as primary sign-in | Google returns `403 disallowed_useragent` for OAuth in embedded WebViews. WhatsApp Android is one. Brazil is overwhelmingly Android | Google policy, in force since 2017 |
| Open Library is a viable catalog; manual add is a fallback | **40%** of Brazilian editions present; search averages **8.4 s** (range 2.5–21 s, with hard timeouts). Harry Potter/Rocco: 5 of 7 missing | Measured against the real corpus |
| RLS enforces visibility | Correct for a browser→PostgREST design. This is not that design | Architecture change |
| Statistics / year-in-review is P0 — "the growth loop" | At launch only the *owner* can generate one. Everyone else has 0–3 books. It becomes powerful in December | Reasoning from cohort state |
| Sanitise review HTML into `review_html` + `review_text` | The corpus contains one tag type (`<br>` ×178). Plain text is strictly safer and simpler | Measured tag census |

Three data facts that would have broken a naive implementation and were found only by inspecting the file: `year` reaches **−500** (signed integer required), `series_number` contains `'1-2'` and `'0.1'` (text, not numeric), and 22 of 86 ISBNs are ISBN-10 (normalisation required before any uniqueness constraint).

---

## 3. Complexity we kept, and why

Not everything simple is right. Four places where we deliberately paid a cost.

### Work / Edition as separate tables

The scope analysis argued for collapsing them into one `books` table, and at 30 users that is defensible. **Kept separate anyway**, for two reasons:

1. **It is the product's stated premise.** "pt-BR first, with real Brazilian editions" *is* the Work/Edition distinction. Collapsing it means two friends reading different translations of *Crime e Castigo* produce two unrelated rows, and the one aggregation the product cares about — "quem mais leu isso" — silently fails.
2. **The cost is nearly zero.** `reading_logs.edition_id` is nullable and usually null. The normal flow never touches an edition. We pay one extra table and one nullable FK; the alternative is a data migration under load later.

This is the one place where "expensive to change later" beat "simplest today".

### Drizzle rather than raw SQL

Raw `postgres.js` would work. Drizzle earns its place on migration tooling — versioned, committed, reviewable SQL generated from a typed schema — which hand-rolled SQL files do not give. Escape hatch to raw SQL remains one tagged template away.

### better-auth rather than hand-rolled sessions

Never hand-roll auth. The alternative — a cookie, a sessions table, OTP generation, expiry, rate limiting, revocation — is a week of work and the highest-consequence code in the app.

### `search_misses`

The only instrumentation kept, and it is real complexity (a table, a write path). Justified because it is the single signal that tests the biggest assumption in the architecture: that a community-built catalog plus manual entry is good enough. Everything else is derivable from existing columns.

---

## 4. Scale assumptions

Designed for:

| | |
|---|---|
| Users | 30 at launch, hundreds at most |
| Works | ~1,500 at launch, low thousands |
| Reading logs | ~3,000 at launch, tens of thousands |
| Page views | ~2,000/month |
| Concurrency | Single digits |

**Not** designed for: millions of anything, thousands of requests per second, multi-region, or a public launch.

---

## 5. What would trigger an upgrade

Each is a monitored number with a known, pre-decided response. None is built today.

| Trigger | Response | Rewrite? |
|---|---|---|
| Search > 100 ms, or > 50k works | `tsvector` + GIN, `portuguese` config | No — one migration |
| p95 TTFB > 800 ms | ISR on the four public routes | No — route-rule config |
| > 200k invocations/month | Vercel Pro, or add caching | No |
| Neon storage > 0.4 GB | Neon Launch (~US$5/mo) | No |
| **Any monetisation** | Vercel Pro — **mandatory, not optional** | No |
| > 200 users | Add `follows` + a feed filter | No — purely additive |
| Logs > ~100k | Cursor pagination everywhere, cached aggregates | No |
| > ~50 duplicate works | A merge UI and `merged_into_id` | No |
| Public registration | **Moderation tooling first. Hard gate** | No |
| > 100 sign-ins/day | Resend paid, or add OAuth as a second option | No |
| Hand-reading logs stops working | Sentry | No |

**Nothing on this list requires rewriting the application.** That is the actual test of whether an architecture is appropriately simple: not that it scales, but that each ceiling has a local fix.

---

## 6. What could be replaced without a rewrite

| Component | Replaceable? | Blast radius |
|---|---|---|
| Neon → any managed Postgres | Yes | A connection string |
| Vercel → Netlify / Cloudflare / a VPS | Yes | Nitro preset change + env vars |
| Resend → any SMTP | Yes | One better-auth adapter function |
| Open Library → Google Books | Yes | One service file. It is already isolated behind `/api/search/externo` and is non-blocking by design |
| Drizzle → Kysely / raw SQL | Mostly | Queries rewrite; the schema and migrations survive |
| better-auth → anything else | Painful | Owns its own tables. Accepted — this is why it was not hand-rolled |
| Nuxt → another framework | No | It is the application |

The two irreplaceable choices are Nuxt and the schema. Both were made deliberately and are documented at length.

---

## 7. Honest weaknesses

| Weakness | Why accepted |
|---|---|
| **No automated backups** on the free tier | Mitigated by a 3-day `pg_dump` to GitHub artifacts plus a monthly manual copy — but it *is* the least comfortable part of the zero-cost constraint. Neon Launch at ~US$5/mo is the most defensible first dollar this project would spend |
| GitHub disables cron after 60 days without commits on public repos | Backups stop *silently*. The monthly manual copy exists specifically as the check |
| No admin UI | Repair is `psql`. Acceptable for one owner and 30 friends who know each other |
| No merge tooling for duplicate works | Hand-written SQL below ~50 duplicates |
| A direct `psql` session bypasses every authorization control | Only the owner and the deploy environment hold the connection string |
| Catalog vandalism is possible — any member can create works | Rate limited, `created_by` recorded, no delete endpoint. Invite-only cohort |
| Open Library enrichment will often return nothing | By design. 60% miss rate is the *expected* case, which is why manual add is a primary path and not an error state |
| The `index.html` port is real work, not a copy-paste | Budgeted honestly in [tasks/005](tasks/005-port-design-tokens-and-components.md) rather than hidden inside "framework migration" |

---

## 8. Final assessment

Three managed services, ten tables, six route shapes, one deployment unit, one language, zero dollars.

The architecture is not sophisticated, and that is the point. The binding uncertainty on this project is whether ~30 friends will log books — not whether the system can serve them. Every hour spent on infrastructure that 30 users cannot exercise is an hour not spent finding that out.

**The single most valuable action available is not in this document. It is Q1 in [open-questions.md](open-questions.md): ask the group whether they want this, before writing any code.**
