# Open questions

Unresolved decisions and unverified assumptions. Nothing important is hidden here — if a decision was made on thin evidence, it is listed.

**Blocking** = do not start implementation until answered.

**As of 2026-09-19 nothing here blocks implementation.** Q2 is resolved, Q1's risk is explicitly accepted with a mitigation tied to [tasks/023](tasks/023-deploy-to-vercel.md), and Q3–Q6 are closed or harmless. Q1 remains listed as blocking because that is what it *was*; the decision to override it is recorded, not erased.

---

## Blocking

### Q1 — Does the friend group actually want this? [RISK ACCEPTED — 2026-09-19]

**Why it matters.** The largest risk in the entire plan is not technical. Roughly four weeks of work is predicated on ~30 people wanting a reading app. If five of them log books and twenty-five do not, the product is empty and no feature fixes it — the feed has nothing in it, and the loop never closes.

**Options**
1. **Ask the group directly before writing any code.** Count how many say yes and how many can name the last book they finished. *(Recommended — costs one afternoon)*
2. Build Milestone 0 (the static site, improved) first and share it as a probe.
3. Build the full MVP on faith.

**Recommendation:** option 1, with option 2 as the fallback. If fewer than ~8 say yes, build the static site well and stop — a great personal reading diary is a legitimate destination, and the work is not wasted.

**Consequence if skipped:** a ghost town, discovered after four weeks instead of after one afternoon.

**Decision (2026-09-19):** the owner chose to proceed without the survey. Implementation continues; the risk is accepted, not resolved. Mitigation: ask the group — in the same message as Q3 — before [tasks/023](tasks/023-deploy-to-vercel.md) invites anyone in. Up to that point the work has standalone value as a personal reading diary, which is the documented fallback.

---

### Q2 — What is the owner's email, handle and display name? [RESOLVED]

**Defined:**
- **Email (`OWNER_EMAIL`):** `diogo.tallys16@gmail.com`
- **Name (`OWNER_NAME`):** `Diogo Amorim`
- **Handle (`OWNER_HANDLE`):** `dtma23` (minúsculo para atender à restrição `^[a-z0-9_]{3,20}$`, gerando a URL `/@dtma23`)

**Status:** Pronto para consumo na TASK-019.

---

## Non-blocking — decide during implementation

### Q3 — Does anyone in the group already use Skoob or Goodreads? [PENDING — ask with Q1]

**Why it matters.** Import is currently cut to post-MVP on the grounds that it is a week of work built on an unverified assumption. If several friends already have years of history elsewhere, import moves from "nice activation aid" to "the thing that makes the site feel alive in week one".

**Recommendation:** ask in the same message as Q1. If three or more say yes, promote import ahead of the map and the recent-entries strip.

**Status (2026-09-19):** unanswered, and it blocks nothing before launch. Import is post-MVP either way; the answer only reorders the backlog.

---

### Q4 — Custom domain, or `.vercel.app`? [RESOLVED — 2026-09-19]

**Why it matters.** The only line item in the entire plan that costs money (~R$40/year). It also affects how the link looks in a group chat, which is the distribution channel.

**Recommendation:** launch on `.vercel.app`. Buy a domain if the thing survives a month. Vercel makes the switch trivial and preserves the deployment.

**Decision (2026-09-19):** launch on `.vercel.app`. `BETTER_AUTH_URL` ([tasks/007](tasks/007-auth-email-otp.md)) and the production origin ([tasks/023](tasks/023-deploy-to-vercel.md)) use the Vercel domain. Revisit after a month of real use.

---

### Q5 — Is a light theme wanted? [RESOLVED — 2026-09-19]

The existing app is dark-only and that is a deliberate aesthetic. **Recommendation:** dark only. Revisit if anyone asks.

**Decision (2026-09-19):** dark only. [tasks/005](tasks/005-port-design-tokens-and-components.md) ports one set of tokens and adds no theme switch. Nothing in the decision forecloses a light theme later — the tokens already live on `:root`.

---

### Q6 — Keep the Google Charts GeoChart map, or replace it with a static SVG? [RESOLVED — 2026-09-19]

**Why it matters.** The map is the most distinctive screen in the existing app, and it is also the only piece of the frontend that is not SSR-safe: a third-party CDN script (`index.html:12`) driven by direct DOM manipulation (`index.html:336`).

**Options**
1. Keep GeoChart inside `<ClientOnly>` with a lazy loader — fastest port, but a blocking third-party script and no SSR.
2. Replace with a static SVG world map coloured from the same data — no third party, SSR-safe, renders in the OG preview, and drops a CDN dependency. Maybe a day of work.

**Recommendation:** option 2, but it is a "should have", so option 1 is acceptable if time is short.

**Decision (2026-09-19):** option 2 — a static SVG. It drops the last third-party CDN script, is SSR-safe, and renders in the OG preview, which matters because WhatsApp is the distribution channel. [tasks/025](tasks/025-reading-map.md) stays optional; if it is cut, no map ships — option 1 is not the fallback.

---

## Unverified assumptions

Listed plainly so nobody treats them as established.

| Assumption | Basis | Risk if wrong |
|---|---|---|
| The group will write **long** reviews | The owner's own 65% review rate at a 940-char median | If everyone writes one-liners, this is an undifferentiated tracker. Measurable from week one |
| Reading is a weekly-to-monthly behaviour | 86 books over 13 years ≈ 6.6/year, recently 12–16 | Retention targets and the whole analytics frame are miscalibrated |
| A community-built catalog beats Open Library here | Measured: 40% coverage, 8.4 s latency | If manual add has too much friction, logging fails at the first step. **`search_misses` is the instrument** |
| ~1,500 works makes `ILIKE` fast enough | Arithmetic, not measurement | Trivially fixable with a `tsvector` column |
| A password is acceptable friction, and less than a code per sign-in | Google OAuth verifiably fails in WhatsApp's WebView; a per-sign-in code forces an app switch out of that same WebView | If members forget passwords faster than the reset flow absorbs, the fallback is the *previous* design — OTP as a second sign-in option beside the password, not instead of it. Measurable from the reset-request count |
| Vercel Hobby's non-commercial terms cover this | Free, ad-free, 30 friends | **If it is ever monetised, Vercel Pro is mandatory.** Not a grey area |
| Neon free compute suffices | 100 CU-h vs an estimated 10–20 | Visible in the dashboard long before it bites |
| `publico` as the default will not be widely overridden | Inference | If many entries go `privado`, the two-level model is fighting the social loop and a "só membros" tier deserves reconsideration |

---

## Deliberately deferred decisions

Decisions we are **choosing not to make yet**, because making them now would be speculative.

| Decision | Revisit when |
|---|---|
| Whether follows are needed | The cohort passes ~200 |
| Whether a paginated feed is needed | The recent-entries strip stops being enough |
| Whether Postgres FTS is needed | `works` passes ~50k rows, or search exceeds 100 ms |
| Whether to cache public pages (ISR) | Monthly invocations pass ~200k, or p95 TTFB exceeds 800 ms |
| Whether Google Books is a better enrichment source than Open Library | After three months of `search_misses` data |
| Whether a merge UI for duplicate works is needed | ~50 duplicates accumulate |
| Whether Sentry is needed | Reading Vercel logs by hand stops working |
| Whether want-to-read should exist | Friends ask for it, or logging rates plateau |
| Whether a moderation surface is needed | **The day public registration is considered. Hard gate — moderation ships first** |

---

## Where these documents overturn the discovery phase

The discovery documents are historical context. Four of their recommendations were reversed, each by evidence:

| Discovery said | We do | Evidence |
|---|---|---|
| Supabase | **Neon** | Supabase free pauses after 7 days and needs a *manual dashboard restore*; Neon resumes automatically in <1 s |
| Google OAuth as primary sign-in | **Password (`handle` or email), with email OTP for activation and reset** | Google returns `403 disallowed_useragent` in WhatsApp's Android WebView — it breaks in the distribution channel. OTP-per-sign-in replaced it, then was itself narrowed: it forced an app switch out of that WebView on every session expiry, and put Gmail delivery on the critical path of every sign-in |
| RLS enforces visibility | **Server-side helper** | RLS is mandatory when a browser talks to PostgREST. Nothing does here; it would be a second authorization model for zero added safety |
| Open Library as the catalog, with manual add as a fallback | **Community catalog; Open Library as optional enrichment** | 40% coverage of Brazilian editions, 8.4 s average search latency |

Two further reversals are product-side, from the scope pass: statistics/year-in-review drops from P0 to post-MVP (at launch only the owner has enough data to generate one), and the Work/Edition split is *kept* — against the scope proposal to collapse it — because pt-BR translations as distinct editions is the product's stated premise, and a nullable `edition_id` makes the split cost almost nothing.
