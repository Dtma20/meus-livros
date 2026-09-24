# Agent workflow

How the 26 tasks in `tasks/` get implemented: delegated to coding agents, reviewed here, merged one task at a time.

Written 2026-09-19, after eight tasks went through it.

---

## 1. The loop

```
worktree + branch per task
  → agent writes code, commits once, never verifies
    → reviewer re-runs everything, independently
      → clean: merge into develop, delete worktree, next task in
      → findings: a correction round, then re-review
        → attempt 3 runs at the same model and effort, and is the last delegated one
          → still failing: the reviewer finishes it by hand
```

**Three attempts is the ceiling**, counted per task — the first run plus each
correction round. Owner's rule, 2026-09-20. It replaces the older "same defect
survives two rounds, ask the owner": a model that cannot converge on a task is
not a question for the owner, it is work to be done. A fourth round costs a whole
agent run to produce what the reviewer can write in minutes, and by then the
reviewer has read the code closely enough to be faster than the prompt describing
it.

**Every attempt uses the same model and effort** — `openai/gpt-6-luna#xhigh` (§3).
No medium-first, no escalation on attempt 3, no solo-task exception. The old
medium → medium → high rule (and its 2026-09-21 solo-task exception) was retired
with the Gemini chain on 2026-09-23.

Attempt 1 at xhigh → attempt 2 at xhigh → **attempt 3 at xhigh** → the reviewer
finishes it by hand.

Still stop and ask when a finding genuinely needs the owner's judgement: cost, a
scope change, or an external credential.

Nothing is merged on the agent's word. **Every substantive finding so far came from the reviewer's own verification, not from reading an agent's report** — an agent reported a stale artifact hidden behind `?? server/`, another presented a phantom dependency as a virtue, a third reported a seed script that could not run at all.

### Isolation

One `git worktree` per task, branched from `develop`:

```bash
git worktree add ../meus-livros-t0NN -b task/0NN-slug develop
cd ../meus-livros-t0NN && npm install
```

Each worktree needs its own `node_modules`. Remove the worktree after merging — it frees a few hundred MB and stops the branch drifting.

**Do not copy `.env` into a worktree.** Pass credentials through the process environment instead, so an agent has no file to read:

```bash
eval "$(node -e "const fs=require('fs');for(const l of fs.readFileSync('.env','utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if(m) console.log('export '+m[1]+'='+JSON.stringify(m[2]))}")"
```

This closes the obvious door, not the house: `printenv` still shows everything, and the main checkout's `.env` is one `cat ../meus-livros/.env` away. If that matters, give the agents a disposable Neon branch so the exposed credential is worth nothing.

### Prompt composition

Three parts, concatenated:

1. `agent-prompts/common-rules.md` — execution, git, report and scope rules. Task-agnostic.
2. `agent-prompts/repo-state.md` — what already exists. Keep it current at every merge; it is what stops agents reinventing the session seam or the error helper.
3. Task-specific notes — which task file to read, which documents it links, and the landmines already verified against the real data.

The task file in `tasks/` is the specification. The prompt never restates it; it adds only what the agent cannot see.

---

## 2. Agents do not verify

The single most expensive failure was agents running a long command, yielding the turn, and the print-mode session ending underneath them. Four whole runs were lost that way, each burning quota and producing nothing. Writing "run commands in the foreground" into the prompt did not stop it — it is model behaviour, not instruction-following.

So the rule is now structural: **the agent runs no slow command at all.** No build, no typecheck, no test suite, no integration test, nothing touching the network or the database. It writes code and reports. The reviewer runs lint, typecheck, tests and build.

This also removes the incentive to fake a green report, because there is no report of results to fake — the agent reports what it *implemented* and flags what it is unsure about.

**Keep tasks small enough to finish in one run.** A task that needs ten steps will be interrupted; `REPORT.md` and its `PROXIMO PASSO` section are what let the next run continue instead of restarting.

---

## 3. Model selection

Owner's policy (2026-09-23): **always `openai/gpt-6-luna#xhigh`. No chain, no fallback, no effort levels.**

```
openai/gpt-6-luna#xhigh  (opencode)  ← the only model
```

Verified 2026-09-23 via `opencode models openai --verbose`: `openai/gpt-6-luna`
is `status: active`, `release_date: 2026-09-22`, and its `variants` map includes
`xhigh` (`reasoningEffort: xhigh`). Reference form is `provider/model#variant`
(see `opencode.ai/docs/models`): `openai/gpt-6-luna#xhigh`.

A **derailed** run is retried once on the same model — one TASK-013 round came
back with its report replaced by unrelated prose after a single one-line edit,
and the model was fine on the next attempt.

Retired: `gemini-3.8-flash-medium/high` (`agy`), `claude-sonnet-4-6` (`agy`),
`grok-4.6` (`grok`), `opencode/muse-spark-1.3-contributor-free`. No `agy`, no
`grok`, no `--effort`, no concurrency-based model switch. History below (§5)
still names Gemini where Gemini actually ran — that is record, not policy.

`--auto` runs unattended. That is a standing grant to edit files and run
commands in that worktree; the worktree is the blast radius.

### Invocation

```bash
opencode run --auto -m openai/gpt-6-luna#xhigh "$(cat prompt.md)"
```

Passing a long prompt through `"$(cat ...)"` runs it through the shell, and a
prompt containing backslashes, backticks or `$` comes out altered — silently,
and in the parts most likely to be code. Keep prompts in `prompt.md` and diff
the worktree before trusting the report.

A run can exit **0 having done nothing** — quota exhaustion prints an error and
still exits 0. Never trust the exit code. Diff the worktree against a snapshot
taken before launching.

---

## 4. Review protocol

1. Read the report block only — the short one on stdout, not `REPORT.md`.
2. Re-run `npm run lint`, `npm run typecheck`, `npm run test` in the worktree. Run `npm run build` for anything touching the frontend.
3. Verify each acceptance criterion in the task file literally, with a command. For database criteria, query the database directly.
4. Check `git status --porcelain -uall` — plain `--porcelain` collapses untracked directories to `?? dir/` and hides stray files.
5. Read the security-sensitive code yourself. Auth, input validation and anything reaching `<img src>` or SQL do not get skimmed.
6. Small mechanical fixes: make them yourself and amend. A correction round costs a whole agent run.
7. Merge with `--no-ff`, then re-run the full suite on `develop`. Merges surface failures that neither branch had — a stale build bundle, two copies of Vite, a global test environment that was fine alone.

---

## 5. Current state

`develop` at `b06015d`. Lint 0, typecheck 0, **397 tests passing**, `npm run build` clean.

**Twenty-three of the twenty-seven tasks are merged.** `npm run test` now requires a
current bundle and says so if it is missing — run `npm run build` first.

### The performance round, 2026-09-21

A performance audit produced thirteen surgical fixes, delegated nine-wide and then
four-wide to `gemini-3.8-flash-medium`, partitioned by **file ownership** so the runs
could not collide. The measured wins:

| Fix | Number |
|---|---|
| `review`/`publisher` dropped from the profile response | **59,721 bytes** of dead payload per profile load, 64% of it |
| `/api/users/me` stopped validating the session twice | 4 sequential round trips → 2 |
| `searchWorks` uses `EXISTS` and `COUNT(rl.id)` | p95 query cost **207–382 ms → 87.6 ms**, limit 150 |
| `typeCheck: false` in `nuxt.config.ts` | build **167 s → 63 s** |
| `nodemailer` behind a dynamic import | 1.4 MB and 62 ms off every serverless cold start |
| `Promise.all` in `works.ts` and `profiles.ts` | 4 round trips saved per page |
| `timeout` + `retry: 0` on every client fetch | an unbounded promise is now a bounded one |

Two of the thirteen were corrections to the audit's own specification, not to the
agents' work: `connect_timeout` had been specified at 10 s, equal to Vercel Hobby's
own function cap and therefore never able to fire first (now 7 s); and the task that
removed `ProfileLogItem.review` named its test fixtures from a grep that had only
covered two of the four files that type against it.

Deliberately **not** done, and recorded so nobody redoes the argument: `pg_trgm`, a
GIN index, and a generated column on `authors` were all rejected for the search fix.
The bottleneck was query shape, not the leading-wildcard `ILIKE`, and query shape is
free. An index costs a migration applied by hand. If the p95 ever regresses past 150
with the shape already fixed, that is when the extension earns its place.

**[027](tasks/027-password-sign-in.md) is merged.** The daily sign-in is now
`handle`-or-email + password; the six-digit code is narrowed to first access and
password reset.

It had been implemented on `task/027-password-sign-in` and left unmerged and
unreviewed, which is why this section called it "not started" for a day while
the running site still asked for a code. The review found three defects, and
the first one made the feature unusable:

- **First access answered 401 to every real invitee.** `/api/auth/set-password`
  gated on `getSessionUserByHeaders`, which resolves the *app profile* and
  returns null with no `users` row. The invitee has no such row at that
  moment — it is created at `/app/bem-vindo`, after the password is set. The
  gate is now the better-auth session, which is what actually proves the code
  was verified.
- **The test could not catch it.** `beforeAll` inserted the profile with the
  comment "so getSessionUserByHeaders resolves a valid user UUID", so the
  first-access test was not testing first access. There is now a second invitee
  with no profile row, and the test asserts the row is absent both before and
  after the code verifies. Reverting the fix fails that test with
  `expected 401 to be 200` and nothing else — which is the evidence that the
  old suite was green for the wrong reason.
- **The reset branch reopened a timing signal.** It sends mail and had no
  `await import('nodemailer')`, so an address that gets a reset code paid the
  62 ms first load and an unknown one did not. Ours, not the branch's: the
  branch predates nodemailer becoming a dynamic import, and the two changes only
  conflict once combined. Any future branch that sends mail needs that warm
  ahead of its allowlist check.

Verified rather than believed: better-auth **does** hash the password on the
user-not-found path (`dist/api/routes/sign-in.mjs`, `await
ctx.context.password.hash(password)` before the throw), so requirement 3's
timing floor holds without a dummy hash of our own. And the implementation is
better than the spec on one point — the spec said to open `sign-in/email` in the
allowlist; it instead built `/entrar` and left `sign-in/email` denied, so the
sign-in rate limit cannot be bypassed by calling better-auth directly.

**Still unverified, and unverifiable here:** sign-in inside WhatsApp's in-app
browser on a real Android phone, with the phone's password manager offering to
save the credential. It is the criterion that motivated the whole task.

| Merged | |
|---|---|
| 001 | Nuxt 4 scaffold, legacy site moved to `legacy/` |
| 002 | Neon + Drizzle, pooled/direct split, fail-fast on missing env |
| 003 | Ten-table schema, enums, relations, inferred types |
| 004 | Initial migration, `f_unaccent`, generated column, 26 genres seeded |
| 005 | Design tokens and six presentational components |
| 006 | Layouts, nine stub routes, auth middleware stub, pt-BR 404 |
| 009 | Catalog services, ISBN normalisation, two POST endpoints |
| 010 | Local search over the generated column |
| 019 | The 86 books, 60 authors, 86 editions, 86 reading logs |
| 007 | Email OTP sign-in, allowlist gate, Postgres rate limiting *(sign-in half superseded by 027, not yet implemented)* |
| 008 | Profile creation, handle rules, the `/app/**` profile gate |
| 013 | Log a book: create, edit, delete, with draft persistence |
| 011 | Manual add-book flow |
| 014 | Entry permalink and Open Graph |
| 015 | Work page |
| 016 | Profile page with filters, sorting and stats |
| 017 | Visibility enforcement and its tests |
| 026 | `search_misses` instrumentation |
| 018 | Home page: landing for strangers, ten recent visible logs for members |
| 012 | Optional Open Library lookup during manual book entry |
| 020 | Empty, error and loading states across every list and page |
| 021 | Accessibility pass: `<a>` cards, alt text, focus rings, skip link, `lang`, axe suite |
| 025 | Reading map: vendored public-domain geometry, desktop-only chunk, click to filter |

### Waiting

Nothing is in flight. **The delegatable queue holds one task: [027](tasks/027-password-sign-in.md).**
It is not greenfield — it rewrites merged auth code, and its security criteria
(identical failure bodies, comparable timing, revoking other sessions) are the
kind an agent reports as passing without having checked. Delegate it only with
the diff read line by line, or take it yourself.

The other three are the owner's: 022 is blocked on repository visibility,
023 needs a Vercel account, 024 depends on 023.

**An agent run can also derail, not just fail.** The TASK-013 correction round returned exit 0 with a report block replaced by unrelated prose scraped from somewhere else, having made a single one-line edit. The worktree diff is the only thing that tells you this; the exit code and the report both said nothing was wrong. Diff before reading anything else.

**022 cannot be implemented as written.** The repository is public, and the task's own security section says a dump artifact inherits repository visibility. The dump carries every member's email address. Either the repository goes private or the backup workflow lives in a separate private one — that is an owner decision, and it comes before the first run, not after.

### Traps this codebase has already sprung

Each of these cost a review round or a correction round. They are written down
because every one of them looked fine in a diff.

- **A page that fetches must `await useAsyncData`.** All three public pages —
  `/@handle`, `/livro/[slug]`, `/entrada/[id]` — shipped calling
  `createError(404)` on a value that was still null when the check ran. Every
  unknown slug answered **200 with an error box**, and the crawler that builds
  the WhatsApp preview reads the status line. The price of the `await` is that
  the component becomes async: a test that mounts it needs a `Suspense`
  boundary, because Nuxt gives pages one and a bare `createApp` does not.
- **Nuxt composables do not survive an `await` in route middleware.** Calling
  `navigateTo` or `useState` after one raises `NUXT_E1001` during SSR, which
  turns the 302 that guards `/app/**` into a 500. Resolve every composable
  before the first `await` and wrap the redirect in `runWithContext`. Use
  `useRequestFetch`, not `$fetch`: only the former forwards the session cookie
  on the server. This broke twice.
- **`app/**` must not import from `server/**`, types included.** ESLint enforces
  it now. Two pages had walked past the old rule, which only barred
  `**/server/db`. They were `import type`, so nothing leaked into the bundle,
  but the day someone drops the keyword it does.
- **A deep relative import of a *value* breaks the production build** where the
  same path in an `import type` does not — the type import is erased before
  Rollup sees it. Use `~~/shared/...`.
- **A global `count(*)` in an integration test is not a test of your feature.**
  The database holds the real 86-book corpus and other test files create rows in
  parallel workers. Scope every assertion to the rows the test created. This
  broke the migration suite the moment the auth suite landed beside it.
- **Clean up integration fixtures with `removeFixtures(MARKER)`** from
  `tests/integration/fixtures.ts`, never a hand-written chain of deletes. Put the
  suite's marker in every email, title, slug and author name it creates. The
  helper finds rows by that marker rather than by collected ids, deletes
  `reading_logs` before `works` (RESTRICT) and users last, all in one
  transaction. Hand-written chains left 31 works, 3 logs and 10 users in the real
  database: a partial setup left ids uncollected, a stray log made the works
  delete throw and skip everything after it, and users deleted first turned
  `created_by` NULL. Wrap a seeding `beforeAll` in `trackSetup()` so a timed-out
  setup cannot keep inserting after `afterAll` has cleaned.
- **Integration tests need an explicit timeout**, 20–30s. They make several
  round-trips to a remote Postgres and the 5s default measures Neon's latency on
  the night the suite runs, failing a different test each time.
- **`npm run test` exits 0 with a red suite.** The 012 correction round came back
  with two failing unit tests and a zero exit code. §3 already says never trust
  an *agent's* exit code; it is equally untrue for the reviewer's own run. Read
  the `Tests N failed` line, not `$?`.
- **A report describes the intent, not the diff.** Both correction rounds claimed
  work that was not in the code. 012 reported the 401 test now passing "por
  mérito" — it passed because a bare `catch` swallowed the error the mock
  provoked. 018 reported `UserProfile` kept "com documentação técnica sobre
  restrições de ESLint" — there was no comment, and after the round the type had
  no importer at all and was deleted. Neither is a lie; it is the model narrating
  what it set out to do. Read the diff for every claimed item.
- **A test that fails for want of a stub reports the wrong symptom.** Both new
  TASK-020 test files mounted `SearchBox` without stubbing `useId`, `navigateTo`
  and `useRoute`. The component threw on mount, the container stayed empty, and
  vitest reported a missing `[data-testid="search-add-manual"]` — which reads as
  a button the implementation forgot, when the button was there. Believing the
  message would have sent a correction round asking for buttons that already
  existed. Find the first thrown line before trusting the assertion.
- **Before forbidding a file in a prompt, look for its twin.** The TASK-020
  correction prompt said "do not touch `tests/unit/routes.test.ts`" without
  checking whether an integration file asserted the same strings. One did, the
  agent obeyed to the letter, and the suite went red on copy the reviewer had
  already fixed once. A narrow prohibition written from incomplete knowledge of
  the tree is the reviewer's bug, not the agent's.
- **A finding can be wrong, and an agent will obey it anyway.** The reviewer
  called the short-query guard in `searchOpenLibrary` a duplicate of the route's.
  They do different jobs — the route's decides whether a rate-limit slot is
  spent, the service's stops a pointless request leaving for a third party — and
  a test covered the service one. The agent removed it as instructed and the test
  went red, which is the only reason it was caught. Write findings so a red test
  can contradict them.
- **`happy-dom`'s `fetch` cannot reach the local test server.** A file declaring
  `// @vitest-environment happy-dom` gets happy-dom's `fetch` as the global, and
  it applies the Same-Origin Policy against the document's origin, `about:blank`.
  Every request to `http://127.0.0.1:<port>` comes back
  `NetworkError: Cross-Origin Request Blocked`. All four tests of the new
  `axe-core` suite failed this way on the first round. A DOM-needing test that
  also has to talk HTTP uses `node:http` for the transport and keeps happy-dom
  only for the parsing.
- **`@mousedown.prevent` does not cancel the `click` that follows it.**
  `preventDefault()` on `mousedown` suppresses focus, not the click event, so a
  button carrying both handlers runs its handler twice — here, two `navigateTo`
  calls for one press. No test clicked those buttons, so the suite was silent.
- **A task that exists to add a guarantee can remove one.** The accessibility
  round weakened `BookCover`'s `alt` from a required prop to `alt?: string` with
  `:alt="alt ?? ''"`. All six callers already passed it; the change bought
  nothing and traded a compile error for a silently decorative cover — against
  the very criterion the task was written to enforce.
- **`aria-labelledby` handed to a component lands on its root and dies there.**
  Without `inheritAttrs: false` it falls through onto the wrapper `<div>`, which
  is `role=generic`, and an accessible name on a generic element is ignored. Two
  of them shipped looking like fixes in the diff.
- **An agent reverted `package-lock.json` after adding a dependency to
  `package.json`** and filed it under `FORA DE ESCOPO NOTADO`. The two files
  disagreed, which `npm ci` refuses — and `npm ci` is what Vercel runs. Check the
  lockfile whenever `DEPS ADICIONADAS` is not "nenhuma".
- **A green suite says nothing about what the page weighs.** TASK-025 passed
  lint, typecheck, build and 387 tests while doubling the profile page: 59.5 KB
  gzipped to 115.9 KB, inline and therefore re-sent on every visit, for a map
  that was `display: none` below the breakpoint. Nobody's criterion caught it
  because no criterion measured it. Serve the bundle and measure the routes a
  task touches, the way §9 of `CLAUDE.md` asks.
- **A `defineAsyncComponent` buys nothing while a util still imports the heavy
  thing.** `app/utils/reading-map.ts` imported the map geometry to test
  membership, and the page imports that util, so 133 KB rode into the page chunk
  no matter how the component was loaded. The lazy import only worked once that
  edge was cut. Before splitting a chunk, `grep` for every importer of what you
  are trying to move.
- **A green suite does not mean the browser console is.** The home page called
  `setPageLayout` inside `setup()` from the day TASK-018 merged. Lint, typecheck,
  build and every test passed, and the route test asserted the anonymous shell —
  which is the one case that never mismatched. A signed-in member got the
  anonymous shell from the server and the member one from hydration, and the
  console filled with mismatches on every load. Nothing in the pipeline opens a
  page as a logged-in user. Until something does, open one by hand after touching
  a layout or a page's shell.
- **`getComputedStyle` does not exist on the server.** TASK-025's own
  requirement 4 asked for it to read the colour scale; following it literally
  means an uncoloured first paint or an `onMounted` repaint that flashes. CSS
  classes bound to the same tokens satisfy the acceptance criterion — which says
  "derive from CSS tokens" — without either. A requirement written before the
  SSR constraint was felt is not binding; say so in `DECISOES` and move on.
- **Never run `npm run build` in the checkout where the owner's dev server is
  running.** `nuxt build` and `nuxt dev` both write `.nuxt`. The reviewer built
  in the main checkout seven seconds after a dev server came up in it, Nuxt
  swapped the server bundle underneath an in-flight `POST /api/users`, and the
  request died without a response — the owner watched a button read "Salvando…"
  forever. The worktrees exist precisely to stop this; verify in one of them.
  A dedicated `ml-verify` worktree with its own `node_modules` costs one
  `npm install` and removes the whole class.
- **`$fetch` has no timeout by default, and a promise that never settles never
  reaches `finally`.** A request lost without the server answering or closing
  leaves a loading flag `true` for good: no error, no retry, no way out but a
  reload. This is not a slow-network annoyance, it is a dead UI, and the cohort
  opens the site inside WhatsApp's WebView on mobile. Every client fetch needs
  an explicit `timeout`.
- **…and `timeout` alone doubles the wait on a GET.** ofetch retries
  non-payload methods once, and with `timeout` set it does not classify the
  timeout abort as an abort (`name === "AbortError" && !context.options.timeout`
  in its `onError`). So a 15 s timeout on a GET waits 30 s. Pass `retry: 0`
  alongside it. Mutations are already at zero retries via `isPayloadMethod`,
  and must stay there — a blind retry on `POST` duplicates the record.
- **Naming the files a task may touch is only as good as the grep behind it.**
  The task that removed `ProfileLogItem.review` listed four files, from a grep
  that had covered two. Two more fixtures typed against the interface, and
  `develop` merged with three type errors. Before writing a file allowlist into
  a prompt, grep the whole tree for every symbol the task removes — the same
  lesson as "look for its twin", arriving from the other direction.
- **A piped npm script reports the exit code of the pipe.** Chaining
  `npm run typecheck 2>&1 | tail -8 && npm run build` runs the build even when
  typecheck failed, because `tail` succeeded. The suite already had a rule about
  not trusting `$?`; it applies to the reviewer's own shell plumbing too.
- **Integration failures move around, and the pass/fail line is not the
  evidence.** Four full runs in one afternoon failed four different sets —
  search p95, then auth+feed+catalog+search, then nothing, then routes+axe —
  and the last of them passed a test that had failed three times. Every one of
  the moving failures was the 5 s default timeout measuring Neon. Before
  blaming a diff, run the failing files alone; and when a threshold test passes,
  force it to print the number, because passing at 149 and passing at 87 are
  different facts.

### Decisions taken during implementation

- **Email delivery moved from Resend to Gmail SMTP via `nodemailer`.** Resend refuses to send from a domain it cannot verify, and the sender is a `@gmail.com` address. Measured: two HTTP 403s, `The gmail.com domain is not verified` and `You can only send testing emails to your own email address`. The cost of this choice is deliverability — no custom domain means the OTP depends on Gmail's reputation and may land in spam. `architecture.md` §3.5 must record the reversal or someone will reintroduce Resend.
- **`vitest` bumped to 5.x** to remove a duplicate Vite (8.3.0 from Nuxt against 7.3.6 nested inside vitest 3), which produced two incompatible `Plugin` types.
- **`tsx` added** so `scripts/**` can run at all. Node cannot resolve their extensionless TypeScript imports.
- **`tsconfig.test.json` created** — `tests/`, `scripts/`, `vitest.config.ts` and `drizzle.config.ts` were in no tsconfig and were never typechecked.
- **`createWork` gained `skipRateLimit` and `tx`**, so the 86-book migration exercises the production code path inside one transaction instead of a parallel one.
- **`/api/auth/**` denies by default.** better-auth's email-OTP plugin registers four mail-sending routes; only `send-verification-otp` belongs to this product. Guarding that one and passing the rest through left `request-password-reset`, `forget-password/email-otp` and `request-email-change` reachable with no rate limit and no allowlist — unauthenticated, unbounded sending from the maintainer's Gmail. An explicit path allowlist now answers 404 to everything else. Adding three more exceptions would have been the wrong shape; the next plugin upgrade would reopen it.
- **The OTP response does not wait on SMTP.** Awaiting the send made the allowlisted path visibly slower than the denied one, which is the enumeration oracle the identical-response rule exists to close. **This has a cost on Vercel** — see the owner's list.
- **`searchWorks` takes a required viewer.** Its `log_count` ranked and reported
  over every reading log with no filter, so an anonymous search saw 4 where it
  should have seen 1 — two private entries and one on a private profile, counted
  and exposed. Counting an invisible row announces it exists, which is the leak
  the 404-instead-of-403 rule closes, arriving by another door.
- **The session resolves to `users.id`, not the better-auth id.** `ba_user.id` is text, `users.id` is uuid, and the latter is what `works.created_by` references. Returning the better-auth id would have made every authenticated write fail on an invalid uuid. No `users` row now means `getSessionUser` returns null, which is the registration gate `security.md` already specified.

### Corrections to the planning documents, found in the real data

- **Three of the 86 "ISBNs" are Amazon ASINs**, not ISBNs: `B07PV188F2`, `B09LZ3RVZD`, `B015EE5N7G`. `CLAUDE.md` said 22 of 86 are ISBN-10; 22 are ten-character strings, of which three are ASINs. Real split: 19 ISBN-10, 64 ISBN-13, 3 not ISBNs at all. **Corrected** in `CLAUDE.md`, `migration.md`, `tasks/019` and the `isbn.ts` header at the 019 merge.
- **`infrastructure.md` §88 is wrong.** It offers "the shared sandbox domain for the first weeks" as an alternative to a verified sending domain. Resend's sandbox delivers only to the account owner's own address, so it cannot serve a multi-user product for a single day, let alone weeks. Still open — it goes out with the 007 correction round.
- **Author count is 60**, not the 59 or 61 `migration.md` predicted. The assertion now checks exactly 60, because a range that wide asserts nothing.

### Blocked on the owner

1. ~~`GMAIL_APP_PASSWORD` in `.env`~~ — **done.** A 16-character app password is in `.env`.
2. ~~`pg_dump` is not on `PATH`~~ — **found, and it works.** `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`, version 18.4, dumps the Neon 17.11 server cleanly (a newer `pg_dump` against an older server is the supported direction). TASK-022 only needs that directory added to `PATH`, or the absolute path written into the backup script.
3. TASK-023 needs a Vercel account and dashboard configuration. TASK-024 depends on 023.
4. Real email delivery beyond the owner's own address needs either a verified domain or acceptance that Gmail SMTP is the ceiling.
5. The WhatsApp WebView acceptance criterion in TASK-007 needs a real Android phone. It cannot be verified here, and it is the criterion that ruled out OAuth.
6. **TASK-022 vs. repository visibility.** `Dtma20/meus-livros` is public. A `pg_dump` artifact inherits that visibility and contains every member's email address. Make the repository private, or put the backup workflow in a separate private repository. Until this is decided, 022 should not run even once.
7. **The OTP email is sent without awaiting it, and Vercel may not let it finish.** This is the deliberate trade against the enumeration-timing requirement: awaiting SMTP makes an invited address answer measurably slower than an uninvited one. On a long-lived server the send completes; on Vercel's serverless runtime, work started after the response is not guaranteed to run, and neither h3 1.15 nor Nitro's Vercel preset exposes `waitUntil` (it exists only in the Cloudflare presets). Three ways out, in increasing cost: accept the risk and watch for missing codes; await the send and accept the timing signal; or move OTP delivery to a route that is allowed to be slow. **Decide this before TASK-023, not after** — the symptom is a code that silently never arrives.

### Decision taken after the merge window — sign-in moves to a password

**2026-09-21. The daily sign-in becomes `handle` or email + password; the six-digit code is kept for first-access activation and password reset.** Recorded in [architecture.md](architecture.md) §3.5, specified in [tasks/027](tasks/027-password-sign-in.md).

Two things forced it, and neither is a dislike of OTP:

1. **The app switch.** A member taps a link in WhatsApp, lands in Android's WebView, and to sign in has to leave for a mail client, wait on Gmail, copy six digits and come back — to a WebView that may have reloaded. That is the activation funnel's most fragile step, and with a 30-day session it recurs on every expiry, not just at registration. A password is returned by the phone's password manager behind a fingerprint.
2. **Gmail SMTP was on the critical path of every sign-in.** It is a free-tier sender with no verified domain. Demoting it to activation-and-reset removes it from the path that has to work every time.

**What this does to the open problems below:** item 7 — the fire-and-forget SMTP send that Vercel may not let finish — stops being a per-sign-in risk and becomes a per-activation and per-reset one. It does not go away, and it must still be decided before TASK-023; a code that silently never arrives during first access is worse than one that never arrives during a routine sign-in, because there is no signed-in state to fall back to.

**What it does not change:** OAuth stays ruled out on the `403 disallowed_useragent` finding. The allowlist keeps its role. The email-OTP plugin stays installed — it is the reset mechanism and the documented fallback.

**The cost, so nobody rediscovers it as a surprise:** account recovery becomes a flow we own, brute force becomes a real threat against a long-lived secret (hence the mandatory sign-in rate limit in [security.md](security.md) §8), and a third account state appears — *invited but not activated*.

### Next

[TASK-027](tasks/027-password-sign-in.md), password sign-in. It is the last
functional change before the owner-blocked deployment tasks, and it should land
**before** 023 rather than after: the WhatsApp-WebView acceptance criterion and
the Vercel fire-and-forget SMTP question (item 7 above) are the same question
asked twice, and 027 changes how much each one costs.
