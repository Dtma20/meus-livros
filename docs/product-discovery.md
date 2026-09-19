# Product Discovery — "Letterboxd for Books"

**Repository:** `meus-livros`
**Date:** 2026-09-18
**Status:** Discovery and recommendations only. No product features implemented as part of this work.

> **Revision 2 (2026-09-18).** The product owner answered the open questions from §15. Their answers materially change the priorities in §11, §12 and §16. See §0 for the confirmed constraints and what they changed.

---

## 0. Confirmed decisions and constraints

The six open questions in §15 have been answered. These are now **constraints, not assumptions**, and the rest of this document has been revised against them.

| Question | Answer |
|---|---|
| Multi-user or better personal site? | **Multi-user.** |
| pt-BR-first or global? | **pt-BR-first.** |
| Who are the first ~100 users? | **Friends from the owner's university cohort (graduação).** |
| Willing to pay for hosting? | **No. Free for users *and* zero infrastructure cost** — free tiers only. |
| Privacy model? | **Two levels: público (open web) or privado (only me).** Per-object toggle. |
| Moderation cost acceptable? | *Not answered directly — resolved by the cohort answer; see below.* |

### 0.1 What a ~30-person trusted cohort changes

This is the single most consequential answer, and it moves priorities more than the rest combined.

| Consequence | Reasoning |
|---|---|
| **Follows are premature. Ship a global feed instead.** | At ~30 users everyone can plausibly read everything. A follow graph adds a setup step and a decision, and filters a feed that does not need filtering. Follows start earning their cost somewhere north of ~200 users. `SOC-2`/`SOC-3` drop from P1 to P2 and are replaced by a single chronological "o que a galera está lendo" view. |
| **SEO is not the acquisition channel — WhatsApp is.** | A Brazilian university friend group shares links in a group chat. Google is irrelevant at this scale. **Open Graph previews stay P0** (they are what makes a link look like something in WhatsApp); sitemaps, canonical URLs and indexing strategy drop to P2. |
| **Moderation is near-zero priority.** | Invite-only, everyone knows everyone offline. `MOD-1` drops from P2 to P3. What remains is a delete button and published guidelines — both free. |
| **Invite codes replace public sign-up.** | Closed registration removes spam, abuse and impersonation as categories, which is what actually justifies deferring moderation. New P0 item. |
| **The catalog risk mostly evaporates.** | 30 readers × ~50 books ≈ 1,500 distinct works, not millions. Combined with a manual "não achei, adicionar à mão" fallback, Open Library's pt-BR gaps stop being existential. This retires the largest technical risk in Revision 1. |
| **Statistics move from P1 to P0.** | At this scale the shareable artifact *is* the retention mechanism. "Meu ano em livros" posted to the group chat is simultaneously the growth loop, the return trigger, and the reason a friend installs it. It also needs no backend. |
| **Activation is the entire game.** | If 5 of 30 friends log books and 25 do not, the product is dead regardless of features. Every M1 decision should be judged against "does this get a friend from invite to third logged book?" |
| **Import is reframed.** | Not acquisition (friends arrive via invite) but **activation** — the fastest path from empty profile to profile worth looking at. Stays P1. |

### 0.2 Privacy: two levels

**Confirmed model:** `público` (visible on the open web) or `privado` (visible only to the author). No middle "members only" tier.

I flagged that two levels means private content is invisible to friends too — there is no "friends can see it, Google can't" state. The owner chose two levels with that trade-off understood.

**The design consequence that makes it work: the default must be público.** With a two-level model, `privado` has to be an escape hatch for a specific embarrassing book or half-finished review, not the resting state. If new users default to private, the social product has nothing to show and the loop never starts.

**Concrete model:**
- Profile-level default: público, user-changeable.
- Per-object override on log entries, reviews and lists.
- A private profile hides that user from the global feed entirely.
- Clean architectural split: **público = statically generatable and cacheable; privado = behind auth, never pre-rendered, never in a sitemap.**

### 0.3 Zero-cost infrastructure

Confirmed: free for users **and** zero hosting spend. Verified free-tier facts and the gotchas that actually bite:

| Component | Choice | Free-tier reality |
|---|---|---|
| Database + auth | **Supabase free** | 500 MB Postgres, 1 GB storage, 5 GB egress, 50k MAU, 500k edge-function invocations, max 2 active projects. ([Supabase](https://supabase.com/pricing), [ITPath](https://www.itpathsolutions.com/supabase-free-tier-limits)) |
| Hosting | **Cloudflare Pages** | Unlimited bandwidth, no commercial-use restriction. Nitro (Nuxt's server layer) ships an official Cloudflare preset, so Nuxt SSR deploys cleanly here — unlike the Next.js/OpenNext situation often cited in comparisons. ([Lucky Media](https://www.luckymedia.dev/insights/hosting), [CoderFile](https://coderfile.io/blog/vercel-vs-netlify-vs-cloudflare-2026)) |
| Covers | **Hotlink Open Library** | Zero storage, zero egress against the Supabase budget. **Do not proxy or self-host covers** — that is the one decision that would blow the 5 GB egress limit. |
| Avatars | **Generated initials** (`ui-avatars`, already used in `index.html:370`) | Zero cost. Real uploads can come later out of the 1 GB bucket. |
| Analytics | **An `events` table in Postgres** | At 30 users this is a few thousand rows a year. No third-party tool, no cost, full query access. |

**Three gotchas that will bite on launch day if not planned for:**

1. **Supabase's built-in email sender is capped at 2 messages per hour, project-wide, and refuses to deliver to addresses outside the project team.** Magic-link and email-confirmation sign-up are therefore unusable out of the box — 30 friends registering on the same evening would hit the cap in the first four minutes. ([Supabase Docs](https://supabase.com/docs/guides/auth/auth-smtp), [Supabase rate limits](https://supabase.com/docs/guides/auth/rate-limits))
   **→ Use Google OAuth as the primary sign-in.** It sends no email, costs nothing, and university friends all have a Google account. Wire Resend's free tier (3k/month) as custom SMTP only if email sign-in is genuinely wanted — that raises the cap to 30/hour.
2. **Free Supabase projects pause after 7 days of inactivity**, and the first request after a pause takes 10–30 seconds to cold-start. Active friends will not trigger it; a quiet development month will. **→ A free GitHub Actions cron pinging the project weekly is sufficient.**
3. **Two active projects maximum** on the free tier. That is production plus one staging environment — no more. Plan branching and testing around it.

**Capacity check:** 30 users × ~100 books, plus a shared catalog of a few thousand works and editions, lands comfortably under 50 MB against a 500 MB limit. The free tier is over-provisioned by roughly an order of magnitude for this cohort. Cost is genuinely not a constraint on what gets built — only on *how* (no self-hosted images, no always-on background workers).

### 0.4 What this does not change

The core loop (§12), the work/edition schema decision (§13.1), the `log_entries`-as-atomic-unit decision, the sanitisation gate, and all of Milestone 0 are unaffected. Milestone 0 in particular gets *more* attractive: it needs no backend, so it costs nothing, and its main output — shareable pages with correct link previews — is exactly the acquisition mechanism a WhatsApp-distributed friend group needs.

---

## 1. Executive summary

### What this repository actually is

`meus-livros` is a **single-user, read-only, static personal reading diary**. It is one 421-line `index.html` containing Vue 3 (CDN, no build step), one `styles.css`, and one `livros.json` holding 86 hand-curated book records. There is no backend, no database, no authentication, no API, no routing, no tests, no build pipeline, and no write path of any kind. Adding a book means editing JSON by hand and committing.

Measured against the stated goal — a social reading platform — roughly **10–15% of the surface exists, and it is the presentation layer only**. Every social mechanic (accounts, follows, feeds, lists, likes, comments, notifications) is at zero, and each of them is blocked on the same missing foundation: a persistence layer that accepts writes from more than one person.

### The non-obvious finding

The valuable asset in this repository is **not the code — it is the content**.

- 86 books spanning **13 years of reading history** (2014–2026), with a real acceleration curve (1 book in 2014 → 16 in 2022 → 12 in 2024 → 11 in 2025).
- **56 written reviews**, median length **940 characters**, longest 2,505. These are considered paragraphs in Portuguese, not one-line reactions. For comparison, the overwhelming majority of Goodreads ratings carry no review text at all.
- A **discriminating** rating distribution (0.5 to 5.0 with half-stars; 1,247 ratings would be noise, but here 13 books sit at 3.0, 31 at 4.0, only 11 at 5.0, and 7 below 2.0 — this reader actually uses the scale).
- Metadata most competitors do not carry: `country`, `original_language`, `publisher` (Brazilian imprints), `series_name`/`series_number`, and `source` (Físico/Ebook).

Most social-reading startups launch with an empty database and no content. This one starts with a genuine corpus and a clear editorial voice. **That should shape the strategy: build the product around the review and the log, not around shelf management.**

### The strategic opening

Research (Section 7) points to a specific, defensible position rather than a general "better Goodreads":

1. **Portuguese-first with real Brazilian edition data.** Skoob — the pt-BR incumbent with ~10M users — is technically stagnant, has been sold twice (Americanas → Skeelo), and has core features broken for months with no communication to users. Meanwhile Goodreads, StoryGraph and Hardcover all have documented weak non-English metadata; a common Hardcover complaint is searching for a translation and finding no result. This dataset already carries Brazilian publishers and `original_language`. **This is the largest single opening.**
2. **Reading-the-world as a social object.** The country map is already this app's most distinctive screen, and no major competitor treats translation/geographic diversity as a first-class, shareable identity stat. The data is already there.
3. **Long-form reviews over rating volume.** Goodreads' most-cited structural problems are review bombing and a one-review-per-book model described by users as "obsolete." A product that optimizes for considered writing rather than star-count is differentiated by design.

### The single recommendation

**Do not start by building a backend.**

Start with a ~1–2 week Milestone 0 that makes the *existing* content routable, searchable, and shareable while still file-driven. Every piece of that work survives the backend migration, it de-risks the hardest schema decision (work vs. edition identity), and it turns a private page into something with a URL that other people can land on — which is the precondition for any social loop at all. Milestone 1 then introduces accounts and writes.

**Revision 2 note.** With the confirmed constraints (§0) this gets sharper, not weaker. The target audience is a ~30-person university friend group reached through WhatsApp, which means the whole acquisition mechanism is *a link that looks like something when pasted into a group chat*. That is Open Graph tags and a decent page — exactly what Milestone 0 delivers, at zero infrastructure cost. The statistics page is promoted to P0 for the same reason: "meu ano em livros" in the group chat is the growth loop, the return trigger and the demo, and it needs no server.

Full reasoning in Sections 0 and 9–12.

---

## 2. Current product assessment

### 2.1 How it was inspected

- Static read of all 5 tracked files and the full 10-commit history.
- Dataset profiled programmatically (field fill rates, distributions, cross-file diff).
- Application served locally (`python -m http.server`) and driven in a browser: grid render, book modal, genre/country/decade filters, all six sort modes, the GeoChart map modal, zero-result state, console errors, lazy-load behaviour.
- Open Library cover endpoint tested directly against all 39 ISBNs that depend on it.

### 2.2 Verdict by dimension

| Dimension | State |
|---|---|
| Product category | Personal reading diary (static site) — **not** a platform |
| Multi-user | None. No concept of a user exists in code or data. |
| Write path | None. All mutation is `git commit`. |
| Backend | None. |
| Database | A 105 KB JSON file read with `fetch()` on mount. |
| Auth | None. |
| API | None. Two third-party reads: Open Library covers, ui-avatars placeholders. |
| Routing | None. Single URL. Modals are `v-if` on refs. |
| State management | Vue `ref`/`computed` inside one `setup()`. Appropriate for current scope. |
| Build | None. Vue 3 and Google Charts via `<script src>` CDN. |
| Tests | None. |
| Lint / typecheck | None. |
| CI/CD | None. No workflow files, no deploy config. |
| Env / config | None required. Nothing to misconfigure — this is genuinely a strength today. |
| Analytics | None. Zero instrumentation. |
| Docs | `CLAUDE.md` (authored during this session), `generos.txt` (a genre taxonomy). No README. |
| TODOs / specs | None found in the codebase. |
| Design system | CSS custom properties on `:root` — 7 tokens, dark-only, one 600px breakpoint. Coherent but not a system. |
| Seed/demo data | The real data *is* the seed data. No fixtures, no fake users. |

### 2.3 Environment setup

**No setup was required and nothing was broken.** The project runs as-is over any static HTTP server. One constraint worth documenting: it **must** be served over HTTP — opening `index.html` via `file://` fails because `fetch("livros.json")` is blocked by CORS.

```bash
python -m http.server 8000
```

No dependencies were installed, no configuration changed, no code modified.

### 2.4 Data health (measured)

86 records. Field fill rates:

| Field | Filled | Note |
|---|---|---|
| `title`, `author`, `country`, `original_language`, `year`, `publisher`, `pages`, `read_in`, `source`, `genre`, `isbn` | 86/86 | Excellent discipline |
| `rate` | 85/86 | One unrated book |
| `cover_url` | 47/86 | Remaining 39 resolve via Open Library |
| `review` | 56/86 | 65% review rate — very high |
| `series_name` / `series_number` | 23/86 | Only for books actually in series |

Distribution highlights:

- **Reading by year:** 2014:1, 2015:3, 2016:5, 2017:3, 2018:2, 2019:5, 2020:6, 2021:8, 2022:16, 2023:7, 2024:12, 2025:11, 2026:7 (year in progress).
- **Ratings:** 0.5:1, 1:2, 1.5:1, 2:3, 2.5:4, 3:13, 3.5:7, 4:31, 4.5:12, 5:11, unrated:1.
- **Countries:** Reino Unido 26, EUA 24, Brasil 14, Alemanha 5, Rússia 5, França 3, Portugal 2, then 7 countries with 1 each.
- **Format:** Físico 62, Ebook 24.
- **Authors:** 59 unique across 86 books.
- **Genres in data:** 26 distinct labels.

### 2.5 Confirmed defects

Each verified by running the app or by direct test, not inferred from reading code.

| # | Severity | Issue | Location | Evidence |
|---|---|---|---|---|
| 1 | High (latent) | Open Library returns **HTTP 200 with a 43-byte blank GIF** for unknown ISBNs, not a 404. `@error` therefore never fires and the `ui-avatars` placeholder is unreachable dead code. A missing cover renders as an invisible image, not a fallback. | `index.html:147`, `index.html:375` | Tested `9780000000000`: bare URL → `200`, 43 bytes. With `?default=false` → `404`. Fix is appending `?default=false`. All 39 current ISBNs do resolve, so this is latent — it will bite the moment a user adds a book. |
| 2 | High (blocking, future) | Reviews render through `v-html`. Safe today (single trusted author; the only tags present are 178 `<br>`), but this becomes a stored-XSS hole the instant a second person can write a review. | `index.html:77` | Tag census across all 56 reviews returned `{br: 178}` and nothing else. |
| 3 | Medium | Country filter renders **blank** on first load. `filterCountry` is initialised to `null` but the "Todos os Países" option has `value=""`, so no option matches. `resetFilters()` correctly sets `""`, so the bug self-heals after one reset. | `index.html:180` vs `index.html:111` | Visible in the running app; second dropdown shows an empty label until interacted with. |
| 4 | Medium | **No empty state.** Any filter combination yielding zero books renders a blank void plus a footer reading "0 Páginas Lidas". No message, no way to understand what happened. | `index.html:144-153` | Set `filterGenre='Teatro'` + `filterDecade='1600'` → `cards: 0`, footer `"0 Páginas Lidas"`. |
| 5 | Medium | Both modals are **keyboard-inaccessible**: Escape does not close them, there is no focus trap, and the close control is a `<span>` rather than a `<button>`. | `index.html:24`, `index.html:44` | Pressing Escape with a book modal open left `.modal-overlay` count at 1. |
| 6 | Medium | Book cards are `<div @click>` — not focusable, not keyboard-activatable, no `role`. Cover `<img>` elements have **no `alt` attribute**. The entire grid is unusable with a screen reader. | `index.html:145-148` | Source read. |
| 7 | Medium | The pt-BR interface leaks **English country names** into the book modal ("United Kingdom", "United States") because `mapCountryName` mutates the record at load time for the GeoChart's benefit. | `index.html:56`, `index.html:199-219` | Observed in the modal for *O retorno do rei*. |
| 8 | Medium | Genre **taxonomy drift**. `generos.txt` defines ~15 canonical genres; the data uses 26 different labels with different spellings — `Sci-fi` vs "Ficção Científica", `Mistério` vs "Suspense/Policial/Mistério", `Terror` vs "Terror/Horror", `Não-Ficção` vs "Não Ficção". A dozen labels in the data (`História`, `Política`, `Filosofia`, `Matemática`, `Economia`, `Tecnologia`, `Graphic Novel`, `Novela`, `Contos`, `Fábula`, `Comédia`, `Teatro`) do not appear in the taxonomy file at all. | `generos.txt` vs `livros.json` | Genre census vs file contents. |
| 9 | Medium | **Dual source of truth.** `livros.json` (86) and `livros_lidos_atualizado.csv` (83) have already diverged. Missing from the CSV: *O retorno do rei*, *Fragmentos do horror*, *A morte e a morte de Quincas Berro D'Água*. | both files | Title-set diff. |
| 10 | Low | `:key="book.title"` will collide on re-reads, duplicate titles across authors, and multiple editions — all of which a real product must support. | `index.html:145` | No duplicates today; structurally fragile. |
| 11 | Low | Map colours are hardcoded in `drawRegionsMap` and duplicate the `:root` CSS variable values. Theme changes require editing two places. | `index.html:339-350` | Source read. |
| 12 | Low | No `<meta name="description">`, no Open Graph tags, static `<title>`. Nothing shareable renders a preview. | `index.html:4-18` | Source read. See Section 9 — this is a *product* blocker, not a cosmetic one. |

**Not defects:** the grid, sorting, filtering, stats, cover fallback chain, and the GeoChart map all work correctly. The first screenshot appeared to show broken covers; this was `loading="lazy"` timing, and all 86 covers resolve on a normal viewport. No console errors of any kind.

---

## 3. Existing feature inventory

Verified by using the product, not by finding a component.

| Feature | Exists | What it actually does | Implementation | Assessment |
|---|---|---|---|---|
| Book grid | ✅ | Poster wall, cover + star rating, lazy-loaded | `index.html:144-153` | Complete. Correct Letterboxd visual grammar. |
| Book detail | ✅ | Modal: cover, title, stars, year, author, country, pages, genre chips, review | `index.html:42-84` | Complete but **not addressable** — no URL. |
| Star ratings | ✅ | Display only, half-star support (`★★★★½`) | `getStars`, `index.html:385` | Display-only. **No rating input exists.** |
| Reviews | ✅ | Long-form text rendered in modal | `index.html:75-81` | Display-only. **No review editor exists.** |
| Genre filter | ✅ | Single-select, derived from data | `index.html:105-108`, `221-224` | Works. Single-select only; no multi-select, no exclusion. |
| Country filter | ✅ | Single-select, also driven by map click | `index.html:110-115` | Works, but see defect #3. |
| Decade filter | ✅ | Derived from `year` | `index.html:117-122`, `233-239` | Works. Filters by *publication* decade, not reading year. |
| Sorting | ✅ | 6 modes, all with stable `original_index` tiebreak | `index.html:279-320` | Complete and well-implemented. |
| Reset filters | ✅ | Appears only when a filter is active | `index.html:136-138`, `244-248` | Good UX detail. |
| Library stats | ✅ | Books / authors / countries; pages read + average | `index.html:88-98`, `155-163` | Works. Header stats are global; footer stats respond to filters — an **inconsistency** users will misread. |
| World map | ✅ | Google GeoChart, lazy-drawn, click-to-filter | `index.html:322-367` | Works and is the app's most distinctive feature. Uses unfiltered data (`chartData` reads `books`, not `sortedBooks`). |
| Cover resolution | ✅ | `cover_url` → Open Library ISBN → ui-avatars | `index.html:375-383` | Works for current data. Fallback chain broken by defect #1. |
| Series data | ⚠️ | Stored (23 books) but **never rendered or used** | `livros.json` only | Data exists, feature does not. |
| `original_language` | ⚠️ | Stored for all 86 books, **never rendered or used** | `livros.json` only | Unused differentiator sitting in the data. |
| `publisher` | ⚠️ | Stored for all 86, **never rendered** | `livros.json` only | Unused. |
| `source` (Físico/Ebook) | ⚠️ | Stored for all 86, **never rendered or filtered** | `livros.json` only | Unused. |
| `read_in` | ⚠️ | Used only for sorting. **Never displayed.** No reading-year view, no diary, no year-in-review. | `index.html:295-301` | The most valuable unused field in the dataset. |
| Search | ❌ | Does not exist in any form | — | Not even over the local 86 books. |
| Book pages / routing | ❌ | Single URL, no deep links | — | |
| Author pages | ❌ | 59 authors, none clickable | — | |
| Add / edit a book | ❌ | Hand-edit JSON, commit | — | |
| Want to read / Currently reading | ❌ | Only implicit "read" exists | — | |
| Reading dates | ❌ | Year granularity only | — | |
| Lists / shelves | ❌ | — | — | |
| Accounts / auth / profiles | ❌ | — | — | |
| Follow / feed / likes / comments | ❌ | — | — | |
| Notifications | ❌ | — | — | |
| Recommendations | ❌ | — | — | |
| Import / export | ❌ | CSV exists but is an artifact, not a feature | — | |
| Sharing / OG / SEO | ❌ | — | — | |
| Analytics | ❌ | — | — | |
| Moderation | ❌ | N/A at single-user scale | — | |

**Feature completeness against a social reading platform: 14 of ~70 capability areas, all in the personal-catalog-display category.**

---

## 4. Architecture / technical assessment

### 4.1 Current shape

```
Browser
  ├── index.html  ── Vue 3 (CDN) ── one createApp({ setup })
  │                  Google Charts (CDN) ── GeoChart
  ├── styles.css  ── 7 CSS custom properties, 1 breakpoint
  └── fetch("livros.json") ── 86 records, 105 KB
         │
         ├── covers.openlibrary.org/b/isbn/{isbn}-L.jpg
         └── ui-avatars.com (placeholder)
```

All computation is client-side and synchronous over an 86-element array.

### 4.2 What is genuinely good and should be preserved

- **Zero-config, zero-build.** Deployable to any static host. Iteration cost is near zero. Do not introduce tooling until something actually requires it.
- **Clean derived-state model.** `computed` chains for genres/countries/decades/stats are correct and readable.
- **Stable sorting.** Every comparator falls back to `original_index`, preserving intra-year reading order. Easy to get wrong; it was gotten right.
- **Structured, complete data.** 100% fill on 11 of 16 fields across 86 records is unusual discipline and is the reason a migration is feasible at all.
- **Deliberate data modelling.** `genre` as an array, `read_in` separate from `year`, `original_language` separate from `country` — these are the right distinctions and most hobby projects collapse them.

### 4.3 What does not survive contact with a multi-user product

| Constraint | Breaks at | Consequence |
|---|---|---|
| JSON file as database | First concurrent write | No writes are possible at all today. Everything social is blocked here. |
| Fetch-entire-dataset-on-mount | ~2,000 books (~2.5 MB) | Current cost is 105 KB for 86 books ≈ **1.2 KB/book**. Fine now; a real catalog is 10⁶+ books. |
| Client-side filter/sort over full array | ~5,000 books | Needs server-side query + pagination. |
| No routing | Immediately | **No book has a URL.** Nothing can be shared, linked, indexed, or previewed. For a social product this is structural, not cosmetic. |
| Client-rendered SPA with no SSR | Immediately | No SEO, no Open Graph previews. Letterboxd's growth is share-driven; this architecture makes that channel impossible. |
| `v-html` on user text | First external author | Stored XSS. Hard gate before any multi-user launch. |
| `mapCountryName` hardcoded | Every new country | 14 countries mapped today. A new country silently falls through untranslated and vanishes from the map. |
| `title` as identity key | First re-read or duplicate | Needs stable IDs, and a work/edition model. |
| No tests, no types | ~1,000 lines | Currently 421 lines in one file — still tractable. The threshold is near. |

### 4.4 Technical debt vs. architectural limitation

Worth separating, because they need different responses:

- **Debt** (fix cheaply, in place): defects 1, 3, 4, 5, 6, 7, 11, 12. All are hours of work in the existing file.
- **Data hygiene** (fix before migrating): defects 8, 9, 10. Normalise genres, retire the CSV, add stable IDs.
- **Architectural limits** (require deliberate redesign): no persistence, no routing, no SSR, no identity model. These are Milestone 0/1 decisions, not fixes.

---

## 5. User journey analysis

### 5.1 First-time visitor (the only journey that currently exists)

| Step | What happens | Assessment |
|---|---|---|
| Land | Poster grid + "Minha Biblioteca" + 86/59/14 stats | Strong. Immediately legible, visually confident. |
| Onboard | Nothing. No explanation of whose library this is or what the site is for. | **Gap.** A visitor cannot tell if this is one person's diary or a catalog. |
| Sign up / log in | Does not exist. | **Blocking for the product concept.** |
| First interaction | Click a cover → modal | Good. The review is the payoff and it delivers. |
| Discover books | Browse the grid, or filter by genre/country/decade, or click the map | Works, but the ceiling is 86 books — one person's shelf. |
| Search | Does not exist. | **Gap.** With 86 books it is survivable; at 300 it is not. |
| Open a book | Modal only — no URL, no back-button, no share | **Gap.** Cannot link a friend to a review. |
| Understand metadata | Year, author, country, pages, genres, review | Good, but publisher / original language / series / format are hidden despite being stored. Reading year is hidden despite being the most interesting field. |
| Rate | Cannot. Display only. | **Blocking.** |
| Review | Cannot. Display only. | **Blocking.** |
| Add to a list | Lists do not exist. | **Blocking.** |
| Track reading | No want-to-read, no currently-reading, no progress, no dates. | **Blocking.** |
| Find other readers | No users exist. | **Blocking.** |
| Follow | N/A | **Blocking.** |
| View a profile | N/A — the whole site is one implicit, anonymous profile. | **Blocking.** |
| Return | No reason to. Content changes only when the owner commits. No feed, no notification, no bookmarkable state. | **Blocking for retention.** |

### 5.2 Owner journey (the real current user)

| Step | What happens | Assessment |
|---|---|---|
| Finish a book | — | |
| Log it | Open `livros.json`, hand-write a 16-field record, mirror into the CSV, commit | **Extremely high friction.** This is the actual retention risk for the only active user. The CSV has already drifted by 3 records because the mirroring step gets skipped. |
| Write the review | Type HTML with `<br>` tags into a JSON string | Hostile to the one activity the product is best at. |
| Find the cover | Manually source a `cover_url`, or hope Open Library has the ISBN | Semi-automated. |
| See the result | `git push`, reload | Works. |

**This is the most important journey finding in the report.** The product's scarcest asset is long-form reviews, and the authoring path for a review is "escape a 940-character paragraph into a JSON string literal." Lowering that friction has immediate, measurable value even with zero other users.

---

## 6. Core product loops

### 6.1 Discovery loop — *broken at the source*

`discover → open → save → read → rate → discover next`

- **Exists:** browse, filter, map-driven exploration, open.
- **Missing:** the corpus. You can only discover books already on one person's shelf. There is no search, no external catalog, no trending, no new releases.
- **Weak:** the loop has no exit into "next book" — nothing recommends, links, or relates books to each other. `series_name` and `author` are both stored and both non-navigable.
- **Differentiator potential:** **high**, via the country/language axis. "Books originally written in Portuguese", "readers who read from more than 20 countries" — nobody serious does this well, and the data is already here.

### 6.2 Reading loop — *only the last step exists*

`want to read → reading → finished → rate → review → history`

- **Exists:** "finished" (implicitly — everything in the file is read), rating, review, history-as-dataset.
- **Missing:** the entire front half. No want-to-read, no currently-reading, no start/finish dates, no re-reads.
- **Weak:** `read_in` is year-granularity and never displayed. A diary needs dates.
- **Critical observation:** on Letterboxd the **watchlist is the returning-user hook** — it is the reason to open the app when you are not logging something. There is no equivalent here, which is the single clearest explanation for why this product currently has no reason to be revisited.

### 6.3 Social loop — *does not exist*

`follow → see activity → discover → read → generate activity → others discover`

- **Exists:** nothing. Zero of six steps.
- **Blocked on:** user identity, which is blocked on a write-capable backend.
- **Note:** this loop is worthless without content, and content is the one thing this project already has. That ordering matters — see Section 10.

### 6.4 Taste loop — *has the raw signal, nothing consumes it*

`rate → system learns → recommendations improve → discovery improves`

- **Exists:** 85 ratings with real variance, 26 genres, 59 authors, 14 countries, 13 years of temporal signal. This is a **genuine taste profile** sitting unused.
- **Missing:** anything that reads it. No "your top genres", no "your rating distribution", no year-in-review, no similarity.
- **Honest assessment:** ML-style recommendation is **premature** — it needs on the order of 1,000 users × 20 ratings to beat a simple heuristic. But *self-reflective* taste surfacing ("you rated 31 books 4 stars", "you read from 14 countries") needs zero users and is highly shareable. **Build the mirror before the oracle.**

### 6.5 Collection loop — *absent, and it is the cheapest social object to build*

`build list → express identity → share → others discover books and you`

- **Exists:** nothing. No lists, no shelves.
- **Why it matters:** on Letterboxd, lists are the highest-leverage user-generated artifact per unit of effort — a list costs minutes to make, is inherently shareable, and generates both book discovery *and* user discovery.
- **Adjacent signal already present:** 23 books carry series data that would form natural auto-lists.

### 6.6 Content loop — *strong supply, zero distribution*

`reviews + ratings + lists + activity → community value`

- **Exists:** 56 substantial reviews — the hardest part of a content loop, already solved for one author.
- **Missing:** distribution. No URLs, no SEO, no OG previews, no feed, no likes, no comments. The content exists and **cannot leave the page**.
- **This is the highest-leverage gap in the entire report.** Supply is solved; distribution is at zero. Reversing that is unusually cheap.

### 6.7 Loop summary

| Loop | Exists | Missing | Weak | Differentiator potential |
|---|---|---|---|---|
| Discovery | Browse, filter, map | Search, catalog, trending, relations | Corpus of 86 | **High** (country/language) |
| Reading | Finished, rate, review | Want-to-read, in-progress, dates, re-reads | Year granularity | Medium |
| Social | — | Everything | — | Medium (needs scale) |
| Taste | Raw ratings | Any consumer of the signal | — | **High** (self-reflection stats) |
| Collection | — | Lists, shelves | — | **High** (cheap, shareable) |
| Content | 56 long reviews | URLs, SEO, OG, feed, likes | — | **Highest** (supply solved) |

---

## 7. Competitive research

Sources are cited inline. Claims are tagged: **[Fact]** = documented/observed, **[User feedback]** = reported user sentiment, **[Interpretation]** = my reading of it, **[Recommendation]** = proposed action.

### 7.1 Letterboxd — the stated reference

**[Fact]** Core mechanics: log films, five-star ratings **with halves**, a dated **diary**, watchlists, curated **lists**, reviews, and following other members to see their activity in a feed. ([Letterboxd](https://letterboxd.com/), [Wikipedia](https://en.wikipedia.org/wiki/Letterboxd))

**[Fact]** Letterboxd markets itself as "social film discovery" — the social graph is built around **taste**, not around real-life friend connections. ([Letterboxd](https://letterboxd.com/))

**[Interpretation]** Three design choices matter more than the feature list:

1. **The dated diary entry is the atomic unit**, not the rating. A rating is a number; a diary entry is an event with a date, and events are what make a feed worth reading. This project has `read_in` (a year) — which is not enough to build a diary.
2. **Follows are asymmetric and taste-based.** No friend requests, no reciprocity. This makes the graph cheap to grow and turns "being followed for good taste" into the core status reward.
3. **Constraint as identity.** Four favourites on your profile. Films only. The product says no a lot, which is why it reads as opinionated rather than as a database.

**[Recommendation]** Copy the *diary entry as atomic unit* and the *asymmetric follow*. Do not copy the feature surface.

### 7.2 Goodreads — the incumbent to learn from negatively

**[Fact]** Amazon-owned; the interface is substantially unchanged since the 2013 acquisition. ([Achriom](https://www.achriom.com/blog/best-goodreads-alternatives/), [Medium](https://medium.com/@muchtoado/why-letterboxd-and-not-goodreads-7a685a7a0949))

**[Fact]** Goodreads has **no half-star ratings**, by choice. A native DNF ("did not finish") shelf only arrived in March 2026. ([Achriom](https://www.achriom.com/blog/storygraph-vs-goodreads/))

**[Fact]** Documented review-bombing problem: coordinated one-star campaigns against books **before publication**. ([Achriom](https://www.achriom.com/blog/best-goodreads-alternatives/))

**[User feedback]** Recommendations are widely described as generic despite the volume of data Goodreads holds. ([Achriom](https://www.achriom.com/blog/storygraph-vs-goodreads/))

**[User feedback]** The one-review-per-user-per-book model is called "quite limited and obsolete" — it cannot represent re-reads or evolving opinion. ([Hacker News](https://news.ycombinator.com/item?id=37744905))

**[Interpretation]** Goodreads' weakness is not missing features; it is that **it is a database with a social layer bolted on**, where Letterboxd is a social product with a database underneath. The half-star omission is the tell: it is a tiny change that Goodreads will not make and that every competitor ships on day one.

**[Recommendation]** Half-stars from day one (this project **already has them** — keep them). Allow multiple dated log entries per book per user, which is the same decision as "make the diary entry the atomic unit."

### 7.3 StoryGraph

**[Fact]** Launched 2019. Differentiates on analytics: mood and pace tagging per book, statistical charts, algorithmic preference learning. ([Wikipedia](https://en.wikipedia.org/wiki/The_StoryGraph), [Achriom](https://www.achriom.com/blog/storygraph-vs-goodreads/))

**[Fact]** Users only gained the ability to **like reviews in February 2026**, and still cannot comment on them. No Kindle integration. ([Achriom](https://www.achriom.com/blog/storygraph-vs-goodreads/))

**[Interpretation]** StoryGraph proves that **statistics alone retain a certain kind of reader** — the analytics are genuinely loved. But it also shows the ceiling: without lightweight social interaction, the product stays a personal tool. It won the taste loop and skipped the social loop.

**[Recommendation]** Take the statistics ambition seriously (this project's map is already in that spirit), but do not repeat the mistake of deferring the cheapest social primitives — a like on a review costs almost nothing and is the entry point to everything else.

### 7.4 Hardcover

**[Fact]** Explicitly positioned as "Letterboxd for Books"; social-first, with community discussion and reader curation driving discovery. ([Hacker News](https://news.ycombinator.com/item?id=37744905), [Bookwise](https://bookwiseapp.com/blog/hardcover-vs-storygraph))

**[User feedback]** Its most-cited weaknesses are all **catalog** problems: a smaller database, poor coverage of older and non-English titles, missing edition data (often only the first US hardcover, with paperback / audiobook / international editions absent), and a thin review corpus — 0–2 reviews per book versus hundreds on Goodreads. ([Bookwise](https://bookwiseapp.com/blog/hardcover-vs-storygraph))

**[User feedback]** From its launch thread: readers want **notes during reading** rather than only a post-completion review; bulk list editing; and, notably, several users actively dislike social feeds and want a library or statistics view as their homepage. ([Hacker News](https://news.ycombinator.com/item?id=37744905))

**[Interpretation]** Hardcover is the closest analogue to what is proposed here, and its struggles are the clearest warning: **the catalog is the hard part, not the social features.** A social book app with a thin database fails on the first search. This is a direct argument for not hand-building a catalog.

**[Interpretation]** "Some users don't want a feed" is a real signal, not noise. It argues for the **profile/library as the default home**, with the feed as a tab — which also happens to be the cheaper thing to build.

### 7.5 Literal

**[Fact]** Founded 2020 in Berlin; iOS, Android, and web; recognised primarily for clean, minimal, Letterboxd-adjacent design. It explicitly markets itself on the "Letterboxd for books" query. ([Literal](https://literal.club/letterboxd-for-books), [Clarify](https://clarify.wiki/en/letterboxd-for-books/))

**[Interpretation]** Literal shows that **design alone is a legitimate wedge** in this category — the incumbents are genuinely ugly. It also shows design alone is not a moat: it is well-regarded and has not displaced anyone.

### 7.6 Skoob — the actually relevant incumbent

**[Fact]** Brazilian, launched 2009, **~10 million users**, the dominant pt-BR reading social network. Acquired by Americanas S.A. in 2021, subsequently sold to Skeelo. ([Wikipedia](https://en.wikipedia.org/wiki/Skoob), [Compara Plano](https://comparaplano.com.br/skoob/))

**[User feedback]** Persistent complaints about app errors and instability; the book-trading system has been "paused" since August with no restoration timeline and **no public communication from administrators despite numerous complaints**; the platform suffered technical stagnation and under-investment under its previous ownership. ([Reclame Aqui](https://www.reclameaqui.com.br/skoob1/sistema-de-trocas-do-skoob-pausado-e-falta-de-comunicacao-com-usuarios_P-6Alyl3ibJDwph0/), [Portal Assobiar](https://portalassobiar.com.br/colunistas/skoob-uma-rede-social-para-leitores/))

**[Interpretation]** **This is the most important competitive finding in the report.** The pt-BR market has a large, engaged, demonstrably underserved user base whose incumbent has been passed between owners, is technically decaying, and is not communicating with its community. That is a far more attractive position than competing in English against Goodreads, StoryGraph, Hardcover and Literal simultaneously — where this project would be the fifth entrant with the smallest catalog.

**[Recommendation]** **Position pt-BR first.** Brazilian editions, Brazilian publishers, Portuguese interface, Portuguese reviews. The existing data already leans this way: 14 Brazilian books, publishers like Intrínseca recorded per book, `original_language` on every record, and the entire UI already in pt-BR.

### 7.7 Catalog infrastructure

**[Fact]** Open Library offers free, open-licensed bibliographic data over 20M+ records with no API key, plus a Covers API keyed by ISBN or OLID, and free bulk export. Google Books is free with a daily quota. ([Open Library](https://openlibrary.org/developers/api), [API.market](https://api.market/blog/skycraft/books-api/best-books-api))

**[Fact — measured here]** All **39 of 39** ISBNs in this dataset that lack a manual `cover_url` resolve to a real Open Library cover. Encouraging for a Portuguese-language catalog.

**[Fact — measured here]** The Covers API returns **HTTP 200 with a 43-byte blank GIF** for an unknown ISBN unless `?default=false` is passed, in which case it returns 404. This silently defeats `onerror` fallbacks (defect #1).

**[Interpretation]** Open Library is the right starting catalog: free, open-licensed, no key, bulk-exportable. Its known weakness is **edition-level** metadata for non-English markets — exactly where a pt-BR product needs to be strong. **[Open question]** Nobody has yet measured Open Library's completeness for Brazilian editions beyond covers.

### 7.8 Synthesis

**Table stakes** — expected on arrival, no credit for having them: search, book pages, shelves (want-to-read / reading / read), half-star ratings, reviews, profiles, follows, basic yearly stats, Goodreads import, mobile-usable web.

**Repeatedly requested, repeatedly under-served:** notes taken *during* reading rather than only after; multiple/dated log entries per book (re-reads); bulk list editing; a non-feed homepage; strong non-English edition data; recommendations that are actually personal.

**Attractive but low leverage — deliberately deprioritised here:**
- *Page-by-page progress tracking.* High friction, low shareable output. StoryGraph users like it; it does not generate content.
- *Achievements and badges.* Gamification without a social graph is a scoreboard nobody sees.
- *Collaborative lists.* Needs a network first.
- *ML recommendations.* Below ~1,000 active raters, a simple "popular among people you follow" query outperforms a model and costs a fraction as much.
- *Native mobile apps.* A good responsive PWA is sufficient for years.

**Differentiation candidates, ranked:**
1. **pt-BR first, with real Brazilian editions.** Large underserved market, decaying incumbent, documented competitor weakness in non-English data.
2. **Reading-the-world / translation diversity as a social object.** Unclaimed, already prototyped here, inherently shareable.
3. **Long-form review culture.** Structural response to review bombing and the one-review model; matches the content already in this repository.

---

## 8. Feature discovery

Applying the discovery framework to this specific product. Verdicts are opinionated, not neutral.

### Books
| Feature | Verdict |
|---|---|
| Book search | **Essential.** Nothing works without it. |
| Book pages (own URL) | **Essential.** Precondition for sharing, SEO, and every social mechanic. |
| Author pages | **High.** 59 authors already; cheapest navigable relation in the data. |
| ISBN search | **Medium.** Useful for adding a physical book; low frequency. |
| Editions | **High but expensive.** The work/edition distinction must be decided at schema time. Critical for pt-BR (translations are separate editions). |
| Covers | **Done.** Fix defect #1. |
| Genres | **High** — but normalise first (defect #8). |
| Tags (free-form) | **Defer.** Overlaps genres; needs moderation. |
| Series | **Medium.** Data exists for 23 books and is completely unused — cheap win. |
| Publication info | **Low.** Already stored; just render it. |
| Multiple languages | **High, strategically.** `original_language` is a differentiator, not a metadata field. |
| Audiobooks / formats | **Low now.** `source` (Físico/Ebook) already covers 90% of the value. |

### Reading tracking
| Feature | Verdict |
|---|---|
| Want to read | **Essential.** This is the returning-user hook. Its absence is the clearest reason the product has no reason to be revisited. |
| Currently reading | **High.** Enables the feed's most interesting state. |
| Read | **Exists** (implicitly). Needs to become explicit. |
| Reading dates (start/finish) | **Essential.** Upgrades `read_in` from a sort key to a diary. |
| Reading history / diary | **Essential.** The atomic unit of the whole product. |
| Re-reading | **High.** Directly addresses the "one review per book is obsolete" complaint; falls out free if log entries are the atomic unit. |
| Reading progress (%/page) | **Deprioritise.** High friction, low leverage. |
| Streaks | **Skip.** Punishes the natural rhythm of reading. |
| Yearly goal | **Medium.** Cheap, well-understood, drives December engagement. |
| Statistics | **High.** The data already supports rich stats today. |

### Ratings and reviews
| Feature | Verdict |
|---|---|
| Star + half-star ratings | **Exists** (display). Needs input. Keep halves — it is a competitive differentiator against Goodreads. |
| Written reviews | **Exists** (display). Needs an editor. **This is the product's strongest asset.** |
| Spoiler marking | **High.** Cheap, and readers care disproportionately. |
| Review likes | **High.** Cheapest possible social primitive and the entry point to the social loop. |
| Review comments | **Medium.** Needs moderation; defer past first social release. |
| Review sort / filter | **Medium.** Only matters once books have many reviews. |
| Rating distribution per book | **Medium.** Needs volume. |
| Review editing | **Essential** if writes exist at all. |

### Social
| Feature | Verdict |
|---|---|
| Profiles | **Essential.** The profile *is* the product for a diary-based app. |
| Asymmetric follow | **Essential.** Copy Letterboxd, not Goodreads friend requests. |
| Activity feed | **High — but not the homepage.** Users explicitly report disliking feed-first homepages. |
| Likes | **High.** |
| Comments / mentions | **Medium.** Moderation cost. |
| Notifications | **Medium.** Needed for retention; a notifications *page* is enough before email/push. |
| User discovery | **High.** Unsolvable by search alone — surface via lists and reviews. |
| Following authors | **Low.** Authors are not on the platform. |

### Lists / shelves
| Feature | Verdict |
|---|---|
| Custom lists | **High.** Highest value-per-engineering-hour social artifact. |
| Public/private | **Essential** alongside lists. |
| Ranked lists | **Medium.** Distinctive and cheap once lists exist. |
| Descriptions | **High.** Turns a list into an editorial object. |
| List followers | **Medium.** |
| Collaborative lists | **Defer.** Needs a network. |
| Sharing | **High.** Falls out of routing + OG. |

### Discovery
| Feature | Verdict |
|---|---|
| Popular among people you follow | **High.** A SQL query, not a recommender. Best discovery-per-effort ratio in the product. |
| Trending books | **Medium.** Needs volume to be non-embarrassing. |
| Popular reviews | **High.** Directly monetises the existing content strength. |
| New releases | **Low.** Catalog-dependent; a feed of things nobody has read yet. |
| Similar books | **Medium.** Start with shared genre + author + series, not embeddings. |
| Personalised recommendations | **Defer.** Premature below ~1,000 raters. |
| Genre / author / country discovery pages | **High.** Nearly free given existing data, and SEO-valuable. |
| Curated collections | **Medium.** Editorial, not engineering — a cheap way to seed taste. |

### Personalisation
| Feature | Verdict |
|---|---|
| Taste profile (top genres/authors/countries) | **High.** Data already exists; nothing consumes it. |
| Favourite books on profile | **High.** Letterboxd's four-favourites constraint is a masterclass in cheap identity. |
| Personalised home feed | **Medium.** Depends on the graph. |
| Explicit preferences | **Low.** Behaviour beats stated preference. |

### Statistics / gamification
| Feature | Verdict |
|---|---|
| Year in review | **High.** Seasonal, highly shareable, fully supported by existing data. |
| Genre / country / language stats | **High.** The differentiator. |
| Pages, authors, rating distribution | **High.** Already computable today. |
| Reading timeline | **High.** 13 years of history is a compelling artifact. |
| Achievements | **Skip for now.** |

### Community / moderation
| Feature | Verdict |
|---|---|
| Spoiler controls | **High.** Ship with reviews. |
| Report content | **Required before public writes.** |
| Block / mute | **Required before a social graph.** |
| Admin tooling | **Required before public launch**, minimal form. |
| Review guidelines | **High, cheap.** Sets culture early — the main defence against review bombing. |

### Platform / growth
| Feature | Verdict |
|---|---|
| Per-object URLs | **Essential.** |
| Open Graph previews | **Essential.** The primary acquisition channel for a social reading product. |
| SEO / SSR | **High.** Review pages are long-tail search assets. |
| Goodreads / Skoob import | **High** — the single best cold-start solution, for catalog *and* content. |
| Data export | **High, cheap.** A trust signal that directly targets Goodreads/Skoob lock-in resentment. |
| Email notifications | **Medium.** |
| Push notifications | **Low.** |
| PWA / responsive | **High.** Mobile-first is where reading logging actually happens. |
| Native apps | **Defer for years.** |

---

## 9. Product gaps

### 9.1 Critical — the core loop cannot function

| Gap | Underlying user problem | Why it is critical |
|---|---|---|
| **No write path** (no backend, no persistence) | "I finished a book and I want to record it." Today that means editing a JSON file and committing to git. | Blocks rating, reviewing, shelving, listing, following — everything. Every other critical gap is downstream of this one. |
| **No user identity** | "I want this to be *my* library, and to see other people's." | Without users there is no social graph, no profile, no follow, no feed. The product concept is impossible. |
| **No book catalog / search** | "I want to log a book that isn't already on this page." | The library is capped at 86 hand-entered books. Discovery cannot start, and a new user's first action fails immediately. |
| **No URLs / routing** | "I want to send my friend this review." | No book, review, list, or profile is addressable. Nothing is shareable, linkable, indexable, or previewable — this closes the primary acquisition channel for a social product. |
| **No want-to-read** | "I heard about a book — where do I put it?" | This is the returning-user hook. Its absence is the most direct explanation for why the product has no reason to be revisited between finished books. |
| **No dated log entries** | "When did I read this, and what did I think *then*?" | `read_in` is a year. A diary needs dates, and the dated entry is the atomic unit that makes a feed worth reading and re-reads representable. |

### 9.2 Important — significant usability, retention, and discovery impact

| Gap | Underlying user problem |
|---|---|
| No search, even locally | At 86 books browsing works; at 300 it fails. Cheap to add now. |
| No lists | No way to express curated taste — the cheapest social artifact is missing. |
| No profile page | Even single-user, there is nothing that says who this reader is. |
| No stats / year-in-review | 13 years of data and zero self-reflection surfaces. Highest value-per-effort item in the repository. |
| No empty state (defect #4) | Filtering to zero results produces a blank void. |
| Metadata stored but never shown | `publisher`, `original_language`, `series`, `source`, and `read_in` are all captured for every book and displayed for none. |
| No author or genre navigation | 59 authors, 26 genres, all dead ends. |
| Keyboard and screen-reader inaccessible (defects #5, #6) | Excludes users outright; also an SEO signal. |
| Genre taxonomy drift (defect #8) | Filters fragment across 26 inconsistent labels. |
| English country names in a pt-BR UI (defect #7) | Small, but it undermines the pt-BR positioning that is the strategic thesis. |
| No import path | New users face the same blank-slate problem; import is the standard answer. |

### 9.3 Strategic opportunities — differentiation

| Opportunity | Rationale |
|---|---|
| **pt-BR-first catalog and community** | Skoob: ~10M users, twice-sold, decaying, non-communicative. Global competitors have documented weak non-English edition data. Existing data already carries Brazilian publishers and `original_language`. Largest opening available. |
| **Reading-the-world identity** | The map is already the most distinctive screen. Country + original language as a shareable identity stat is unclaimed by every major competitor and costs almost nothing given the existing schema. |
| **Long-form review culture** | Directly targets review bombing and the "obsolete" one-review model. The repository already contains 56 reviews at a 940-character median — proof the format works. |
| **Multiple dated entries per book** | Fixes re-reads and evolving opinion, which Goodreads structurally cannot represent. Free if the diary entry is the atomic unit. |
| **Data portability as a trust position** | Import from Goodreads/Skoob, one-click export. Cheap to build; directly attacks incumbent lock-in resentment. |

### 9.4 Nice to have — explicitly deferred

Reading progress percentages; streaks; achievements and badges; collaborative lists; ML recommendations; native mobile apps; audiobook/format taxonomy; following authors; new-release feeds; book clubs; social trade/lending (Skoob's broken feature — tempting, operationally miserable).

---

## 10. Opportunity areas

Consolidated assessment. Evidence column references actual files and measurements.

| Area | Current state | Evidence in code | UX / technical issue | Opportunity |
|---|---|---|---|---|
| **Discovery** | Browse + 3 filters + map over 86 books | `index.html:101-142` (filters), `322-367` (map) | Corpus is one shelf; no search; no relations; dead-end author/genre | Search + author/genre/country pages; "popular among people you follow" as a query, not a model |
| **Book pages** | Modal only | `index.html:42-84` | **No URL** — unshareable, unindexable, no OG preview; publisher/language/series/format hidden despite being stored | Routed `/livro/{slug}` with SSR + OG image; render the 5 stored-but-hidden fields |
| **Reading tracking** | Implicit "read" + `read_in` year | `livros.json`, `index.html:295-301` | No want-to-read, no in-progress, no dates, no re-reads; `read_in` never displayed | Three shelves + dated diary entries; re-reads fall out free |
| **Reviews** | 56 reviews, display-only, `v-html` | `index.html:75-81` | No editor; **stored-XSS gate** before multi-user; no likes, spoilers, or permalinks | Editor + sanitiser + permalink + like + spoiler toggle. Supply is solved; only distribution is missing |
| **Ratings** | 85 ratings, half-star, display-only | `getStars` `index.html:385` | No input | Rating input; keep halves (Goodreads still lacks them) |
| **Social graph** | Absent | — | Blocked on identity, blocked on backend | Asymmetric follow; profile-first home with the feed as a tab |
| **Profiles** | Absent (site is one implicit profile) | `index.html:86-98` | No identity, no favourites, no stats | `/@usuario` with favourites, stats, diary, lists |
| **Lists** | Absent | — | — | Best social-artifact-per-engineering-hour available; 23 books have unused series data for auto-lists |
| **Recommendations** | Absent | — | Insufficient data for ML by orders of magnitude | Heuristics only: same author, same series, shared genres, followed-reader activity |
| **Search** | Absent entirely | — | Fails at ~300 books, and fails immediately for any book not already on the shelf | Local fuzzy search now; Open Library-backed catalog search at Milestone 1 |
| **Notifications** | Absent | — | No return trigger | Notifications page first; email later; push much later |
| **Stats / taste** | Header + footer counters only | `index.html:249-262` | Header stats are global while footer stats follow filters — users will misread this; 13 years of signal unused | Year-in-review, top genres/authors/countries, reading timeline, languages read — all computable from existing data today |
| **Growth / SEO** | Absent | `index.html:4-18` | No meta description, no OG, static title, client-only render | SSR/SSG review and book pages; OG images per review |
| **Data integrity** | Dual source, drifting | `livros.json` 86 vs CSV 83 | Manual mirroring already skipped 3 times; genre labels fragmented | Single source of truth; normalise genres; stable IDs |

---

## 11. Prioritised feature backlog

Full backlog in [`docs/feature-backlog.md`](feature-backlog.md), which has been **revised against the confirmed constraints in §0** and is authoritative. The table below is the Revision 1 ordering, retained for the reasoning in the "Why now" column; where the two disagree, the backlog wins. The material changes are:

- **Promoted:** statistics/year-in-review (P1 → **P0**, it is the growth loop for a WhatsApp-distributed friend group); invite codes and the público/privado toggle (**new P0**); manual add-book fallback (**new P0**).
- **Demoted:** asymmetric follows and follow-filtered feeds (P1 → P2, replaced by a global feed); SEO and sitemaps (P0 → P2, Google is not the channel); moderation tooling (P2 → P3, invite-only cohort).



**Priorities:** P0 fundamental/blocking · P1 high value · P2 valuable but can wait · P3 exploratory
**Effort:** S ≈ ≤2 days · M ≈ ≤1 week · L ≈ 2–4 weeks · XL ≈ >1 month

| P | Feature | User problem | Product impact | Effort | Dependencies | Why now |
|---|---|---|---|---|---|---|
| P0 | Client-side routing + per-book URLs | "I can't link anyone to this review" | Unblocks sharing, SEO, OG, deep links — precondition for every social mechanic | M | None | Cheapest structural unlock in the project; doable before any backend |
| P0 | Open Graph + meta tags per book/review | "My link looks like nothing when I paste it" | Primary acquisition channel for a social reading product | S | Routing | Worthless without routing, near-free with it |
| P0 | Local search over the library | "Where is that book?" | Fixes the most basic navigation failure | S | None | Fails at ~300 books; costs hours today |
| P0 | Fix cover fallback (`?default=false`) | "Some covers are just missing" | Prevents invisible covers for every future book | S | None | One-line fix for a confirmed latent break |
| P0 | Persistence + auth (Postgres/Supabase) | "I want to log a book without editing JSON" | Unblocks literally everything social | L | Schema decision | The gate. Nothing in Sections 6.2–6.6 moves until this ships |
| P0 | Data model: users, books, editions, log entries | "I re-read this and want a second entry" | Wrong schema here is paid for forever | M | — | Must precede the backend, not follow it |
| P0 | Catalog integration (Open Library) + book search | "The book I want isn't here" | Removes the 86-book ceiling; first action of every new user | L | Persistence | Hardcover's biggest complaints are all catalog problems — this is the known failure mode |
| P0 | Log entry: date + rating + review, with editing | "I finished a book" | The core creative act of the product | M | Persistence, schema | The atomic unit; everything else composes from it |
| P0 | HTML sanitisation for user text | Security | Blocks stored XSS | S | Multi-user writes | Hard gate. Must land with the first external write |
| P1 | Want-to-read shelf | "Where do I put a book I haven't started?" | The returning-user hook | M | Persistence | Most-cited reason to open a reading app between books |
| P1 | Profile page `/@usuario` | "Who is this reader?" | The profile *is* the product for a diary app | M | Persistence, routing | Every social feature hangs off it |
| P1 | Asymmetric follow + activity feed (as a tab) | "What are people I trust reading?" | Starts the social loop | M | Profiles | Feed-as-tab, not feed-as-home — users report disliking feed-first homes |
| P1 | Stats / year-in-review | "What does my reading say about me?" | Highly shareable; drives seasonal engagement | M | None (data exists) | **Computable from `livros.json` today with zero backend** |
| P1 | Lists (create, describe, public/private) | "I want to curate" | Best social-artifact-per-effort ratio | M | Persistence | Generates both book and user discovery |
| P1 | Review likes | "I want to signal appreciation" | Cheapest social primitive; entry point to the graph | S | Social graph | StoryGraph waited until 2026 — do not repeat that |
| P1 | Author + genre + country pages | "More like this" | Converts dead-end metadata into navigation and SEO surface | M | Routing | Data exists for all three |
| P1 | Goodreads / Skoob import | "I have 10 years of history elsewhere" | Solves cold start for catalog and content simultaneously | M | Persistence, catalog | Best single growth lever once accounts exist |
| P1 | Normalise genres to `generos.txt` | "The same genre appears twice" | Fixes filter fragmentation | S | None | Do before migration — cheap now, expensive later |
| P2 | Currently-reading shelf | "What am I in the middle of?" | Enriches the feed | S | Shelves | |
| P2 | Spoiler marking | "Don't ruin it" | Trust and safety for reviews | S | Reviews | |
| P2 | Popular among people you follow | "What is my circle reading?" | Best discovery-per-effort; a query, not a model | M | Social graph | Needs graph volume |
| P2 | Notifications page | "Did anyone respond?" | Return trigger | M | Social graph | |
| P2 | Data export | "I don't want to be locked in" | Trust positioning against incumbents | S | Persistence | |
| P2 | Report / block / mute + admin tooling | Safety | Required before public writes | M | Social graph | Must precede public launch, not follow it |
| P2 | Series navigation | "What's next in this series?" | 23 books already carry the data | S | Routing | |
| P2 | Accessibility pass (keyboard, alt, focus) | "I can't use this" | Correctness and SEO | S | None | |
| P3 | Reading-the-world challenge | "Read more widely" | The differentiator, productised | M | Stats | Distinctive; validate the base loop first |
| P3 | Review comments | "I want to discuss" | Deepens engagement; adds moderation cost | M | Moderation | |
| P3 | Similar books (heuristic) | "More like this" | Discovery without ML | M | Catalog | |
| P3 | Yearly reading goal | "Keep me honest" | Seasonal | S | Stats | |
| P3 | PWA / offline | Mobile ergonomics | Retention on the device where reading happens | M | — | |
| — | ML recommendations | — | **Explicitly deferred.** Below ~1,000 raters, heuristics win at a fraction of the cost | XL | Scale | Not now |
| — | Native mobile apps | — | **Explicitly deferred for years.** A good responsive PWA suffices | XL | — | Not now |

---

## 12. Recommended next milestone

### Why not "just build the backend"

The instinct is to jump to accounts and a database. That would be a mistake for three reasons:

1. **The hardest decision is the schema** (work vs. edition, log entry as atomic unit), and it is easier to reason about after the presentation layer has been shaped around it.
2. **The highest-leverage gap is distribution, not persistence.** 56 substantial reviews exist and cannot leave the page. Fixing that requires routing, OG tags and SEO — none of which need a backend.
3. **Everything in Milestone 0 survives the migration.** Routes, components, stats, sanitisation and normalised data all carry forward unchanged.

### Milestone 0 — "From private page to public profile" (~1–2 weeks, no backend)

**Must build**

| Item | Why it belongs here |
|---|---|
| Routing: `/`, `/livro/{slug}`, `/autor/{slug}`, `/genero/{slug}`, `/pais/{slug}`, `/ano/{ano}` | Every book, author and review becomes addressable. The single largest unlock available, and it needs no server. |
| SSG/SSR + per-page `<title>`, meta description, Open Graph | Turns 56 reviews from invisible into 56 indexable, shareable pages. Supply is solved; this is the distribution fix. |
| Local search (title, author, series) | The most basic navigation gap; hours of work. |
| Stats / year-in-review page | Fully computable from `livros.json` today. Highest value-per-effort item in the repository, and it activates the taste loop with zero infrastructure. |
| Render the hidden metadata: `read_in`, `publisher`, `original_language`, `series`, `source` | Already captured for every book; currently shown for none. |
| Empty state + accessibility pass + Escape-to-close + `alt` text | Defects 3–7. Hours of work; the product currently excludes screen-reader users entirely. |
| `?default=false` on Open Library covers | Defect 1. One line; prevents invisible covers for every future book. |
| Normalise genres against `generos.txt`; retire the CSV | Defects 8–9. Cheap now, painful after migration. |

**Should build**

| Item | Why not "must" |
|---|---|
| Reading timeline (13 years, visualised) | Delightful and shareable, but the stats page already covers the core. |
| Series navigation | 23 books have the data; small audience until the catalog grows. |
| Country/language diversity view built on the existing map | Differentiator prototype — worth exploring, not worth blocking on. |
| Stable IDs in `livros.json` | Genuinely useful as migration prep; not user-visible. |

**Explicitly later:** anything requiring a server.

**Exit criterion:** every book and review has a URL that renders a correct social preview; the stats page exists; a stranger landing on a review page understands whose library this is and can navigate to related books.

### Milestone 1 — "One reader becomes many" (~4–6 weeks)

Revised against §0. The target is not "a platform" but **a specific ~30-person friend group, invited by the owner, sharing links over WhatsApp, at zero cost.** Every item is judged against one question: *does this get a friend from invite to their third logged book?*

**Must build**

| Item | Why it belongs here |
|---|---|
| Supabase free tier: Postgres + **Google OAuth** | The gate. Google OAuth specifically, not email — Supabase's built-in sender is capped at 2 emails/hour project-wide and refuses non-team addresses (§0.3), which breaks a 30-person launch evening outright. |
| Schema: `users`, `works`, `editions`, `log_entries`, `shelf_items`, `visibility` | Most expensive thing to get wrong. `log_entries` as the atomic unit gives dated diary entries and re-reads for free. Visibility is a column on every user-owned object from day one — retrofitting privacy is miserable. |
| **Invite codes** (closed registration) | Replaces public sign-up. Removes spam, abuse and impersonation as categories, which is precisely what justifies deferring moderation tooling to M3. |
| **Two-level visibility: público / privado, defaulting to público** | Owner requirement. The default matters more than the feature: with only two levels, `privado` must be an escape hatch, not the resting state, or the social loop never starts (§0.2). |
| Catalog integration (Open Library) + book search + **manual add fallback** | Removes the 86-book ceiling. The manual "não achei, adicionar à mão" path is what makes Open Library's pt-BR gaps survivable — at ~1,500 works across the cohort, a handful of hand-entered books is nothing. |
| Log a book: date + half-star rating + review, with editing | The core creative act. |
| Migrate `livros.json` as the owner's history | Proves the schema against 13 years of real data, and means the first friend to sign up lands on a site that already has 86 books and 56 reviews in it rather than an empty room. |
| HTML sanitisation on all user text | **Hard security gate.** Must land with the first external write, not after. |
| Want-to-read shelf | The returning-user hook. Without it there is no reason to open the product between books. |
| Profile page `/@usuario` | The profile is the product for a diary app, and it is the thing that gets pasted into the group chat. |
| Analytics as an `events` table in Postgres (§14) | Zero cost, zero third parties, full query access. Ship with the features. |

**Should build:** a **global chronological feed** ("o que a galera está lendo") — *not* a follow-based one; lists with público/privado; review likes; currently-reading shelf; Goodreads/Skoob import (as activation, not acquisition).

**Explicitly deferred to M2+ by the cohort size:** asymmetric follows and any follow-filtered feed (pointless below ~200 users); "popular among people you follow"; similar books; recommendations; notifications; comments; moderation tooling; SEO and sitemaps.

**Launch-day checklist implied by §0.3:** Google OAuth wired (not magic links); a weekly GitHub Actions cron pinging Supabase so the project never pauses; covers hotlinked from Open Library, never proxied.

### Definition of the core loop this is building toward

Derived from the evidence rather than copied:

> **Log a finished book → rate and write → the entry gets a URL → someone reads it → follows the reader → sees their next log → discovers a book → logs it**

- **Primary user (confirmed, §0):** the owner's university friend group — Brazilian, Portuguese-speaking, reachable through a WhatsApp group, roughly 20–50 people. The archetype within that group is the reader with opinions: 10–20 books a year, writes considered paragraphs, may be on Skoob or Goodreads and finds both ugly and neglected. *Evidence: this repository is exactly that reader — 86 books over 13 years, accelerating to 12–16/year, 65% of them reviewed at a 940-character median.*
- **Cohort caveat:** most of a 30-person friend group will not be that archetype. Expect a power-law split — perhaps 5 heavy loggers, 10 occasional, 15 lurkers. Design for the lurkers to still get value (browsing friends' reviews, seeing the year-in-review) without logging, because that is what keeps the group worth showing up to.
- **Job to be done:** *"Keep a record of my reading life that I am proud enough to show people."* Note that this is **not** "manage a to-read pile" — that is Goodreads' job-to-be-done and it is a worse one, because a pile is private and a record is social.
- **First meaningful action:** log one finished book with a rating and a few sentences.
- **Activation moment:** the third logged book with at least one written review — the point at which a profile becomes worth following.
- **Recurring behaviour:** logging a finished book (every 2–4 weeks for this user), plus opening the want-to-read shelf between books.
- **Network effect:** reviews and lists are public, indexed objects. Each one is both an acquisition surface (search, shared links) and a follow trigger.
- **Return trigger, in order of strength:** someone engaged with my review → a reader I follow logged something → I finished a book → my want-to-read shelf.

**The deliberate bet:** optimise for the *log and the review*, not for shelf management. Shelf management is where Goodreads and StoryGraph are strong and where a new product cannot win. The log is where Letterboxd won, and it is what this repository already has 13 years of.

---

## 13. Technical implications

Not to be implemented yet. Flagged for planning.

### 13.1 Data model (the decision that matters most)

```
users(id, handle, name, bio, avatar_url, default_visibility, invited_by, created_at)
invites(code, created_by, claimed_by, claimed_at)
works(id, title, original_title, original_language, first_published_year, canonical_author_id, source /* openlibrary | manual */)
authors(id, name, country, slug)
editions(id, work_id, isbn13, publisher, language, page_count, format, cover_url, published_year)
log_entries(id, user_id, edition_id, rating, review_html, review_text,
            started_at, finished_at, is_reread, contains_spoilers,
            visibility /* publico | privado */, created_at)
shelf_items(id, user_id, work_id, shelf /* want_to_read | reading | read */,
            visibility, added_at)
lists(id, user_id, title, description, visibility, is_ranked)
list_items(id, list_id, work_id, position, note)
likes(user_id, target_type, target_id, created_at)
events(id, user_id, name, props jsonb, created_at)   -- analytics, §14
-- follows(follower_id, followee_id, created_at)     -- deferred to M3, see §0.1
```

**Critical decisions:**

0. **`visibility` is a column on every user-owned object from day one**, defaulting to `publico` (§0.2). Two values only — `publico` | `privado` — per the owner's decision. Retrofitting privacy into an existing schema is one of the more miserable migrations available, and it costs nothing to include now. Enforce it with Postgres **row-level security** rather than in application code; Supabase is built around RLS and this is exactly what it is for. The static-generation pipeline reads only `publico` rows.

1. **Work vs. edition.** A Brazilian translation is a distinct *edition* of the same *work*. Ratings and reviews attach to the **work**; format, publisher, page count and cover attach to the **edition**. Hardcover's most-cited complaint is missing editions — for a pt-BR-first product this is the difference between working and not working. **Getting this wrong is the most expensive possible mistake.**
2. **`log_entries` is the atomic unit, not `book_ratings`.** Multiple dated entries per user per work gives re-reads, evolving opinion, and a real diary — and directly addresses the "one review per book is obsolete" complaint. Goodreads structurally cannot do this.
3. **Store both `review_html` (sanitised) and `review_text` (plain).** HTML for display, plain text for search indexing and OG descriptions.
4. **Migration mapping.** `livros.json.country` → `authors.country`; `original_language` → `works.original_language`; `publisher`/`pages`/`isbn`/`source` → `editions`; `read_in`/`rate`/`review` → `log_entries` (with `finished_at` as a year-precision date and a precision flag, since exact dates were never recorded). `series_name`/`series_number` need a `series` table or JSONB on `works`.

### 13.2 API

REST or RPC is sufficient; GraphQL is not warranted at this scale. Roughly: `/api/search`, `/api/works/{id}`, `/api/log-entries` (CRUD), `/api/shelves`, `/api/lists`, `/api/users/{handle}`, `/api/follows`, `/api/feed`, `/api/likes`. **Cursor pagination from day one** — offset pagination on a feed is a rewrite later.

### 13.3 Frontend

- **Framework decision required.** The current CDN-Vue setup cannot do SSR, and SSR is required for OG previews and SEO — which Section 9 identifies as a critical gap. Nuxt is the lowest-friction path from Vue 3 and preserves the existing component logic almost verbatim. **Recommendation: Nuxt, static-generated in Milestone 0, hybrid-rendered in Milestone 1.**
- **Routes:** `/`, `/livro/{slug}`, `/livro/{slug}/resenhas`, `/autor/{slug}`, `/genero/{slug}`, `/pais/{slug}`, `/ano/{ano}`, `/@{handle}`, `/@{handle}/diario`, `/@{handle}/listas`, `/lista/{id}`, `/busca`, `/feed`, `/estatisticas`.
- **Components to extract from the existing file:** `BookCard`, `BookGrid`, `StarRating`, `FilterBar`, `BookModal` → `BookPage`, `ReadingMap`, `StatBox`. All already exist as markup; they need extracting, not designing.
- **State:** Pinia once auth and shelves exist. Not before.
- **Design system:** promote the 7 `:root` tokens into a real token set (spacing, type scale, radii) and **deduplicate the GeoChart colours** (defect #11) so the theme has one source.

### 13.4 Search

Do not start with Elasticsearch. Postgres full-text (`tsvector` with the `portuguese` dictionary, plus `pg_trgm` for fuzzy title matching) covers the first several thousand users. **Portuguese stemming and accent-insensitive matching are requirements, not niceties** — "Ficção" must match "ficcao".

### 13.5 Catalog integration

- Open Library as primary (free, open-licensed, no key, bulk export). Google Books as fallback for gaps.
- **Cache aggressively.** Never call a third party in a user-facing search path — mirror into local `works`/`editions` on first reference.
- **Always append `?default=false` to cover URLs** so a miss is a 404 rather than a 200-with-blank-GIF (defect #1).
- **[Open question]** Open Library's coverage of Brazilian editions is unmeasured beyond covers (39/39 resolved here). This must be validated before committing to the pt-BR positioning — it is the largest single assumption in this report.

### 13.6 Background jobs

Catalog sync and enrichment; feed fan-out (start with fan-out-on-read — fan-out-on-write is premature below ~10k users); notification delivery; OG image generation; import processing (Goodreads CSV imports are slow and must be async); nightly stats aggregation.

### 13.7 Security

- **Sanitise all user HTML** (DOMPurify server-side or equivalent). The current `v-html` usage is safe only because there is exactly one trusted author. This is a **hard gate** on multi-user writes.
- Rate-limit writes and follows.
- Authorisation on every private object (private lists, draft reviews).
- Store `review_html` pre-sanitised so rendering is never the trust boundary.

### 13.8 Performance and scale

- Current: 105 KB for 86 books ≈ **1.2 KB/book**. At 10,000 books that is a 12 MB payload — the fetch-everything model breaks somewhere around 2,000.
- Needed: server-side pagination, cursor-based feeds, `work_id`/`user_id`/`created_at` indexes, a CDN in front of covers, and cached aggregate stats (do not recompute a year-in-review on request).
- Feed generation is the first real scaling problem. Read-time fan-out with caching is correct until the graph is large.

### 13.9 Third-party surface

Open Library, Google Books (fallback), an auth provider, object storage for avatars and OG images, an email provider, and an analytics sink. Everything except the catalog is commodity.

### 13.10 Zero-cost constraints (Revision 2)

The free-tier decision (§0.3) rules some otherwise-reasonable designs out. Worth stating explicitly so they are not accidentally reintroduced:

| Constraint | Consequence |
|---|---|
| Supabase built-in email: **2/hour, project team only** | **Google OAuth is the primary sign-in.** Do not design a magic-link onboarding flow. If email is wanted later, wire Resend's free tier as custom SMTP (raises the cap to 30/hour). |
| 5 GB egress | **Never proxy or self-host book covers.** Hotlink Open Library's CDN. This single rule is the difference between free and not. |
| 1 GB storage | Avatars as generated initials to start (`ui-avatars`, already in use). Real uploads later, if ever. |
| Free projects pause after 7 days idle; 10–30 s cold start | A free GitHub Actions weekly cron keeps it warm. Relevant during slow development months, not during active use. |
| 2 active projects max | Production plus one staging. Plan around it. |
| No always-on workers | Background jobs (§13.6) become **edge functions triggered on demand** plus a scheduled cron, not a persistent queue. At 30 users this is more than enough. Do not design a worker pool. |
| No managed analytics budget | Analytics is an `events` table in Postgres (§14). A few thousand rows a year. Query it with SQL. |

**Where paying a little would relieve pressure**, if the constraint is ever revisited: Supabase Pro (~US$25/mo) removes the pause, raises egress, and adds backups. **No backups on the free tier is the one genuinely uncomfortable part** — the mitigation is a scheduled `pg_dump` to a private GitHub repository, which is free and should be set up in Milestone 1, not later.

---

## 14. Analytics recommendations

Currently **zero instrumentation**. Ship analytics with the features, not after — retrofitting loses the only cohort that matters, and with ~30 friends the first cohort is the *entire* dataset.

**Implementation (Revision 2): an `events(id, user_id, name, props jsonb, created_at)` table in Postgres.** No third-party tool. At this volume it is a few thousand rows a year, it costs nothing, and SQL answers questions better than any dashboard would.

**The metric that actually decides this project:** *how many invited friends log three books in the first month.* Target roughly 5 of 30. Below that the feed is empty and no feature fixes it.

Keep the event set small and tie each event to a question. Note that `user_followed` and `list_followed` below are deferred along with follows themselves (§0.1), and three events are new: `invite_claimed`, `book_added_manually` and `visibility_changed`.

### Core events

| Event | Key properties | Product question it answers |
|---|---|---|
| `user_signed_up` | `source`, `referrer` | Which acquisition channels work? Does the review-page SEO bet pay off? |
| `book_searched` | `query`, `results_count`, `source` | **Is the catalog good enough?** A high zero-result rate is the Hardcover failure mode, detected early. |
| `book_opened` | `work_id`, `source` (search/feed/profile/list/map/external) | Which discovery surface actually drives book views? |
| `book_logged` | `work_id`, `rating`, `has_review`, `is_reread`, `days_since_signup` | **The core action.** Everything else is in service of this. |
| `review_submitted` | `work_id`, `char_count`, `has_spoilers` | Is the long-form review culture actually forming? Track median length over time — if it drifts toward 50 characters, the differentiation is gone. |
| `shelf_item_added` | `shelf`, `work_id`, `source` | Is want-to-read functioning as the return hook? |
| `reading_started` / `reading_completed` | `work_id`, `days_elapsed` | Do people use the in-progress state, or only log finished books? Determines whether progress tracking deserves any investment. |
| `user_followed` | `followee_id`, `source` (review/list/profile/feed) | **Which content type generates follows?** Directly tells you whether reviews or lists deserve more investment. |
| `review_liked` | `review_id`, `source` | Is the cheapest social primitive being used? |
| `list_created` | `list_id`, `item_count`, `visibility` | Are lists worth building further? |
| `list_followed` | `list_id` | *(deferred with follows)* Are lists a discovery surface or just personal organisation? |
| `invite_claimed` | `code`, `invited_by` | How many invites convert, and who actually brings people in? |
| `book_added_manually` | `title`, `after_failed_search` | **How bad is the Open Library pt-BR gap, really?** This is the measurement that retires or confirms the last big technical assumption. |
| `visibility_changed` | `object_type`, `from`, `to` | Is the two-level privacy model fighting the social loop? A high rate of switching to `privado` means a "só membros" tier deserves reconsideration (§0.2). |
| `share_clicked` | `object_type`, `object_id`, `destination` | Is the sharing bet — the whole Milestone 0 thesis — actually working? |
| `import_completed` | `source`, `books_imported`, `match_rate` | Does import solve cold start, and is the matcher good enough? |

### Derived metrics that matter more than the events

| Metric | Why |
|---|---|
| **Time to first log** | The activation funnel. If this exceeds one session, onboarding is broken. |
| **Books logged per active user per month** | The core loop's heartbeat. Expect ~1–2 for this audience — do not optimise for daily use; reading is not a daily-active behaviour and pretending otherwise leads to bad product decisions. |
| **Review rate** (logs with review ÷ total logs) | The differentiation metric. The existing single user sits at **65%**. If the platform average lands near 10%, the long-form positioning has failed. |
| **Search zero-result rate** | The catalog health metric, and the earliest warning of the known failure mode. |
| **Follows per active user** | Whether the social loop has ignited at all. |
| **D30 / D90 return rate** | Reading is slow; weekly retention is a meaningless metric here. |
| **Share-to-signup conversion** | Whether SEO and OG previews are actually an acquisition channel. |

### What not to instrument

Avoid vanity surfaces: page views without intent, scroll depth, session duration (long sessions may mean confusion), and DAU (the wrong cadence for a reading product — it will push the roadmap toward feed-refresh engagement patterns that do not fit the behaviour).

---

## 15. Open questions and assumptions

### Questions for the product owner — **answered (Revision 2)**

1. ~~Multi-user or better personal site?~~ → **Multi-user.**
2. ~~pt-BR-first or global?~~ → **pt-BR-first.**
3. ~~Who is the first cohort?~~ → **University friend group (graduação).** See §0.1 — this changed more priorities than the other five answers combined.
4. ~~Willingness to pay for hosting?~~ → **No. Zero-cost infrastructure**, free for users. Stack and gotchas in §0.3.
5. ~~Is moderation acceptable as an ongoing cost?~~ → **Resolved implicitly.** An invite-only, offline-acquainted cohort makes moderation a near-zero concern; `MOD-1` drops to P3.
6. ~~Seed the 86 books publicly or keep private?~~ → **Resolved by the privacy model.** The owner's profile defaults to público like everyone else's, with a per-object `privado` toggle. Seeding is recommended regardless: the first friend who signs up should not land in an empty room.

### Remaining questions

1. **What is the invite mechanism, concretely?** A single shared code in the WhatsApp group is simplest and probably sufficient. Per-person codes give you an attribution signal (who actually brings people in) for almost the same effort. Low stakes either way, but it should be decided before `AUTH-2` is built.
2. **Is there any appetite for the group's *existing* reading history?** If several friends are on Skoob, import moves from "nice activation aid" to "the thing that makes the site feel alive in week one". Worth asking the group before scheduling `GROW-1`.
3. **Does the owner want to be the only admin?** At 30 users, "admin" means a delete button and a database console. Fine — but someone should be able to remove content if a friendship goes sideways.

### Assumptions made in this report

| Assumption | Status after Revision 2 | Risk if wrong |
|---|---|---|
| The goal is a real multi-user platform | ✅ **Confirmed** (§0) | — |
| pt-BR is the target market | ✅ **Confirmed** (§0) | — |
| Zero-cost infrastructure is required | ✅ **Confirmed** (§0) | — |
| The repository owner is the primary-user archetype | ⚠️ **Partly confirmed.** The owner is one; the cohort is their friend group, most of whom will read and log less | Building for the 940-character reviewer when most of the group writes two sentences |
| Reading is a weekly-to-monthly behaviour, not daily | Still an assumption | 86 books over 13 years ≈ 6.6/year. If retention is measured on a daily or weekly cadence the roadmap drifts toward engagement patterns that do not fit reading |
| Open Library is sufficient as the catalog for pt-BR | ⚠️ **Risk substantially reduced, not eliminated.** A ~1,500-work cohort catalog plus a manual-add fallback makes gaps survivable rather than fatal (§0.1) | Some friction adding Brazilian editions; no longer existential |
| Long-form reviews are the differentiator | Still an assumption, and now the **main one to watch** | If the friend group writes one-liners, the product is an undifferentiated tracker. Measure via review rate (§14) — the owner's baseline is 65% |
| A ~30-person cohort will produce enough activity to feel alive | **New, and the biggest open risk** | If 5 of 30 log books, the feed is empty and the social loop never starts. This is an activation problem, not a feature problem |

### Explicitly unverified

- Open Library's **metadata** completeness for Brazilian editions (only covers were tested — 39/39 resolved).
- Whether the friend group actually wants this, or whether the owner is the only one who will log books. **This is the cheapest thing to test and the most valuable: ask the WhatsApp group before building Milestone 1.**
- How many of the group already use Skoob or Goodreads, which determines whether import is worth scheduling early.
- Skoob's current technical state beyond public complaint records.

---

## 16. Suggested roadmap

Sequenced by dependency and risk, not by calendar certainty.

### Now — Milestone 0 · "From private page to public profile" (~1–2 weeks, no backend)

Routing and per-object URLs · SSG + Open Graph · local search · stats/year-in-review page · render the five hidden metadata fields · defect fixes 1, 3–7 · genre normalisation · retire the CSV.

**Validates:** whether shareable review pages attract anyone at all — the cheapest possible test of the entire thesis.

### Before anything — the free test (one afternoon)

Ask the WhatsApp group: *"se eu fizer um Letterboxd de livros pra gente, vocês usariam?"* Count how many say yes and how many can name the last book they finished. **This costs nothing and is the single highest-information action available** — the biggest risk in §15 is not technical, it is that the cohort does not want this.

### Now — Milestone 0 · "From private page to public profile" (~1–2 weeks, no backend, zero cost)

Routing and per-object URLs · SSG + **Open Graph (for WhatsApp previews)** · local search · **statistics / year-in-review page (promoted to P0)** · render the five hidden metadata fields · defect fixes 1, 3–7 · genre normalisation · retire the CSV.

**Validates:** whether a link pasted into the group chat gets clicked. SEO deliberately dropped — Google is not the channel here.

### Next — Milestone 1 · "One reader becomes many" (~4–6 weeks, still zero cost)

Supabase free tier · **Google OAuth** (not magic links — see §0.3) · work/edition/log-entry schema with a `visibility` column · **invite codes** · **público/privado toggle, defaulting to público** · Open Library catalog + search + **manual-add fallback** · log a book · migrate the owner's 86 books · sanitisation · want-to-read · profile pages · analytics as a Postgres table.

**Validates:** whether a second person will log three books. *This is the real make-or-break gate.*

### Then — Milestone 2 · "A community forms" (~3–4 weeks)

**Global chronological feed** (not follow-based — see §0.1) · lists with público/privado · review likes · currently-reading · Goodreads/Skoob import · author/genre/country pages.

**Validates:** whether someone discovers a book through a friend and logs it.

**Gate removed:** moderation tooling no longer gates this milestone, because registration is invite-only and the cohort knows each other offline.

### Later — Milestone 3 · "Discovery and identity" (~6–8 weeks, and only if M2 works)

Asymmetric follows and a filtered feed (**only if the cohort grows past ~200**) · similar books (heuristic) · reading-the-world challenge · comments · spoiler controls · data export · PWA · notifications · SEO and sitemaps · report/block/mute and minimal admin tooling.

**Validates:** whether the product retains people between books.

### Not scheduled

ML recommendations (revisit above ~1,000 active raters); native mobile apps; collaborative lists; book clubs; audiobook/format taxonomy; achievements; trading/lending; author accounts; email and push notifications (email is constrained by the free tier anyway — §0.3).

### Decision gates between milestones

| Gate | Question | If the answer is no |
|---|---|---|
| Before M0 | Do at least ~8 friends say they would use it? | Build M0 anyway as a personal site — it is cheap and good on its own — but do not build M1 |
| After M0 | Does a link in the group chat get clicked and browsed? | The shareable-object thesis is wrong; rethink before spending 6 weeks on a backend |
| After M1 | Will 5+ friends each log 3 books in the first month? | Activation is broken. Fix onboarding, import and the add-book flow before building any social surface |
| After M2 | Does anyone discover a book via a friend and log it? | The social loop is not closing. More features will not fix it — investigate why the feed is not interesting |
| After M3 | Is the review rate above ~30%? | The long-form differentiation has failed; the product is a tracker, and that is a different (smaller) thing |

---

## Appendix — verification log

| Check | Method | Result |
|---|---|---|
| Project runs | `python -m http.server 8765`, browser | ✅ No console errors |
| `file://` fails | Code read (`fetch` + CORS) | Confirmed constraint |
| Record counts | JSON vs CSV title-set diff | 86 vs 83; 3 books missing from CSV |
| Field fill rates | Programmatic census | Table in §2.4 |
| Review corpus | Length + tag census | 56 reviews, median 940 chars, only `<br>` tags (178) |
| Cover pipeline | Direct HTTP to Open Library for all 39 dependent ISBNs | 39/39 resolve |
| Cover fallback break | `9780000000000` with and without `?default=false` | 200 + 43 bytes vs 404 — confirmed |
| Empty state | Forced `filterGenre='Teatro'` + `filterDecade='1600'` | 0 cards, blank void, "0 Páginas Lidas" |
| Escape closes modal | Keypress with modal open | ❌ overlay count stayed 1 |
| Country select bug | Live inspection of select values | ❌ renders blank on load |
| Map | Clicked "Países" stat | ✅ GeoChart renders, click-to-filter works |
| Lazy covers | Screenshot at 800×455 vs 1280×900 | Initial blank grid was lazy-load timing, not breakage |
| Genre drift | Data census vs `generos.txt` | 26 labels in data vs ~15 in the taxonomy, largely non-matching |

---

## Sources

- [Letterboxd](https://letterboxd.com/) · [Letterboxd FAQ](https://letterboxd.com/about/faq/) · [Letterboxd — Wikipedia](https://en.wikipedia.org/wiki/Letterboxd)
- [The StoryGraph — Wikipedia](https://en.wikipedia.org/wiki/The_StoryGraph)
- [StoryGraph vs Goodreads: An Honest Comparison (2026) — Achriom](https://www.achriom.com/blog/storygraph-vs-goodreads/)
- [Best Goodreads Alternatives in 2026 — Achriom](https://www.achriom.com/blog/best-goodreads-alternatives/)
- [Hardcover vs StoryGraph 2026 — Bookwise](https://bookwiseapp.com/blog/hardcover-vs-storygraph)
- [Show HN: Hardcover – Letterboxd for Books — Hacker News](https://news.ycombinator.com/item?id=37744905)
- [Why Letterboxd could do what Goodreads couldn't — Medium](https://medium.com/@muchtoado/why-letterboxd-and-not-goodreads-7a685a7a0949)
- [The Letterboxd-style app for books — Literal](https://literal.club/letterboxd-for-books)
- [Letterboxd for Books? The 4 Best Trackers in 2026 — Clarify](https://clarify.wiki/en/letterboxd-for-books/)
- [Skoob — Wikipedia](https://en.wikipedia.org/wiki/Skoob)
- [Skoob: a maior rede social de leitores do Brasil — Compara Plano](https://comparaplano.com.br/skoob/)
- [Sistema de trocas do Skoob "pausado" — Reclame Aqui](https://www.reclameaqui.com.br/skoob1/sistema-de-trocas-do-skoob-pausado-e-falta-de-comunicacao-com-usuarios_P-6Alyl3ibJDwph0/)
- [Skoob: uma rede social para leitores — Portal Assobiar](https://portalassobiar.com.br/colunistas/skoob-uma-rede-social-para-leitores/)
- [Open Library — APIs](https://openlibrary.org/developers/api)
- [7 Best Books APIs in 2026 — API.market](https://api.market/blog/skycraft/books-api/best-books-api)
