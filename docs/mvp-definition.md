# MVP definition

What ships in v1, what does not, and how we know it is done.

---

## 1. The core loop

> A friend taps a link in the WhatsApp group, lands on a server-rendered review that previews properly, signs in with a code sent to their email, finds the book they just finished — or adds it by hand in under a minute — logs it with a half-star rating and a paragraph in Portuguese, and pastes their own profile back into the chat, where someone else reads it and logs their own.

Everything in the MVP serves one step of that sentence. Anything that does not, is not in the MVP.

**Primary user:** the owner's ~30-person university friend group. Brazilian, Portuguese-speaking, reached through a WhatsApp group.

**Job to be done:** *keep a record of my reading that I'm proud enough to show people.* Not *manage a to-read pile* — that is Goodreads' job-to-be-done and it is a worse one, because a pile is private and a record is social.

**Activation moment:** the third logged entry with at least one written review. That is when a profile becomes worth pasting into the chat.

**The metric that decides the project:** how many invited friends log three books in the first month. Target ≈ 5 of 30. Below that the product is empty and no feature fixes it.

---

## 2. Must have

Each item below breaks the loop if absent.

| # | Feature | Why the loop breaks without it |
|---|---|---|
| 1 | **Password sign-in (`handle` or email), activation gated by an allowlist and a one-time email code** | No identity, no author, no profile, nothing attributable. Google OAuth cannot be used: it returns `403 disallowed_useragent` inside WhatsApp's Android WebView — it fails in the exact channel. A one-time code per sign-in also failed there, more quietly: it forces an app switch out of the WebView every time a session expires |
| 2 | **Schema: `users`, `works`, `editions`, `authors`, `genres`, `reading_logs`** | The only thing genuinely expensive to change later. `reading_logs` as the atomic unit gives dated entries and re-reads for free |
| 3 | **Local catalog search + prominent manual add** | The first action of every new user is "log the book I just finished". Open Library holds only 40% of Brazilian editions and averages 8.4 s, so it cannot serve this. Manual add is a primary path |
| 4 | **Log a book: date, half-star rating, optional plain-text review; editable, deletable** | The core creative act, and the only content-generating feature. Everything else is a view over its output |
| 5 | **Reviews are plain text** | `v-html` on user content is stored XSS the moment a second person can write. Plain text removes the vulnerability class instead of mitigating it |
| 6 | **SSR + Open Graph on `/`, `/@handle`, `/livro/{slug}`, `/entrada/{id}`** | WhatsApp is the entire distribution channel. A bare URL is scrolled past; a cover with a rating and a line of prose is tapped |
| 7 | **Profile at `/@handle`** — poster grid, filters, stat counters | For a diary product the profile *is* the product, and it is the specific object pasted into the chat |
| 8 | **Público / privado on profiles and entries, defaulting to público** | Owner requirement. The default matters more than the feature |
| 9 | **Migrate the 86 books and 56 reviews** | At launch this is the only content that exists. The first friend must not land in an empty room |
| 10 | **Zero-cost infrastructure that stays up** | A hard constraint. Neon over Supabase specifically because a database that pauses after a quiet week is the wrong shape for a friend group |
| 11 | **A tested backup** | 13 years of irreplaceable history on a free tier with no automated backups |

---

## 3. Should have

Ships if the must-haves land early. Nothing here blocks launch.

| Feature | Why it is not a must |
|---|---|
| Ten most recent público entries on the signed-in home | One query, no pagination. The 10× simpler replacement for a feed — but WhatsApp is already the feed |
| The country map on the profile | The most distinctive screen and mostly already written, but it is decoration on the loop, not part of it |
| `search_misses` instrumentation | Tests the biggest product assumption. Cheap, and worth having from day one |
| Accessibility pass | The grid is currently unusable with a screen reader. Correctness, not a feature |
| pt-BR polish: `Intl.DisplayNames` country names, empty states | The modal currently shows "United Kingdom" inside a Portuguese interface |
| Profile bio | One column, one input. A two-book profile looks abandoned; a line of text makes it look intentional |

---

## 4. Post-MVP, with reasons

Cut deliberately. Each would be defensible at a different scale; none is defensible at 30 users on day one.

| Feature | Why deferred |
|---|---|
| **Statistics / year-in-review** | The discovery doc makes this P0 on the claim that "meu ano em livros" is the growth loop. At launch only the *owner* can generate that artifact — everyone else has 0–3 books. It becomes powerful in December, with a year of data. Building it in September serves one user |
| **Activity feed (paginated)** | The WhatsApp group *is* a real-time activity stream with push notifications and 100% cohort adoption. A ten-row strip captures what remains |
| **Want-to-read** | The most aggressive cut; the discovery doc calls it "essential". It is content-consuming, produces nothing others can read, and its value is proportional to catalog size — which starts near zero |
| **Follows and a filtered feed** | At 30 users a follow graph filters a feed that does not need filtering. Pure friction. Revisit past ~200 users |
| **Likes** | One table, one button — genuinely cheap. But a visible count of "0" beside a 940-character review is actively discouraging at this size, and a reply in the group chat is a warmer version of the same signal |
| **Lists** | High leverage at Letterboxd scale. Here they compete with reviews for the same scarce typing effort, and the review is the atomic unit |
| **Author / genre / country / year browse pages** | Justified by SEO and "more like this". SEO is explicitly not the channel, and an author page showing one book is worse than no author page |
| **Goodreads / Skoob import** | A week of work (CSV parsing, fuzzy matching, async processing, an unmatched-row UI) built on an unverified assumption. **Ask the group first** — if several already use Skoob, this jumps in priority |
| **Notifications** | With likes, comments and follows cut, there is nothing to notify anyone about |
| **Comments, report, block, admin UI** | These exist to handle strangers. Registration is invite-only and everyone knows each other offline. **Hard gate: if public registration ever opens, moderation ships first** |
| **Postgres FTS, `pg_trgm`** | At ~1,500 rows `ILIKE` is a sub-millisecond scan. Dictionary config and GIN indexes are engineering for a corpus 30× larger |
| **Series navigation, re-read UI, spoiler marking, data export, PWA, SEO/sitemaps, recommendations, native apps, reading progress** | Each fails "at 30 users, does this do anything?" |

**Re-reads are supported by the schema from day one** (no `UNIQUE (user_id, work_id)`) even though there is no dedicated UI. The constraint is what would be expensive; its absence is free.

---

## 5. Non-functional requirements

### Security — all blocking

- No `v-html` anywhere; ESLint enforces it
- The four visibility integration tests pass
- A `privado` entry returns **404**, not 403, to a second user
- Rating validation rejects `3.7` and `6` server-side
- Activation and reset code requests for non-allowlisted addresses are indistinguishable from allowlisted ones
- A sign-in with an unknown identifier and one with a wrong password are indistinguishable
- Passwords are scrypt-hashed by better-auth; no password, hash or code reaches a log
- No secret in the client bundle (verified by grepping the build output)
- CSP present; session cookie httpOnly + Secure + SameSite=Lax

### Performance — p95 from São Paulo

| | Target |
|---|---|
| `/entrada/{id}` TTFB | < 800 ms — the WhatsApp path, the one that matters |
| `/@handle` TTFB | < 1,000 ms |
| `/api/search` | < 150 ms |
| `/api/search/externo` | < 2,000 ms (hard timeout, degrades to empty) |
| Largest Contentful Paint on a phone over 4G | < 2.5 s |

### Accessibility

- Every cover has meaningful `alt`
- Cards are keyboard-reachable `<a>` elements, not `<div @click>`
- Modals: focus trap, Escape, focus restored, `<button>` close controls
- Visible focus rings; AA contrast maintained

### Reliability

- Open Library down → the product works, degraded to local + manual
- Gmail SMTP down → **sign-in still works**; only first-access activation and password reset fail. Existing sessions (30 days) are untouched
- Neon cold resume < 1 s
- A restore from `pg_dump` has been performed successfully at least once

---

## 6. Content requirements

- All 86 books, 85 ratings, 56 reviews migrated with no loss
- Reviews render with paragraph breaks intact and **contain no `<`**
- The owner's profile is `publico` and complete (handle, display name, bio)
- The 26 genres are seeded and `generos.txt` regenerated to match
- `livros_lidos_atualizado.csv` is deleted
- `livros.json` is preserved in `legacy/` as the source of record

---

## 7. Quality bar

- `npm run typecheck` passes with zero errors, `strict: true`
- `npm run lint` passes, including the `v-html` and `no-restricted-imports` rules
- `npm run test` passes: the four visibility tests, rating validation, ISBN normalisation, and the migration against the real 86 rows

**Acceptable at launch:** cosmetic issues, missing empty states on secondary screens, catalog duplicates, imperfect Open Library matching, no admin UI.

**Not acceptable at launch:** any data loss on migration, any visibility leak, any XSS vector, a sign-in that cannot complete on an Android phone, a broken WhatsApp preview on `/entrada/{id}`, an untested backup.

---

## 8. Launch checklist

**Before writing code**
- [ ] Ask the WhatsApp group whether they would use it. Count yes-answers and how many can name their last finished book. **Fewer than ~8 → build the static site well and stop**
- [ ] Resolve the two blocking items in [open-questions.md](open-questions.md)

**Before inviting anyone**
- [ ] All §5 security items verified
- [ ] Migration run and all §7 validations in [migration.md](migration.md) passed
- [ ] `pg_dump` restored once into a scratch branch, successfully
- [ ] Sign-in completed end-to-end **on a real Android phone, from inside WhatsApp's in-app browser**
- [ ] A real link pasted into a real WhatsApp chat previews with cover, title and review snippet — on Android *and* iOS
- [ ] Logging a book completed end-to-end by someone who is not the owner
- [ ] Manual add completed for a book Open Library does not have
- [ ] Preview deployments confirmed to point at a Neon branch, not production
- [ ] `regions: ["gru1"]` confirmed in the deployed config

**First week live**
- [ ] Invite 5 friends, not 30. Watch where they get stuck
- [ ] Read `search_misses` daily
- [ ] Fix the first blocker before the second wave

**Definition of done:** a friend who has never seen the site can go from a WhatsApp link to their own logged book, and paste their own profile back into the chat, without the owner touching a database at any point.
