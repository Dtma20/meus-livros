# Feature Backlog

Companion to [`product-discovery.md`](product-discovery.md). Items are written to be convertible into implementation tasks with minimal rework: each has an ID, a user problem, acceptance criteria, and explicit dependencies.

**Nothing here is implemented.** This is a planning artifact.

> **Revision 2 (2026-09-18) — revised against confirmed constraints.**
> Multi-user · pt-BR-first · audience is the owner's ~30-person university friend group reached via WhatsApp · zero infrastructure cost (free tiers only) · two-level privacy, `público` / `privado`.
> Full reasoning in [`product-discovery.md` §0](product-discovery.md#0-confirmed-decisions-and-constraints).
>
> **What changed:**
> - **New P0:** `AUTH-2` invite codes · `PRIV-1` público/privado · `BE-6` manual add-book fallback · `INFRA-1` free-tier setup.
> - **Promoted to P0:** `STAT-1` statistics — at this cohort size the shareable year-in-review *is* the growth loop and the return trigger, and it needs no backend.
> - **Demoted:** `SOC-2`/`SOC-3` follows and follow-filtered feeds (P1 → P2) — replaced by `SOC-7`, a global chronological feed, because a follow graph is pure friction below ~200 users. `MOD-1` moderation (P2 → P3) — invite-only cohort who know each other offline. SEO and sitemaps split out of `CORE-2` and dropped to P2; **Open Graph stays P0** because WhatsApp link previews are the actual distribution channel.
> - **Risk retired:** the Open Library pt-BR catalog gap is no longer existential. ~1,500 works across the cohort plus `BE-6` makes it a friction issue, not a failure mode.

**Priorities**
- `P0` — fundamental / blocking. The core loop does not function without it.
- `P1` — high value. Significantly improves retention, discovery, or social interaction.
- `P2` — valuable, can wait.
- `P3` — exploratory. Validate something else first.

**Effort** — `S` ≤ 2 days · `M` ≤ 1 week · `L` 2–4 weeks · `XL` > 1 month

**Milestones**
- `M0` — "From private page to public profile" (no backend)
- `M1` — "One reader becomes many" (persistence + accounts)
- `M2` — "A community forms" (social graph)
- `M3` — "Discovery and identity"
- `—` — unscheduled

---

## Summary

| ID | P | M | Feature | Effort | Depends on |
|---|---|---|---|---|---|
| [TEST-0](#test-0) | P0 | M0 | Ask the group if they want this | XS | — |
| [FIX-1](#fix-1) | P0 | M0 | Fix Open Library cover fallback | S | — |
| [FIX-2](#fix-2) | P0 | M0 | Empty state for zero results | S | — |
| [FIX-3](#fix-3) | P0 | M0 | Country filter initial value bug | S | — |
| [FIX-4](#fix-4) | P1 | M0 | Accessibility pass | S | — |
| [FIX-5](#fix-5) | P1 | M0 | Localise country names in the UI | S | — |
| [DATA-1](#data-1) | P1 | M0 | Normalise genre taxonomy | S | — |
| [DATA-2](#data-2) | P1 | M0 | Retire the CSV; single source of truth | S | — |
| [DATA-3](#data-3) | P1 | M0 | Stable book IDs | S | DATA-2 |
| [CORE-1](#core-1) | P0 | M0 | Routing and per-object URLs | M | — |
| [CORE-2](#core-2) | P0 | M0 | SSG + Open Graph (WhatsApp previews) | M | CORE-1 |
| [CORE-3](#core-3) | P0 | M0 | Local search | S | — |
| [CORE-4](#core-4) | P1 | M0 | Render hidden metadata | S | CORE-1 |
| [CORE-5](#core-5) | P2 | M3 | SEO: sitemap, canonicals, indexing | S | CORE-2 |
| [STAT-1](#stat-1) | **P0** | M0 | Statistics / year-in-review page | M | CORE-1 |
| [STAT-2](#stat-2) | P2 | M0 | Reading timeline | S | STAT-1 |
| [NAV-1](#nav-1) | P1 | M0 | Author, genre and country pages | M | CORE-1 |
| [NAV-2](#nav-2) | P2 | M0 | Series navigation | S | CORE-1, DATA-3 |
| [INFRA-1](#infra-1) | **P0** | M1 | Free-tier infrastructure setup | S | — |
| [INFRA-2](#infra-2) | P1 | M1 | Automated backups | S | INFRA-1 |
| [BE-1](#be-1) | P0 | M1 | Data model and schema | M | — |
| [BE-2](#be-2) | P0 | M1 | Persistence + Google OAuth | L | BE-1, INFRA-1 |
| [AUTH-2](#auth-2) | **P0** | M1 | Invite codes (closed registration) | S | BE-2 |
| [PRIV-1](#priv-1) | **P0** | M1 | Público / privado visibility | M | BE-1, BE-2 |
| [BE-3](#be-3) | P0 | M1 | Catalog integration and book search | L | BE-2 |
| [BE-6](#be-6) | **P0** | M1 | Manual add-book fallback | S | BE-3 |
| [BE-4](#be-4) | P0 | M1 | HTML sanitisation | S | BE-2 |
| [BE-5](#be-5) | P0 | M1 | Migrate existing 86 books | S | BE-2, BE-1 |
| [LOG-1](#log-1) | P0 | M1 | Log a book (date, rating, review) | M | BE-2, BE-3 |
| [LOG-2](#log-2) | P1 | M1 | Want-to-read shelf | M | BE-2 |
| [LOG-3](#log-3) | P2 | M2 | Currently-reading shelf | S | LOG-2 |
| [LOG-4](#log-4) | P2 | M2 | Re-reads | S | LOG-1 |
| [SOC-1](#soc-1) | P1 | M1 | Profile page | M | BE-2, CORE-1 |
| [SOC-7](#soc-7) | **P1** | M2 | Global activity feed | S | SOC-1 |
| [SOC-4](#soc-4) | P1 | M2 | Review likes | S | SOC-1 |
| [SOC-2](#soc-2) | P2 | M3 | Asymmetric follow | S | SOC-1 |
| [SOC-3](#soc-3) | P2 | M3 | Follow-filtered feed | M | SOC-2, SOC-7 |
| [SOC-5](#soc-5) | P2 | M3 | Notifications page | M | SOC-4 |
| [SOC-6](#soc-6) | P3 | M3 | Review comments | M | MOD-1 |
| [LIST-1](#list-1) | P1 | M2 | Lists | M | BE-2, PRIV-1 |
| [LIST-2](#list-2) | P3 | M3 | List following | S | LIST-1, SOC-2 |
| [DISC-1](#disc-1) | P3 | M3 | Popular among people you follow | M | SOC-2 |
| [DISC-2](#disc-2) | P3 | M3 | Similar books (heuristic) | M | BE-3 |
| [DISC-3](#disc-3) | P3 | M3 | Reading-the-world challenge | M | STAT-1 |
| [GROW-1](#grow-1) | P1 | M2 | Goodreads / Skoob import | M | BE-2, BE-3 |
| [GROW-2](#grow-2) | P2 | M3 | Data export | S | BE-2 |
| [GROW-3](#grow-3) | P3 | M3 | PWA / offline | M | — |
| [MOD-1](#mod-1) | P3 | M3 | Report, block + admin tooling | M | SOC-2 |
| [MOD-2](#mod-2) | P2 | M2 | Spoiler marking | S | LOG-1 |
| [MOD-3](#mod-3) | P2 | M2 | Review guidelines | S | — |
| [ANL-1](#anl-1) | P0 | M1 | Analytics as a Postgres table | S | BE-2 |
| [DEFER-1](#defer-1) | — | — | ML recommendations | XL | scale |
| [DEFER-2](#defer-2) | — | — | Native mobile apps | XL | — |
| [DEFER-3](#defer-3) | — | — | Reading progress tracking | M | — |

---

## Milestone 0 — From private page to public profile

No backend, zero cost. Everything here survives the M1 migration unchanged.

### TEST-0
**Ask the group if they want this** · `P0` · `XS` · deps: none

**Problem.** The largest risk in the whole plan is not technical. It is that the friend group does not actually want a reading app, and the owner spends six weeks on a backend for an audience of one.

**Acceptance criteria**
- Ask the WhatsApp group directly.
- Record two numbers: how many say they would use it, and how many can name the last book they finished.
- If fewer than ~8 say yes: build M0 anyway (it is cheap and good as a personal site) and **do not build M1**.

**Why it is P0.** Costs an afternoon, and it is the highest-information action available. Everything after `CORE-1` is predicated on the answer.

---

### FIX-1
**Fix Open Library cover fallback** · `P0` · `S` · deps: none

**Problem.** Open Library returns `HTTP 200` with a 43-byte blank GIF for an unknown ISBN rather than a 404. The `@error` handler therefore never fires and the `ui-avatars` placeholder in `getCover` is unreachable dead code. A missing cover renders as an invisible image. All 39 current ISBNs happen to resolve, so this is latent — it breaks on the first book added with an unlisted ISBN.

**Acceptance criteria**
- Cover URLs append `?default=false`.
- A book with a deliberately invalid ISBN renders the generated placeholder, not a blank space.

**Evidence.** `index.html:375-383`, `index.html:147`. Tested: `9780000000000` bare → `200`/43 bytes; with `?default=false` → `404`.

---

### FIX-2
**Empty state for zero results** · `P0` · `S` · deps: none

**Problem.** Any filter combination returning zero books renders a blank void plus a footer reading "0 Páginas Lidas". No message, no recovery path.

**Acceptance criteria**
- Zero results shows an explanatory message naming the active filters.
- A "Limpar filtros" action is offered inline.
- The page-count footer is suppressed or reads sensibly when the set is empty.

**Evidence.** `index.html:144-153`. Reproduced with `filterGenre='Teatro'` + `filterDecade='1600'`.

---

### FIX-3
**Country filter initial value** · `P0` · `S` · deps: none

**Problem.** `filterCountry` is initialised to `null` while the reset option carries `value=""`. No option matches, so the select renders blank on first load. It self-heals after one reset.

**Acceptance criteria**
- The country select reads "Todos os Países" on first paint.

**Evidence.** `index.html:180` vs `index.html:111`.

---

### FIX-4
**Accessibility pass** · `P1` · `S` · deps: none

**Problem.** Book cards are `<div @click>` — not focusable, not keyboard-activatable, no role. Cover images have no `alt`. Modals cannot be closed with Escape, have no focus trap, and their close control is a `<span>`. The grid is unusable with a screen reader.

**Acceptance criteria**
- Cards are reachable and activatable by keyboard.
- Every cover image has a meaningful `alt` (title + author).
- Escape closes both modals; focus is trapped while open and restored on close.
- Close controls are `<button>` elements with accessible labels.

**Evidence.** `index.html:145-148`, `index.html:24`, `index.html:44`. Escape verified non-functional.

---

### FIX-5
**Localise country names in the UI** · `P1` · `S` · deps: none

**Problem.** `mapCountryName` mutates each record at load time so the GeoChart receives English names. The pt-BR book modal consequently displays "United Kingdom" and "United States".

**Acceptance criteria**
- The UI displays Portuguese country names throughout.
- The English name is derived only where the chart needs it, not stored on the record.

**Evidence.** `index.html:56`, `index.html:199-219`. Observed in the modal for *O retorno do rei*.

---

### DATA-1
**Normalise genre taxonomy** · `P1` · `S` · deps: none

**Problem.** `generos.txt` defines ~15 canonical genres; the data uses 26 labels with different spellings (`Sci-fi` vs "Ficção Científica", `Terror` vs "Terror/Horror", `Não-Ficção` vs "Não Ficção"). Twelve labels in the data appear nowhere in the taxonomy. Filters fragment across near-duplicates.

**Acceptance criteria**
- One canonical genre list, machine-readable (not prose).
- Every book's genres drawn from that list.
- The taxonomy file and the data agree; a check can assert this.

**Evidence.** `generos.txt` vs the 26-label census of `livros.json`.

---

### DATA-2
**Retire the CSV; single source of truth** · `P1` · `S` · deps: none

**Problem.** `livros.json` (86) and `livros_lidos_atualizado.csv` (83) have diverged. Missing from the CSV: *O retorno do rei*, *Fragmentos do horror*, *A morte e a morte de Quincas Berro D'Água*. Manual mirroring is already being skipped.

**Acceptance criteria**
- `livros.json` is the single source of truth.
- The CSV is either generated from it or removed from the repository.
- No manual dual-entry step remains.

---

### DATA-3
**Stable book IDs** · `P1` · `S` · deps: DATA-2

**Problem.** `:key="book.title"` collides on re-reads, duplicate titles across authors, and multiple editions — all of which a real product must support.

**Acceptance criteria**
- Every record carries a stable `id` that never changes.
- Keys and route slugs derive from `id`, not `title`.

**Evidence.** `index.html:145`. No duplicates today; structurally fragile.

---

### CORE-1
**Routing and per-object URLs** · `P0` · `M` · deps: none

**Problem.** The site has one URL. No book, review, author, genre or year is addressable. Nothing can be linked, shared, bookmarked, or indexed. For a social product this closes the primary acquisition channel.

**Acceptance criteria**
- Routes exist for `/livro/{slug}`, `/autor/{slug}`, `/genero/{slug}`, `/pais/{slug}`, `/ano/{ano}`.
- Book detail is a page, not only a modal (the modal may remain as a grid-level quick view).
- Browser back/forward behave correctly.
- Existing filter state is representable in the URL.

**Note.** The current CDN-Vue setup cannot server-render. This item likely carries the framework decision — Nuxt is the lowest-friction path from Vue 3 and preserves the existing logic almost verbatim.

---

### CORE-2
**SSG + Open Graph (WhatsApp previews)** · `P0` · `M` · deps: CORE-1

**Problem.** 56 substantial reviews (median 940 characters) exist and cannot leave the page. No meta description, no OG tags, static `<title>`, client-only rendering. Supply is solved; distribution is at zero.

**Acceptance criteria**
- Each book page is statically generated with a unique title and description.
- **OG tags produce a correct preview when the link is pasted into WhatsApp** — cover image, title, and the first line of the review. Verify by actually pasting into a real WhatsApp chat, not by trusting a validator.
- Pages render without JavaScript.

**Why it is P0.** For a friend group distributing over WhatsApp, the link preview *is* the product's front door. A bare URL gets ignored; a cover image with a review snippet gets tapped. This is the cheapest possible test of the entire thesis.

**Scope note (Revision 2).** Sitemaps, canonical URLs and indexing strategy split out into `CORE-5` at P2 — Google is not the acquisition channel for this cohort.

---

### CORE-5
**SEO: sitemap, canonicals, indexing** · `P2` · `S` · deps: CORE-2 · milestone `M3`

**Problem.** Public review pages are long-tail search assets — but only once there is an audience beyond the friend group.

**Acceptance criteria**
- Sitemap covering **only `público` content** (see PRIV-1).
- Canonical URLs; `noindex` on anything `privado`.
- Structured data for books.

**Why it waits.** Deliberately deferred. Real value if the product outgrows the original cohort; zero value before that.

---

### CORE-3
**Local search** · `P0` · `S` · deps: none

**Problem.** No search exists in any form, not even over the 86 local books.

**Acceptance criteria**
- Search over title, author and series.
- Accent-insensitive (`ficcao` matches `Ficção`).
- Results update as you type; zero-result state handled (see FIX-2).

---

### CORE-4
**Render hidden metadata** · `P1` · `S` · deps: CORE-1

**Problem.** `read_in`, `publisher`, `original_language`, `series_name`/`series_number` and `source` are captured for every applicable book and displayed for none. `read_in` is the most interesting field in the dataset and is used only as a sort key.

**Acceptance criteria**
- The book page shows reading year, publisher, original language, series position and format.
- Series and original language are links (see NAV-1, NAV-2).

---

### STAT-1
**Statistics / year-in-review page** · **`P0`** · `M` · deps: CORE-1

> **Promoted from P1 in Revision 2.** For a ~30-person group distributing over WhatsApp, "meu ano em livros" pasted into the group chat is simultaneously the growth loop, the return trigger and the demo that makes a friend sign up. It needs no backend and costs nothing. Make sure it has a great OG preview (`CORE-2`).

**Problem.** 13 years of reading data, 85 ratings, 26 genres, 59 authors and 14 countries — and nothing consumes any of it. The taste loop has rich signal and no surface.

**Acceptance criteria**
- Books and pages per year; top genres, authors, countries, languages; rating distribution; format split.
- A per-year view (`/ano/2025`) suitable for sharing.
- Correct OG preview (depends on CORE-2).

**Why it matters.** Highest value-per-effort item in the repository — fully computable from `livros.json` with no backend, and directly shareable.

---

### STAT-2
**Reading timeline** · `P2` · `S` · deps: STAT-1

**Problem.** The 2014→2026 reading history is a genuinely compelling artifact and is invisible.

**Acceptance criteria**
- A visual timeline of books read per year, with the acceleration visible.

---

### NAV-1
**Author, genre and country pages** · `P1` · `M` · deps: CORE-1

**Problem.** 59 authors, 26 genres and 14 countries are all dead ends. There is no "more like this" path anywhere in the product.

**Acceptance criteria**
- `/autor/{slug}` lists that author's books with aggregate stats.
- `/genero/{slug}` and `/pais/{slug}` likewise.
- Author, genre and country are links everywhere they appear.
- All three are statically generated and indexable.

---

### NAV-2
**Series navigation** · `P2` · `S` · deps: CORE-1, DATA-3

**Problem.** 23 books carry `series_name` and `series_number`; neither is rendered or navigable.

**Acceptance criteria**
- Series membership is shown on the book page with position.
- A series view lists its books in order.

---

## Milestone 1 — One reader becomes many

Everything here requires a server. Do not start before M0 ships, and do not start at all if `TEST-0` came back negative.

### INFRA-1
**Free-tier infrastructure setup** · `P0` · `S` · deps: none

**Problem.** The zero-cost constraint rules out several otherwise-reasonable designs. Getting the stack right up front is cheaper than discovering the limits in production.

**Acceptance criteria**
- **Supabase free tier** provisioned: 500 MB Postgres, 1 GB storage, 5 GB egress, 50k MAU, max 2 active projects.
- **Cloudflare Pages** for hosting (unlimited bandwidth, no commercial-use restriction). Nuxt deploys via Nitro's official Cloudflare preset.
- **Covers hotlinked from Open Library. Never proxied, never self-hosted** — this single rule is what keeps egress inside the free tier.
- Avatars as generated initials (`ui-avatars`, already used at `index.html:370`). No uploads yet.
- A **GitHub Actions weekly cron** pinging Supabase so the project never hits the 7-day inactivity pause (cold start after a pause is 10–30 s).

**Capacity check.** 30 users × ~100 books plus a shared catalog of a few thousand works lands under ~50 MB against a 500 MB limit. Over-provisioned by roughly 10×.

---

### INFRA-2
**Automated backups** · `P1` · `S` · deps: INFRA-1

**Problem.** The Supabase free tier includes **no backups**. This is the one genuinely uncomfortable part of the zero-cost constraint — the owner is about to put 13 years of irreplaceable reading history and 56 original reviews into a database with no recovery path.

**Acceptance criteria**
- A scheduled `pg_dump` to a **private** repository or equivalent free store.
- Runs at least weekly; retains several generations.
- A restore has actually been tested once, not just assumed to work.

**Why it is not P2.** Free, quick, and the alternative is losing the only asset the project has.

---

### BE-1
**Data model and schema** · `P0` · `M` · deps: none

**Problem.** The schema is the most expensive thing to get wrong, and two decisions dominate everything downstream.

**Required decisions**
1. **Work vs. edition.** A Brazilian translation is a distinct edition of the same work. Ratings and reviews attach to the **work**; publisher, page count, format, ISBN and cover attach to the **edition**. Hardcover's most-cited failures are missing-edition failures — for a pt-BR-first product this is load-bearing.
2. **`log_entries` is the atomic unit**, not a `rating` column on a join table. Multiple dated entries per user per work gives diary entries, re-reads and evolving opinion for free, and directly addresses the widely-criticised one-review-per-book model.

**Acceptance criteria**
- Tables for `users`, `invites`, `authors`, `works`, `editions`, `log_entries`, `shelf_items`, `lists`, `list_items`, `likes`, `events`.
- `log_entries` supports multiple dated entries per user per work.
- `review_html` (sanitised) and `review_text` (plain, for search and OG) stored separately.
- **A `visibility` column on every user-owned object**, defaulting to `publico` (see PRIV-1). Including it now costs nothing; retrofitting it later is a miserable migration.
- `follows` is **not** created yet — deferred to `SOC-2` in M3.
- A documented migration mapping for every field in `livros.json`, including the fact that `read_in` is year-precision only and needs a precision flag.

---

### BE-2
**Persistence + Google OAuth** · `P0` · `L` · deps: BE-1, INFRA-1

**Problem.** There is no write path of any kind. Every social feature is blocked here.

**Acceptance criteria**
- Supabase Postgres provisioned with the BE-1 schema.
- **Google OAuth as the primary (initially only) sign-in.** Sign-in, sign-out, session handling.
- Authorisation enforced via **Postgres row-level security**, not application code — Supabase is built around RLS and this is exactly its use case.
- Write rate limiting.

**Hard constraint — do not design around email.** Supabase's built-in sender is capped at **2 messages per hour project-wide** and refuses to deliver to addresses outside the project team. Thirty friends signing up on the same evening would exhaust that in four minutes, so magic-link and email-confirmation flows are unusable on the free tier. Google OAuth sends no email, costs nothing, and every university friend has a Google account. If email sign-in is genuinely wanted later, wire Resend's free tier (3k/month) as custom SMTP — that raises the cap to 30/hour.

---

### AUTH-2
**Invite codes (closed registration)** · `P0` · `S` · deps: BE-2

**Problem.** Public sign-up brings spam, impersonation and abuse — and therefore a moderation obligation the owner has no appetite for. A closed cohort who know each other offline has none of those problems.

**Acceptance criteria**
- Registration requires a valid invite code.
- Codes are creatable by the owner; claimed codes record who claimed them.
- A clear "peça um convite" state for anyone who lands without one.

**Why it is P0.** This is what justifies deferring `MOD-1` to M3. Without closed registration, moderation tooling becomes a launch blocker.

**Open decision.** One shared code in the WhatsApp group is simplest and probably enough. Per-person codes give an attribution signal (who actually brings people in) for nearly the same effort. Low stakes — but decide before building.

---

### PRIV-1
**Público / privado visibility** · `P0` · `M` · deps: BE-1, BE-2

**Problem.** Owner requirement: every user must be able to keep content off the open web.

**Confirmed model: two levels only** — `público` (visible on the open web) and `privado` (visible only to the author). There is deliberately no "friends can see it, Google can't" middle tier.

**Acceptance criteria**
- Profile-level default, user-changeable.
- **The default is `público`.** With only two levels, `privado` must be an escape hatch for a specific embarrassing book or half-written review — if new accounts default to private, the social product has nothing to show and the loop never starts.
- Per-object override on log entries, reviews and lists.
- A `privado` profile is excluded from the global feed entirely.
- Enforced by row-level security, not by hiding things in the UI.
- Clean pipeline split: **`público` is statically generatable and cacheable; `privado` is never pre-rendered, never cached publicly, never in a sitemap.**

**Trade-off, acknowledged.** Two levels means private content is invisible to friends as well as to Google. The owner chose this with the trade-off stated. The `público` default is what keeps it workable.

---

### BE-3
**Catalog integration and book search** · `P0` · `L` · deps: BE-2

**Problem.** The library is capped at 86 hand-entered books. A new user's first action — finding the book they just finished — fails immediately.

**Acceptance criteria**
- Open Library as primary source; Google Books as fallback.
- Search by title, author and ISBN.
- Results mirrored into local `works`/`editions` on first reference; **no third-party call in a user-facing search path**.
- Postgres full-text search with the `portuguese` dictionary plus `pg_trgm` fuzzy matching; accent-insensitive.
- Cover URLs use `?default=false` (see FIX-1).
- Zero-result rate instrumented (see ANL-1) — this is the earliest warning of the known failure mode.

**Risk status (Revision 2).** Open Library's coverage of Brazilian edition *metadata* remains unverified (only covers were tested: 39/39 resolved). But this is **no longer existential**: ~30 readers produce roughly 1,500 distinct works, not millions, and `BE-6` gives a manual escape hatch. Measure it opportunistically rather than treating it as a launch gate.

---

### BE-6
**Manual add-book fallback** · `P0` · `S` · deps: BE-3

**Problem.** Open Library will not have every Brazilian edition. Without a fallback, a user who cannot find their book simply cannot log it — and that failure lands on exactly the action the whole product depends on.

**Acceptance criteria**
- "Não achou? Adicione à mão" from any zero-result search.
- Minimal form: title, author, year, pages, publisher, cover URL (optional).
- Manually added works are flagged (`source = 'manual'`) so they can be reconciled with Open Library later.
- Manual entries are shared across the cohort, not private to the creator — one person fixing a missing book fixes it for everyone.

**Why it is P0.** This is what converts the largest technical risk in the report into ordinary friction. At this cohort's volume, a handful of hand-entered books per year is nothing.

---

### BE-4
**HTML sanitisation** · `P0` · `S` · deps: BE-2

**Problem.** Reviews render through `v-html`. Safe today only because there is exactly one trusted author. The moment a second person can write a review this is stored XSS.

**Acceptance criteria**
- All user-submitted HTML sanitised server-side against an allowlist before storage.
- Rendering is never the trust boundary — `review_html` is stored pre-sanitised.

**This is a hard gate.** It must land with the first external write, not after.

---

### BE-5
**Migrate the existing 86 books** · `P0` · `S` · deps: BE-1, BE-2

**Problem.** 13 years of real data is the best available test of the schema, and the best available seed content for a new platform.

**Acceptance criteria**
- All 86 books imported as the first user's history with ratings, reviews and reading years preserved.
- Round-trip verified: every field accounted for or explicitly dropped with a reason.

---

### LOG-1
**Log a book** · `P0` · `M` · deps: BE-2, BE-3

**Problem.** The core creative act of the product does not exist. Recording a finished book currently means hand-editing a JSON file and committing to git — a hostile path for the one activity this product is best at.

**Acceptance criteria**
- Log a finished book with date, half-star rating and optional review.
- Review editor handles paragraphs properly (the existing corpus is `<br>`-separated prose escaped into JSON strings — that must not be the new authoring experience).
- Entries are editable and deletable.
- Half-stars retained (Goodreads still lacks them; this is a live differentiator).
- Each entry gets a permalink.

---

### LOG-2
**Want-to-read shelf** · `P1` · `M` · deps: BE-2

**Problem.** There is no place to put a book you have not started. This is the returning-user hook — the reason to open the product when you are not logging something — and its absence is the clearest explanation for why the current product has no reason to be revisited.

**Acceptance criteria**
- Add and remove books from want-to-read from any surface.
- A dedicated shelf view, sortable.
- Logging a book offers to remove it from want-to-read.

---

### SOC-1
**Profile page** · `P1` · `M` · deps: BE-2, CORE-1

**Problem.** The site is one implicit, anonymous profile. For a diary-based product, the profile *is* the product.

**Acceptance criteria**
- `/@{handle}` with avatar, bio, stats, recent diary entries, lists.
- Favourite books, with a **deliberate cap** — Letterboxd's four-favourites constraint is a masterclass in cheap identity.
- Public and indexable, with a correct OG preview.
- **The profile, not a feed, is the default home.** Users report actively disliking feed-first homepages.

---

### ANL-1
**Analytics as a Postgres table** · `P0` · `S` · deps: BE-2

**Problem.** Zero instrumentation exists. Retrofitting loses the only cohort that matters — and with ~30 users, the first cohort is the *entire* dataset.

**Acceptance criteria**
- An `events(id, user_id, name, props jsonb, created_at)` table. **No third-party analytics tool** — at this volume it is a few thousand rows a year, it costs nothing, and SQL gives better answers than any dashboard.
- Events: `user_signed_up`, `invite_claimed`, `book_searched`, `book_added_manually`, `book_opened`, `book_logged`, `review_submitted`, `shelf_item_added`, `reading_started`, `reading_completed`, `review_liked`, `list_created`, `share_clicked`, `visibility_changed`, `import_completed`.
- Derived metrics available: time to first log, logs per active user per month, **review rate**, search zero-result rate, D30/D90 return, share-to-signup.
- **Do not track** DAU, scroll depth or session duration — wrong cadence for a reading product; optimising for them pushes the roadmap toward engagement patterns that do not fit the behaviour.

**The metric that actually decides this project:** *how many of the invited friends log three books in the first month.* Everything else is secondary. Target something like 5 of 30 — below that, the feed is empty and no feature fixes it.

**Two benchmarks to hold onto.**
- **Review rate.** The owner's baseline is **65%**. If the group average lands near 10%, the long-form differentiation has failed and this is a tracker, not a social reading product.
- **`visibility_changed` to `privado`.** If a large share of content gets marked private, the two-level model is fighting the social loop and a "só membros" tier deserves reconsideration (see PRIV-1).

---

## Milestone 2 — A community forms

**No moderation gate.** Registration is invite-only (`AUTH-2`) and the cohort knows each other offline, so `MOD-1` moves to M3.

### SOC-7
**Global activity feed** · `P1` · `S` · deps: SOC-1

**Problem.** No way to see what the group is reading.

**Replaces the follow-based feed for this cohort.** At ~30 users, everyone can plausibly read everything. A follow graph would add a setup step and a decision in order to filter a feed that does not need filtering — pure friction with no benefit. Follows start paying for themselves somewhere north of ~200 users; until then, one chronological list of everything `público` is strictly better and a fraction of the work.

**Acceptance criteria**
- One chronological feed: all `público` logs, reviews and lists from all members.
- Cursor pagination from day one (cheap now, a rewrite later).
- **A tab, not the homepage** — users report actively disliking feed-first homepages, and the profile is the better landing surface (`SOC-1`).
- `privado` content never appears, including for the author.

**Upgrade path.** When the cohort passes ~200, add `SOC-2` follows and make this feed filterable (`SOC-3`). The feed component itself does not change.

---

### SOC-4
**Review likes** · `P1` · `S` · deps: SOC-1

**Problem.** No way to signal appreciation. This is the cheapest social primitive and the entry point to the whole social loop — StoryGraph waited until February 2026 to ship it, which is a mistake worth not repeating.

**Acceptance criteria** — like/unlike a review; counts shown; likes queryable for "popular reviews".

---

### SOC-5
**Notifications page** · `P2` · `M` · deps: SOC-4 · milestone `M3`

**Acceptance criteria** — in-app notifications for likes and (later) comments; unread state. Email and push deferred — email is constrained by the free tier anyway (see `BE-2`).

---

### LIST-1
**Lists** · `P1` · `M` · deps: BE-2, PRIV-1

**Problem.** No way to express curated taste. Lists are the highest-leverage user-generated artifact per unit of effort — minutes to create, inherently shareable, and they generate both book discovery and user discovery.

**Acceptance criteria**
- Create, edit, delete; title, description, `público`/`privado` (see PRIV-1).
- Add/remove books; **bulk editing** (a repeatedly-reported gap in competitors).
- Optional ranking.
- `Público` lists get URLs and WhatsApp-quality OG previews.

---

### LIST-2
**List following** · `P3` · `S` · deps: LIST-1, SOC-2 · milestone `M3`

**Acceptance criteria** — follow a list; followed lists surface updates in the feed.

**Why it moved to P3.** Depends on `SOC-2`, which is itself deferred. At 30 users, every list is already visible in the global feed.

---

### LOG-3
**Currently-reading shelf** · `P2` · `S` · deps: LOG-2

**Acceptance criteria** — mark a book as in progress; shown on the profile and in the feed. **No page-level progress tracking** (see DEFER-3).

---

### LOG-4
**Re-reads** · `P2` · `S` · deps: LOG-1

**Problem.** Goodreads structurally cannot represent reading a book twice with different opinions — a model users call "obsolete".

**Acceptance criteria** — multiple dated entries per work; the book page shows all of a user's entries chronologically. Mostly free if BE-1 was done correctly.

---

### GROW-1
**Goodreads / Skoob import** · `P1` · `M` · deps: BE-2, BE-3

**Problem.** Every new user faces the same blank-slate problem this repository solved by hand over 13 years.

**Reframed in Revision 2.** Not acquisition — friends arrive via invite, not via import. This is **activation**: the fastest path from an empty profile to a profile worth looking at, and therefore from a signed-up friend to an engaged one. Schedule it early if the group turns out to already use Skoob or Goodreads; ask them (see `TEST-0`).

**Acceptance criteria**
- Goodreads CSV import: title, author, ISBN, rating, review, date read, shelves.
- Skoob export supported if a format is obtainable.
- Async processing with progress feedback.
- Match rate reported to the user; unmatched rows reviewable.
- `import_completed` instrumented with `match_rate`.

---

### MOD-1
**Report, block + admin tooling** · `P3` · `M` · deps: SOC-2 · milestone `M3`

**Problem.** Public user-generated content means spam, abuse and review bombing — the latter being one of Goodreads' most-documented failures.

**Why it moved from P2 to P3 (Revision 2).** Registration is invite-only (`AUTH-2`) and the cohort knows each other offline. Spam, impersonation and coordinated review bombing are not categories that exist in a 30-person friend group. Full tooling becomes necessary if and when registration opens.

**What is still needed now, and is free:** a delete button on your own content, an admin ability to remove any content (the owner, via the database console is acceptable at this scale), and `MOD-3` published guidelines.

**Acceptance criteria (when built)** — report content; block users; a minimal admin queue with content removal and account suspension.

**This gates opening public registration.** It does not gate M2.

---

### MOD-2
**Spoiler marking** · `P2` · `S` · deps: LOG-1

**Acceptance criteria** — mark a review as containing spoilers; hidden behind a click by default; the preference persists per reader.

---

### MOD-3
**Review guidelines** · `P2` · `S` · deps: none

**Problem.** Culture is set early and is the main structural defence against review bombing.

**Acceptance criteria** — a published, linked guidelines page covering spoilers, civility, and no rating books you have not read.

---

## Milestone 3 — Discovery and identity

**Everything here is gated on the cohort growing.** Most of these items are deferred not because they are low value in general, but because they are low value at ~30 users.

### SOC-2
**Asymmetric follow** · `P2` · `S` · deps: SOC-1

**Problem.** Once the group is large enough that nobody can read everything, the feed needs filtering.

**Build it when the cohort passes ~200 members.** Below that, `SOC-7`'s global feed is strictly better: a follow graph adds a setup step and a decision in order to filter something that does not need filtering.

**Acceptance criteria** — follow/unfollow; follower and following counts and lists; **no approval flow**. Copy Letterboxd's asymmetric model, not Goodreads' friend requests — no reciprocity makes the graph cheap to grow and turns "followed for good taste" into the status reward.

---

### SOC-3
**Follow-filtered feed** · `P2` · `M` · deps: SOC-2, SOC-7

**Acceptance criteria** — the `SOC-7` feed gains a "seguindo" filter; remains a tab, not the homepage; cursor pagination retained; fan-out on read with caching (fan-out on write is premature below ~10k users).

**Note.** This is a filter added to an existing component, not a new feed — which is why `SOC-7` was worth building first.

---

### DISC-1
**Popular among people you follow** · `P3` · `M` · deps: SOC-2

**Problem.** No personalised discovery. This is a SQL query, not a recommender, and it has the best discovery-per-effort ratio available *at scale*.

**Why P3 here.** Meaningless at 30 users — "popular among people you follow" and "popular, full stop" return the same rows. Revisit alongside `SOC-2`.

**Acceptance criteria** — a view of books most logged or highest rated among followed users in a recent window; instrumented via `book_opened` with `source`.

---

### DISC-2
**Similar books (heuristic)** · `P3` · `M` · deps: BE-3

**Acceptance criteria** — same author, same series, shared genres, shared original language. **No embeddings, no ML.**

---

### DISC-3
**Reading-the-world challenge** · `P3` · `M` · deps: STAT-1

**Problem.** The country map is already the most distinctive screen in the product, and no major competitor treats geographic or translation diversity as a social object. This productises the differentiator.

**Acceptance criteria** — countries and original languages read, per year and lifetime; a shareable map artifact; suggestions for unread regions.

**Sequencing note.** Genuinely distinctive, but validate the base loop first.

---

### SOC-6
**Review comments** · `P3` · `M` · deps: MOD-1

**Acceptance criteria** — threaded comments on reviews; moderation applies. Deliberately after likes and after moderation tooling.

---

### GROW-2
**Data export** · `P2` · `S` · deps: BE-2

**Problem.** Lock-in resentment is a live driver of migration away from Goodreads and Skoob. Cheap to build, strong trust signal.

**Acceptance criteria** — one-click export of everything (books, entries, reviews, lists) in CSV and JSON, no support ticket required.

---

### GROW-3
**PWA / offline** · `P3` · `M` · deps: none

**Acceptance criteria** — installable, offline-capable shelf viewing, mobile-first logging. Mobile is where reading logging actually happens.

---

## Deferred — explicitly not scheduled

### DEFER-1
**ML recommendations** · `XL`

Needs roughly 1,000 active raters × 20 ratings before a model beats heuristics. Below that, DISC-1 and DISC-2 win at a fraction of the cost. Goodreads has enormous data and is still widely criticised for generic recommendations — volume alone does not solve this. **Revisit above ~1,000 active raters.**

### DEFER-2
**Native mobile apps** · `XL`

A good responsive PWA (GROW-3) is sufficient for years. Two additional platforms is a permanent tax on every feature.

### DEFER-3
**Reading progress tracking (page/percentage)** · `M`

High friction, low leverage. StoryGraph users like it, but it generates no shareable content and does not feed any loop. `LOG-3` (currently-reading as a binary state) captures most of the value at a fraction of the cost.

### Also unscheduled

Collaborative lists (needs a network first) · book clubs · achievements and badges (gamification without a graph is a scoreboard nobody sees) · audiobook and format taxonomy beyond the existing Físico/Ebook split · following authors (authors are not on the platform) · new-release feeds (a feed of things nobody has read) · trading and lending (Skoob's broken feature — operationally miserable) · author accounts · streaks (punishes the natural rhythm of reading).

---

## Cross-cutting notes

**Do not break what works.** The grid, sorting, filtering, stats and cover chain are correct and well-implemented. The `original_index` stable-sort tiebreak in particular is easy to get wrong and was gotten right — preserve it through any refactor.

**Framework migration is carried by CORE-1/CORE-2, not undertaken for its own sake.** SSR is needed because OG previews and SEO are needed. Nuxt keeps the existing Vue 3 logic close to verbatim.

**Two hard gates.** `BE-4` (sanitisation) blocks any multi-user write — non-negotiable, no exceptions. `MOD-1` (moderation) blocks *opening public registration*, which this plan never does; `AUTH-2` invite codes are what make that deferral legitimate.

**Free-tier rules that are easy to violate by accident.** Never proxy or self-host book covers (blows the 5 GB egress budget). Never design a magic-link or email-confirmation flow (Supabase's built-in sender is 2/hour, team addresses only). Never assume an always-on worker exists. Set up `INFRA-2` backups before putting 13 years of reviews into a database with no recovery path.

**Design for the lurkers.** In a ~30-person group, expect roughly 5 heavy loggers, 10 occasional and 15 who mostly read. The product needs to be worth opening for someone who never logs anything — browsing friends' reviews and year-in-review pages has to stand on its own. If only the loggers get value, the loggers eventually stop too.

**The bet, restated.** Optimise for the log and the review, not for shelf management. Shelf management is where Goodreads and StoryGraph are strong and where a new product cannot win. The log is where Letterboxd won — and it is what this repository already has 13 years of.
