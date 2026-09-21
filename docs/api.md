# API / server architecture

Nuxt server routes under `server/api/**`. No separate service, no versioning prefix, no GraphQL. Routes are thin: validate → authorize → call a service in `server/services/` → shape the response.

Public pages fetch nothing from these endpoints — they are server-rendered directly from services. The endpoints exist for the authenticated app and for progressive interactions (search-as-you-type).

---

## 1. Conventions

**Validation.** Every request body and query string is parsed with a Zod schema at the top of the handler. A parse failure returns `400` with `{ error: 'validacao', fields: {...} }`. No handler reads `body.x` before parsing.

**Errors.** Uniform shape:

```json
{ "error": "codigo_do_erro", "message": "Mensagem em português." }
```

| Status | `error` | When |
|---|---|---|
| 400 | `validacao` | Zod rejected the input |
| 401 | `nao_autenticado` | No valid session |
| 403 | `sem_permissao` | Authenticated but not the owner |
| 404 | `nao_encontrado` | Missing, **or** present but not visible to this viewer |
| 409 | `conflito` | Handle taken, duplicate ISBN |
| 429 | `muitas_tentativas` | Rate limit |
| 500 | `erro_interno` | Everything else |

**403 vs 404.** A resource that exists but is `privado` returns **404**, never 403. A 403 confirms existence and leaks that a specific entry exists.

**Never leak internals.** `500` responses carry a fixed message. The real error is logged server-side with a correlation id.

**Mutations are POST/PATCH/DELETE and require a session.** There are no authenticated GETs that mutate.

---

## 2. Authentication

better-auth mounts its own handler. We do not hand-write sign-in, password hashing or session issuance.

```
ALL  /api/auth/**          → better-auth handler (password + email OTP)
```

The daily credential is a **password**; the six-digit email code is kept for first-access activation and for password reset only. Reasoning in [architecture.md](architecture.md) §3.5.

**`/api/auth/**` denies by default.** better-auth's plugins register more routes than this product uses, several of which send email with no rate limit and no allowlist check. An explicit path allowlist answers `404` to everything not in the table below. Adding one exception per plugin route is the wrong shape — the next upgrade reopens the hole.

### 2.1 The flows

| Flow | Route | Behaviour |
|---|---|---|
| **Activation — request code** | `POST /api/auth/email-otp/send-verification-otp` `{ email }` | Rate limit, then **check `allowed_emails`**. Not allowlisted, unknown, *or already activated* → `200` with a generic body and nothing sent |
| **Activation — complete** | `POST /api/auth/sign-in/email-otp` `{ email, otp }`, then `POST /api/auth/set-password` `{ newPassword }` | The code issues the session; the session sets the first password. Two better-auth routes behind one screen |
| **Sign-in (the daily path)** | `POST /api/auth/sign-in/email` `{ email, password }` | Fronted by a resolver that turns a `handle` into its email before delegating. The client sends one `identificador` field |
| **Reset — request code** | `POST /api/auth/forget-password/email-otp` `{ email }` | Previously 404'd by the deny list; now opened, behind the same rate limit and the same generic response |
| **Reset — complete** | `POST /api/auth/email-otp/reset-password` `{ email, otp, password }` | Sets the new password and revokes the user's other sessions |
| **Change password** | `POST /api/auth/change-password` `{ currentPassword, newPassword, revokeOtherSessions: true }` | Session required. The current password is mandatory |
| **Session / sign out** | `GET /api/auth/get-session`, `POST /api/auth/sign-out` | Unchanged |

`request-email-change` stays denied. Nothing in the MVP changes an email address.

**First sign-in.** A verified identity with no `users` row is redirected to `/app/bem-vindo` to choose a handle and display name — unchanged.

### 2.2 Failure shapes

| Case | Status | Body |
|---|---|---|
| Unknown identifier **or** wrong password | `400` | `{ error: 'validacao', message: 'E-mail, usuário ou senha incorretos.' }` — **one message for both cases** |
| Invalid or expired code | `400` | `{ error: 'validacao', message: 'Código inválido ou expirado.' }` |
| The new password fails the rules | `400` | `{ error: 'validacao' }` naming the rule, in pt-BR. This one *is* safe to be specific about: it describes the submitted input, not the account |
| Any rate limit | `429` | `{ error: 'muitas_tentativas' }` |

**Account enumeration.** Requesting a code for an address that is not on the allowlist must return the same status, body and approximate timing as one that is. Whether an address is invited — and whether it has already activated — is not public information. The same rule binds sign-in: the not-found branch verifies against a dummy hash instead of returning early, so a nonexistent handle is not measurably faster than a wrong password.

**Rate limiting.** A Postgres table, no Redis. 10 sign-in attempts per identifier per hour and 30 per IP per hour; 5 code requests per email per hour and 20 per IP per hour. Exceeding any of them returns `429`. Full table in [security.md](security.md) §8.

**Sessions.** better-auth database sessions, httpOnly + Secure + SameSite=Lax cookie, 30-day expiry with rolling refresh. Database-backed rather than a sealed stateless cookie specifically so a session can be revoked server-side — which is also what makes "sign out everywhere else" implementable on a password change.

---

## 3. The authorization helper

The single most important piece of server code. Every read of `reading_logs` goes through it.

```ts
// server/utils/visibility.ts
export type Viewer = { id: string } | null   // never optional — callers must pass null explicitly

export function visibleLogs(viewer: Viewer) {
  return viewer
    ? or(
        eq(readingLogs.userId, viewer.id),
        and(eq(readingLogs.visibility, 'publico'), eq(users.profileVisibility, 'publico')),
      )
    : and(eq(readingLogs.visibility, 'publico'), eq(users.profileVisibility, 'publico'))
}
```

Rules that make it hold:

1. `Viewer` is **not optional**. `visibleLogs()` with no argument is a type error, so "I forgot the viewer" cannot compile.
2. An ESLint `no-restricted-imports` rule forbids importing the raw `db` handle anywhere outside `server/services/**`.
3. Route handlers never build `where` clauses. Services do.
4. Integration tests assert: owner sees own `privado`; a second user does not; an anonymous viewer does not; and a `publico` log on a `privado` profile is invisible to both.

---

## 4. Endpoints

### Users

| Method | Route | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/users/me` | session | Read current session user profile (or null if unprofiled) |
| `POST` | `/api/users` | session, no profile yet | Create the profile row after first sign-in |
| `GET` | `/api/users/:handle` | optional | Public profile + visible logs |
| `PATCH` | `/api/users/me` | session | Update `display_name`, `bio`, `profile_visibility` |

**`GET /api/users/me`**

- Returns `200` with user profile object (`id`, `email`, `handle`, `display_name`, `bio`, `profile_visibility`) for an authenticated user with an existing `users` row.
- Returns `200` with `null` when a valid authenticated session exists but the profile has not been created yet.
- Returns `401` when unauthenticated.

**`POST /api/users`**

```ts
{ handle: string, display_name: string }   // handle: /^[a-z0-9_]{3,20}$/
```

- Rejects reserved handles: `livro`, `entrada`, `app`, `api`, `entrar`, `admin`, `sobre`, `me`, `sair`.
- On collision returns `409` **with up to three suggestions** (`joao2`, `joao_silva`, `joaos`).
- Accented input is transliterated client-side and shown to the user before submit (`João` → `joao`), never silently.
- Idempotent: a second call by a user who already has a profile returns `409`.

**Security:** this endpoint is the real registration gate. A better-auth identity exists the moment the activation code verifies, *before* any profile is created — so the gate is that **no `users` row means every service query returns nothing**. Verify allowlist membership here as well as at code-request time.

### Search

| Method | Route | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/search?q=` | optional | Local catalog search |
| `GET` | `/api/search/externo?q=` | **session** | Open Library lookup, explicitly invoked |

**`GET /api/search?q=dostoievski`**

- `q` trimmed, 2–100 chars. Shorter returns `{ works: [] }` with `200`, not an error.
- Matches `works.search_text ILIKE '%' || f_unaccent(lower(:q)) || '%'` **or** the same over `authors.name`.
- Returns at most 20, ordered by exact-prefix first, then by how many logs the work has.
- Each result carries `{ id, slug, title, authors[], first_published_year, cover_url, log_count }`.
- **Zero results inserts one `search_misses` row**, fire-and-forget, never blocking the response.

**`GET /api/search/externo?q=` — deliberately separate, and session-gated.**

Open Library averages **8.4 s** and times out outright (measured, [book-catalog.md](book-catalog.md)). It must never sit in the local search path.

- Hard **2-second** `AbortController` timeout. On timeout or non-200, return `{ results: [], indisponivel: true }` with status `200`. A slow Open Library degrades to "não achamos nada online", never to an error page.
- Session-gated so anonymous traffic cannot use us as a proxy to hammer a free public API.
- Rate limited to 20/user/hour.

### Books (works and editions)

| Method | Route | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/works/:slug` | optional | Work + visible logs for it |
| `POST` | `/api/works` | session | Create a work manually (the primary add path) |
| `POST` | `/api/works/:id/editions` | session | Attach an edition |

**`POST /api/works`** — the manual-add path, used roughly 60% of the time.

```ts
{
  title: string,                 // 1..300
  authors: string[],             // 1..5 names; matched to existing authors by slug, else created
  first_published_year?: number, // -3000..2100  ← signed, the corpus has -500
  original_language?: string,    // ISO 639-1
  genre_ids?: number[],          // 0..4, must exist in `genres`
  series_name?: string,
  series_number?: string,        // TEXT: '1-2' and '0.1' are real values
  ol_work_key?: string,
  edition?: { isbn13?, publisher?, page_count?, published_year?, cover_url?, ol_cover_id? }
}
```

- Slug generated from title + first author, deduplicated with a numeric suffix.
- Before inserting, look for a probable duplicate: same `f_unaccent(lower(title))` **and** an overlapping author. If found, return `409` with the existing work so the UI can offer "é este?" — **but always allow forcing creation** with `?forcar=1`. A false duplicate block is worse than a duplicate row, because it dead-ends the activation path.
- ISBN normalised to ISBN-13 before the uniqueness check (22 of 86 corpus ISBNs are ISBN-10).
- Catalog rows are shared and carry no visibility. Anyone may create; nobody may delete.

### Reading logs — the core

| Method | Route | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/logs` | session | Log a book |
| `GET` | `/api/logs/:id` | optional | One entry (the permalink) |
| `PATCH` | `/api/logs/:id` | session + owner | Edit |
| `DELETE` | `/api/logs/:id` | session + owner | Delete |
| `GET` | `/api/logs?handle=&limit=&cursor=` | optional | List, filtered by visibility |

**`POST /api/logs`**

```ts
{
  work_id: string,
  edition_id?: string,
  rating?: number,          // 0.5..5.0, step 0.5 — validated server-side, not only in the UI
  review?: string,          // 0..10000 chars, PLAIN TEXT
  started_on?: string,      // YYYY-MM-DD
  finished_on?: string,
  finished_precision?: 'dia' | 'mes' | 'ano',   // default 'dia'
  format?: 'fisico' | 'ebook' | 'audio',
  visibility?: 'publico' | 'privado'            // default 'publico'
}
```

Validation that must live on the server, not just the form:

- `rating`: `z.number().min(0.5).max(5).refine(r => r * 2 === Math.trunc(r * 2))`. A client posting `3.7` gets `400`.
- `review`: **plain text.** Any `<` or `>` is stored literally and rendered escaped. No sanitiser, no allowlist, no HTML parsing — see [security.md](security.md) §2.
- `finished_on` must not be in the future (`America/Sao_Paulo`).
- `edition_id`, if present, must belong to `work_id`.
- No uniqueness check against existing logs. Re-reads are the point.

**Timezone.** The server runs in UTC; the cohort is UTC−3. A default `finished_on` computed from the server's "today" records tomorrow's date for anything logged after 21:00 local — which is exactly when people log books. **The date default is computed client-side from the browser's local date**, and the server validates against `America/Sao_Paulo`.

**`GET /api/logs/:id`** returns `404` for a `privado` entry belonging to someone else — never 403.

### Home

| Method | Route | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/feed/recentes?limit=10` | optional | The 10 most recent visible entries |

`ORDER BY created_at DESC LIMIT 10`. No cursor, no pagination, no tab, no infinite scroll. WhatsApp is already the feed with better notifications; this strip exists so the signed-in home is not empty.

---

## 5. What is deliberately absent

No endpoints for follows, likes, lists, want-to-read, notifications, comments, statistics, import, export, or author/genre/country browse. Each is a deferred product feature ([mvp-definition.md](mvp-definition.md) §3), and building the API before the feature is the definition of speculative work.

No `/api/v1` prefix — there are no external consumers to version against. No OpenAPI spec — the consumer is the same repository, typed by the same TypeScript.

---

## 6. Performance targets

Measured at p95, from São Paulo, against a warm Neon compute.

| Operation | Target | Note |
|---|---|---|
| `GET /api/search` | < 150 ms | `ILIKE` over ~1,500 rows is a sub-ms scan; the budget is network |
| `GET /api/search/externo` | < 2,000 ms | Hard timeout, degrades to empty |
| `POST /api/logs` | < 300 ms | |
| SSR `/entrada/{id}` TTFB | < 800 ms | The WhatsApp-preview path. The one that matters most |
| SSR `/@{handle}` TTFB | < 1,000 ms | Grid of up to ~200 entries |
| Neon cold resume | < 1,000 ms | Autosuspend after 5 min idle; adds to the first request after a quiet spell |

Measure before optimising. The first response to a miss is an `EXPLAIN ANALYZE`, not a cache.
