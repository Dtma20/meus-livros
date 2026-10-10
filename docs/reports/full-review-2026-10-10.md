# Full-project review, 2026-10-10

Review of the whole repository at `f34b912`, run as two passes on two engines, each pass given the identical prompt:

| Pass | Claude (Opus 5.5, effort high) | Codex (`gpt-6.1-sol`, reasoning high) |
|---|---|---|
| **A** - project code review with `.agents/skills/project-code-review` | 19 findings | 14 findings |
| **B** - security review against TASK-024 and `security.md` §13 | 15 findings + checklist | 15 findings + checklist |

Every finding below was checked against the code by the orchestrator before it went to a fixer. Fixes were made by Haiku subagents, one per non-overlapping set of files, on the branch `review/full-2026-10-10`. Four questions went to the owner; the answers are recorded where they apply.

Baseline before any fix: lint, typecheck, 747 unit tests, build, 185 integration tests and 24 SSR tests all green; the values of `BETTER_AUTH_SECRET`, `GMAIL_APP_PASSWORD`, `DATABASE_URL` and `DATABASE_URL_DIRECT` appear 0 times in `.vercel/output/static`. A green suite did not exclude a single one of the findings below.

## Round 1 - what each engine found

### Found by both

| Finding | Claude | Codex | Fix |
|---|---|---|---|
| JSON import attaches a reading to another work's edition (same ISBN) | A-01 | A-05 | Edition reused only when `work_id` matches; otherwise no edition plus a warning |
| Profile silently stops at 100 readings; header counters and OG wrong | A-03 | A-07 | `.limit(100)` removed |
| `/entrada/[id]` answers HTTP 200 for missing or private entries (regression from `56d7b6d`) | A-04 | A-11 | `setResponseStatus` restored; the test that pinned 200 now expects 404 |
| Backup reports success when `pg_dump` fails mid-stream | A-08 | A-06 | `set -o pipefail` inside the container shell |
| A code issued before an invite was removed still signs in or resets (TASK-069) | A-14 | A-01, B-01 | TASK-069 implemented |
| Auth catch-all outside `defineApiHandler` (TASK-070) | A-14 | A-12, B-09 | TASK-070 implemented |
| Client fetches with no timeout (activation, import, reading blocks) | A-12, A-13 | A-10 | Timeouts added; activation no longer replays a spent code |
| No 64 KB body cap | A-15, B-04 | B-02 | `server/middleware/body-limit.ts`, 413; import capped at 4 MB |
| Feed cache can serve an entry that just turned private | B-13 (other instances) | A-02 (race, reproduced) | **Owner: remove the cache.** Removed |
| No "any authenticated write: 200/user/h" limit | B-05 | B-03 | Applied in `requireSessionUser` |
| No ESLint rule against `innerHTML` / `outerHTML` / `insertAdjacentHTML` | B-06 | B-10 | `no-restricted-syntax` rule, probed |
| No `X-Frame-Options: DENY` | B-07 | B-13 | Added |
| Sign-in limit per identifier differs from §8 | B-08 (handle and email are separate buckets: 100/h per account) | B-05 (doc says 10) | Buckets keyed on the resolved email; §8 updated to the TASK-067 values |
| CSP `img-src https:` vs TASK-024 item 1 | B-09 | B-14 | **Owner: record the decision.** TASK-024 updated |
| Error codes differ from `api.md` §1 | B-11 | B-12 | Code aligned: `validacao` with `fields`, `erro_interno`, `muitas_tentativas` |
| OTP response timing differs (awaits SMTP) | B-03 | B-04 | **Owner: record the accepted exception.** §4.3, §13 and TASK-024 updated |
| `grep v-html` matches the world-map licence text | B-14 | B-10 | Criterion narrowed to `.vue`/`.ts` |
| `POST /api/works` limit: wrong error code | B-11 | B-06 (also bypassable by delete + concurrency) | Counter moved to the rate-limit table |
| No backup public key, no recorded restore | B-15 | checklist | **Open - owner action** |

### Found only by Claude

| Finding | Id | Fix |
|---|---|---|
| Password reset reveals which email owns a handle (reproduced) | B-01 | Code checked with `checkVerificationOTP` before the handle rule |
| A database error in an auth route prints the raw query with the full email to the console (reproduced) | B-02 | `onAPIError.throw`, so errors reach the wrapper; logger strips `params:` |
| Import invents the reading date and accepts future dates | A-02 | Item refused with a reason; never fabricated |
| "Lendo agora no grupo" links a block id and 404s | A-05 | Uses `log_id` |
| "Nova atividade" pill promotes an old entry and duplicates keys (reproduced) | A-06 | Compared against the top's `(created_at, id)`; pages deduplicated |
| Clearing pages/year in "nova edição" sends 0 (reproduced) | A-07 | Empty becomes null |
| Impossible dates (`2026-02-31`) and huge page numbers reach Postgres as 500 | A-09 | Calendar-date refine, page cap, and 22xxx codes map to 400 |
| Export/import round trip loses `started_on` and month precision | A-10 | Both exported and honoured |
| Editing an existing author's country says "salvo" and saves nothing | A-11 | Field read-only with an explanation |
| A private-profile commenter is shown to anonymous readers; the author loses delete after the reading turns private | A-17 | **Owner: mask and allow delete.** Done |
| The anonymous cached entry page carries "signed out" in its payload | A-18 | Cookie-less SSR leaves the session unfetched |
| `/api/isbn` undocumented (60/h, 8 s) | B-10 | **Owner: record.** §8 and §9 updated |
| The `app/` → `server/` import ban is overridden in the ESLint flat config | B-12 | Both pattern lists apply in `app/**` |
| Profile GET overwrites typing; `next` not encoded; genre slugs that do not exist | A-19 | All three fixed |
| SMTP retries may outlast the function's time limit | A-16 | **Open** - needs the real `maxDuration` after deploy |

### Found only by Codex

| Finding | Id | Fix |
|---|---|---|
| Sessioned SSR pages lack `Cache-Control: private, no-store` (architecture.md §3.2) | A-03 | `server/middleware/02.cache-control.ts` |
| Deleting an edition races a concurrent reading (reproduced) | A-04 | Transaction with `FOR UPDATE` |
| The entry editor drops the session cookie during SSR | A-08 | `useRequestFetch` |
| Saving one reading block closes the edit of another (reproduced) | A-09 | Edit and add disabled while a save is pending |
| Work OG image uses a `default=false` URL | A-13 | Fallback image, as on entries |
| `scripts/gen-countries.mjs` emits invalid TypeScript (reproduced) | A-14 | Unclosed comment removed |
| `scripts/wipe-database.ts` prints full emails | B-08 | `redactEmail` |
| OTP exhaustion answers 400, not 429 | B-11 | 429 `muitas_tentativas` |
| Search re-implements the visibility predicate | B-15 | Uses `visibleLogs(viewer)` |
| A mutation with no `Origin` passes | B-07 | **Owner: keep and document.** Not a defect: a browser always sends `Origin` cross-site. `security.md` §6 records why |

### Reading of the comparison

The overlap was 19 items, and most of those are the easy ones: the checklist rows of TASK-024 that anyone reading the task would tick. The rest split almost evenly - 15 findings only Claude raised, 10 only Codex - and in each list several are the reproduced, cross-file kind the skill asks for: the reset oracle and the logging leak on one side, the edition race and the editor's lost cookie on the other. Neither engine alone would have caught half of the real defects. Codex classified more items as blockers (it marked every TASK-024 row blocking, as the task says); Claude separated decisions the owner had already taken from defects, which is what produced the four owner questions.

## Not verifiable here

- Everything TASK-024 asks to check against production: the four visibility tests, the forged `X-Forwarded-For`, the served headers and cookie attributes, the 500 under `NODE_ENV=production`. There is no deployment yet.
- The backup restore (no public key committed).
