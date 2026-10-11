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

## Round 2 - review of `d820e45`

Same prompts plus a note pointing at round 1 and the owner's decisions. **Codex pass B did not finish**: it hit the Codex usage limit mid-run and produced no report. So round 2 has three reviewers, and the security pass ran on Claude alone.

| Finding | Found by | Origin | Fix |
|---|---|---|---|
| A dead OTP code answered 429 only when a code existed, telling invited, active and unknown addresses apart | Claude B-01 | **introduced in round 1** | Same 400 as a wrong code |
| Concurrent reset guesses got past the 5-attempt limit: `checkVerificationOTP` is not atomic (reproduced: 1 of 50 parallel guesses reset the password) | Claude A-01, Codex A-02 | **introduced in round 1** | 5 verifications / email / hour in the rate-limit table, counted first for every address |
| A reset in flight while the invite is removed recreates the credential (reproduced) | Codex A-01 | incomplete TASK-069 | Allowlist re-checked after the reset; credential and sessions revoked |
| Renaming an author keeps the previous author's locked country, and sends it | Claude A-02, Codex A-06 | **introduced in round 1** | The lock follows the original name |
| The work OG dropped confirmed `/b/id/` covers that carry `default=false` | Claude A-03 | **introduced in round 1** | Only `/b/isbn/` with `default=false` falls back |
| The ESLint ban missed `el['innerHTML']`, `Reflect.set`, `:innerHTML`, `v-bind="{ innerHTML }"` (reproduced) | Claude B-02 | incomplete | Computed members, `Reflect.set`, `vue/no-restricted-v-bind` |
| A body with neither `content-length` nor `transfer-encoding` skipped the cap (reproduced) | Codex A-04 | incomplete | 411 `tamanho_obrigatorio` for POST/PUT/PATCH |
| `/entrada/[id]` shared-cached for 60 s after turning private | all three | preexisting | **Owner: remove.** Always `private, no-store`; TASK-014 updated |
| Deleting a block during a save, or the empty-state add, reopened the race | Codex A-07 | incomplete | Disabled while saving, handlers guarded, response bound to its form |
| `/app/novo` applied a stale work response, saving the review on the wrong book (reproduced) | Codex A-05, Claude A-09 | preexisting | Generation counter |
| Import attached an arbitrary edition, or inserted an empty one, for items with no ISBN | Claude A-04 | preexisting | Edition only by ISBN, or from real edition data |
| "Adicionar livro novo" from the header returned to a page that ignored the new work; `ret` was an open redirect into a link | Claude A-05, B-04 | preexisting | Always `/app/novo?work_id=`; `ret` through `getSafeRedirectUrl` |
| Signing out during an undo countdown lost the deletion (401 on the keepalive DELETE) | Claude A-10 | preexisting | Pending deletes flushed before `signOut` |
| A mistyped ISBN silently erased the stored one | Claude A-11 | preexisting | 400 `validacao`, client-side check too. `scripts/migrate-livros.ts` now normalises first, so the three legacy ASINs still store as no ISBN |
| "Nova atividade" compared timestamps in milliseconds against a microsecond cursor | Codex A-09 | incomplete | `sort_key` carries the precise cursor |
| Home feed and dashboard fetches had no timeout | Codex A-08 | preexisting | 15 s timeout, `retry: 0` |
| Import timeout invited a resubmit that duplicates the library | Claude A-07 | introduced (timeout) | Warning plus an explicit "Enviar mesmo assim" |
| Export/import round trip: precision of unfinished reads, `country_code`, same-day order | Claude A-12 | preexisting | All three kept |
| Query params leaked through a log *message* (import) | Claude B-06 | incomplete | `cutQueryParams` on every message |
| Code screens hid the real reason (password rule, 429) | Claude A-08 | preexisting | Server message shown for 400 and 429 |
| No test exceeded the password-change, code-request and `POST /api/logs` limits | Claude B-03 | preexisting | Tests added |
| Malformed JSON answered `erro_requisicao` / "Bad Request"; undocumented codes; stale §2.2 and §2 text | Claude B-07 | incomplete | `validacao` in Portuguese; `api.md` and `security.md` updated |

Round 1 introduced five defects that round 2 caught - four of them in fixes to findings that had been reproduced. Re-reviewing fixes, not only the original code, was the part of the loop that earned its cost.

Gates after round 2: lint and typecheck clean, 852 unit tests, build, 224 integration tests and 24 SSR tests green (local Docker Postgres); the four secret values appear 0 times in `.vercel/output/static`.

### Left open when the owner stopped the loop after round 2

- No round 3: the round-2 fixes were verified by the gates below, not re-reviewed.
- `DELETE /api/admin/convites` reads a body; a DELETE with no `content-length` (only possible over HTTP/2, admin only) is not capped.
- While the feed is pending, the home page still waits for it (now bounded to 15 s) before showing the dashboard; the feed's retry refetches both.
- Import items with no ISBN but with a publisher create a new edition on every re-import; unfinished reads export first but list last.
- SMTP retries against the function's `maxDuration` (round 1, Claude A-16) - needs the deploy.

## Round 3 - review of `7089252`

The owner could no longer spend Claude quota, so round 3 ran both passes on Codex alone (`gpt-6.1-sol`, high), and the fixes went to Antigravity (`agy`): Gemini 3.1 Pro high for auth, Gemini 3.8 Flash high for the rest. The orchestrator checked each diff and corrected two things itself: the fixer had put the write budget on `/sign-out` (a member over budget could not sign out) and keyed `/change-password` under a second bucket.

| Finding | Found by | Fix |
|---|---|---|
| Password sign-in, OTP sign-in and `/set-password` racing `removeInvite` re-create a session or credential (the round-2 post-check covered only the reset) | Codex A-01, B-01, B-02 | Allowlist re-checked after success in all three; access revoked and no `set-cookie` returned |
| `POST /api/users` and the authenticated auth branches skipped the 200 writes/hour budget | Codex B-03 | `assertWriteBudget` shared by `requireSessionUser`, `POST /api/users`, `/set-password`, `/change-password` |
| `DELETE /api/admin/convites` reads a body with no cap | Codex B-04 | DELETE paths that read a body get the POST rules (411/413) |
| `scripts/migrate-livros.ts` printed a query error with the full email | Codex B-05 | Message cut and redacted |
| `Reflect['set']` and computed `innerHTML` keys passed the ESLint ban | Codex B-06 | Selectors added |
| Import's Zod error carried `details`, not `fields` | Codex B-07 | Same shape as `parseOrThrow` |
| Export dropped `country_code` when the label was empty | Codex A-02 | Exported and preferred on import |
| Text typed in a reading block while it saved was lost | Codex A-03 | Fields disabled while saving; re-entry guarded |

Gates after round 3: lint and typecheck clean, 858 unit tests, build, 230 integration and 24 SSR tests green; secret values 0 times in the client bundle.

## Round 4 - review of `23ce1f4`

Codex, both passes; fixes by `agy` (Gemini 3.8 Flash high).

| Finding | Found by | Fix |
|---|---|---|
| `DELETE /api/admin/convites/` (trailing slash) skipped the body rules the router still served | Codex A-01, B-01 | Pathname normalised before every path comparison |
| One person had two write budgets (`write:ba:` and `write:user:`) | Codex B-02 | One key per normalised email |
| Fields edited while a new edition was being posted were lost | Codex A-02 | Fields disabled while busy; submit guarded |
| Export turned an unknown format into "Físico" | Codex A-03 | `null` kept through the round trip |
| An export with long author names was refused by its own importer | Codex A-04 | `author` cap 1008 |
| Client GETs in middlewares, profile, stats, year, work, entry and search had no timeout | Codex A-05 | `timeout` + `retry: 0`; search tells a timeout from a cancel |
| `/atividade` and `/membros` showed a load error to anonymous visitors instead of the login redirect | Codex A-06 | Named `auth` middleware no longer limited to `/app` |
| A country saved on an author stayed editable until reload | Codex A-07 | Author rows rebuilt from the reloaded work |

Gates after round 4: lint and typecheck clean, 872 unit, build, 233 integration and 24 SSR tests green; secret values 0 times in the client bundle.

## Round 5 - review of `0d8ca16`

Codex ran out of quota at the start of this round, and Grok 4.7 (its own `grok` CLI) hit its free limit on the first call; neither produced a report. Both passes ran on Muse Spark 1.3 (free) and Step 5 preview (free), through `opencode`. Both Step runs exhausted their step budget before writing the formal report, so their findings come from the candidate list each left. No blocker was confirmed by Step; Muse found one regression from round 4.

| Finding | Found by | Fix |
|---|---|---|
| `WorkEditForm` watch erased text typed between a save and the reload (round 4 regression) | Muse A-01 | Reset only when not dirty; baseline and country lock refreshed either way |
| Search classified a cancel as a timeout on browsers without `AbortSignal.any` | Step A-1 | Explicit timed-out flag |
| Profile OG emitted `cover_url` without the `default=false` rule | Muse A-06 | Same rule as the work page |
| Import invented `fisico` for an absent or empty format | Muse A-02 | `null` |
| `PATCH /api/users/me` accepted `handle` and ignored it | Muse A-04 | Removed from the schema |
| `/entrar` spent rate-limit budget on empty submissions | Muse A-05 | Emptiness checked first |
| `POST /api/users` skipped the write budget on one branch | Muse B-02, Step A-4 | Counted on both |
| Error codes missing from `api.md` §1 | Muse A-03 | Table completed |
| `updateWork`/`updateEdition` have no ownership check | Step A-2 | Not a defect: `648cfdc` opened catalog editing to every member, with `updated_by` as the trail (TASK-066) |

Gates after round 5: lint and typecheck clean, 878 unit, build, 235 integration and 24 SSR tests green; secret values 0 times in the client bundle.

## Round 6 - review of `f8bd0ba`

Muse Spark and Step 5 on both passes; fixes by `agy` (Gemini 3.8 Flash high). Step again ran out of steps before a formal report on pass A.

| Finding | Found by | Fix |
|---|---|---|
| `/entrada` `og:image` still emitted `?default=false` covers (the work and profile pages did not) | Muse A-01 | Same cover rule in `app/utils/entry.ts` |
| Removing `handle` from the profile schema did not change behaviour: Zod strips unknown keys | Muse A-02 | `updateProfileSchema` is `.strict()` - extra keys answer 400 |
| A whitespace-only identifier still spent sign-in budget | Muse A-04 | Trimmed before the emptiness check |
| Origin check also trusted the request's own `Host` | Step B-03 | Only `BETTER_AUTH_URL`'s host when it is set |
| ISBN lookups sent no `User-Agent` (§9) | Muse B-01 | Descriptive header |
| The `db` import ban stopped at four `../` levels | Step B-02 | Deeper patterns |
| `WorkEditForm` dirty branch left the non-author baseline stale | Step A (candidate) | Baseline refreshed from the saved work |
| `api.md` §5 listed shipped features as absent | Muse A-03 | Rewritten |
| Nitro's Vercel preset emits the header route before `handle: filesystem` without `continue` | Step B-01 | **Open** - check on the first deploy that `/_nuxt/*` and `/api/*` still resolve and carry the headers; if not, move the headers to a server middleware |

Gates after round 6: lint and typecheck clean, 885 unit, build, 237 integration and 24 SSR tests green; secret values 0 times in the client bundle.

## Round 7 - review of `778dff8`

Muse Spark and Step 5 on both passes; fixes by `agy`. **No blocker was found by either engine.** Muse checked all eight round-6 fixes and found them complete. The rest was tech debt, fixed:

| Finding | Found by | Fix |
|---|---|---|
| Block PATCH/DELETE ignored the `logId` in the URL | Muse A-01 | Checked in the query; mismatch answers 404 |
| A malformed import spent the 3/hour budget before validation | Muse A-02 | Counted after the parse |
| One bad `rate`/`review` failed a whole import file | Muse A-03 | Validated per item, refused with a reason like dates |
| `cover_url` with surrounding spaces was stored untrimmed | Muse A-04 | Trimmed by the schema |
| Any two-letter `country_code` was accepted | Muse A-05 | Upper-cased and checked against the ISO list |
| Three copies of the OG cover rule | Muse A-06 | One helper in `app/utils/entry.ts` |
| `api.md` called the home feed endpoint optional; it needs a session | Muse A-07 | Doc corrected |

Step raised only questions: the ESLint sink rule firing (already proved by probes in rounds 2-4), `/_nuxt/*` headers and the Vercel route order (both the round-6 deploy check).

Gates after round 7: lint and typecheck clean, 902 unit, build, 241 integration and 24 SSR tests green; secret values 0 times in the client bundle.

## Round 8 - review of `107798d`

Muse Spark and Step 5 on both passes (Muse A failed once with `database is locked` - four parallel `opencode` runs share one local SQLite - and was rerun alone). **No code blocker.** Step's two candidates were wrong on reading (`backfillAuthorCountry` only fills a blank; `insertEdition` maps the ISBN unique violation to 409) and were dropped.

| Finding | Found by | Fix |
|---|---|---|
| Import accepted any `year`, while manual entry is bounded −3000…2100 | Muse A-01, Step B | `publicationYearSchema` in the import schema |
| `updateBlock`/`deleteBlock` take `logId` as optional | Muse A-02 | Accepted nit: both production callers pass it |
| Backup key and restore | Muse B-01 | **Open - owner action** (since round 1) |

## Round 9 - review of `c551eba`

Muse Spark on both passes; Step's code-review pass failed on the `opencode` SQLite lock and its security pass produced no finding. Muse caught one regression from round 8:

| Finding | Found by | Fix |
|---|---|---|
| The round-8 year bound sat in the batch schema, so one bad `year` refused the whole file | Muse A-01 | Checked per item, like rating and dates |
| Import ignored the 50,000-page cap of manual entry | Muse A-02 | Checked per item |
| `finished_precision` can be patched inconsistently with `finished_on`; a malformed identifier may answer faster than a wrong password | Muse A-03, B-02 | Questions, left open |
| Backup key and restore | Muse B-01 | **Open - owner action** |

## Round 10 - review of `de3795b`

Muse Spark and Step 5 on both passes, run one at a time (parallel `opencode` runs lock its SQLite).

| Finding | Found by | Fix |
|---|---|---|
| A wrongly typed `year`/`pages` or a non-https `cover_url` still refused the whole import file | Muse A-01, A-02, B-04 | Shape checked per item too |
| Logger printed a raw `Error` passed as `_rawError` next to the sanitised line | Muse B-03 | Escape hatch removed; nothing on the server set it |
| `api.md` still listed `GET /api/search/externo` and `GET /api/logs?handle=` | Muse A-04, A-05 | Replaced by `/api/isbn`; the phantom list route removed |
| `finished_precision` patchable inconsistently with `finished_on`; sign-in not-found timing; a computed sink assignment through a variable | Muse A-03, B-02, Step B-01 | Questions/nit, left open (better-auth already hashes on not-found, round 1) |
| Backup key and restore | Muse B-01 | **Open - owner action** |

Gates after round 10: lint and typecheck clean, 907 unit, build, 245 integration and 24 SSR tests green; secret values 0 times in the client bundle.

## Round 11 - review of `0cd59d7`

Muse Spark and Step 5 on both passes. **No blocker on the security pass from either engine**; Muse checked every round-10 fix and found it complete.

| Finding | Found by | Fix |
|---|---|---|
| Any other optional import field with the wrong type still refused the whole file - rounds 7-10 had loosened fields one at a time | Muse A-01, Step A-01 | Closed as a class: the batch schema only requires `title`/`author`; one strict `livroItemSchema` is checked per item |
| `Reflect.set(el, ['innerHTML'], x)` passed the sink rule | Step B-01 | Array-key selector |
| `book-catalog.md` §4 still named `/api/search/externo` | Muse A-02 | Points at `/api/isbn` |
| `get-session` could expose a nested `session.token` | Step A-02 | Not reproduced - every token-bearing branch already strips it; the reset branch, which returns no token, is now stripped too |
| Logged Postgres detail, keepalive DELETE without request id, `resolveIdentifier` always `found` | Step A-03-A-05 | Dropped: §11 allows the detail in logs; nit; deliberate for timing parity |

Gates after round 11: lint and typecheck clean, 910 unit, build, 247 integration and 24 SSR tests green; secret values 0 times in the client bundle.

## Not verifiable here

- Everything TASK-024 asks to check against production: the four visibility tests, the forged `X-Forwarded-For`, the served headers and cookie attributes, the 500 under `NODE_ENV=production`. There is no deployment yet.
- The backup restore (no public key committed).
