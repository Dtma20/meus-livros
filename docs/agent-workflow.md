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
        → attempt 3 runs at high effort, and is the last delegated one
          → still failing: the reviewer finishes it by hand
```

**Three attempts is the ceiling**, counted per task — the first run plus each
correction round. Owner's rule, 2026-09-20. It replaces the older "same defect
survives two rounds, ask the owner": a model that cannot converge on a task is
not a question for the owner, it is work to be done. A fourth round costs a whole
agent run to produce what the reviewer can write in minutes, and by then the
reviewer has read the code closely enough to be faster than the prompt describing
it.

**The third attempt raises the effort**, and it is the one place `-high` belongs:
run it as `gemini-3.8-flash-high`, or keep the model and pass `--effort high`.
§3 says to reserve `-high` for something that has already failed at medium — the
last delegated attempt is the definition of that, and one run is nowhere near the
six concurrent `-high` runs that emptied the hourly quota.

Attempt 1 at medium → attempt 2 at medium → **attempt 3 at high** → the reviewer
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

Owner's policy: **Gemini first, and fall back down this chain only on quota.**

```
gemini-3.8-flash-medium  (agy)      ← the default
  → quota exhausted → claude-sonnet-4-6  (agy)
    → quota exhausted → grok-4.6  (grok, free on this machine)
      → quota exhausted → muse-spark-1.3-contributor-free  (opencode, .env removed first)
```

A **derailed** run is not an exhausted quota. Re-run the same model once before stepping down — one TASK-013 round came back with its report replaced by unrelated prose after a single one-line edit, and the model was fine on the next attempt.

| Model | Where | Notes |
|---|---|---|
| `gemini-3.8-flash-medium` | `agy --model` | **The default for attempts 1 and 2.** `-high` is not better as a default and burns the hourly quota far faster — six concurrent `-high` runs exhausted it mid-batch and cost three tasks their run. `-high` is reserved for **the third and last attempt** on a task that failed twice at medium (§1). Backgrounds long commands and idles — mitigated by §2. Quota is per-account and resets hourly. |
| `claude-sonnet-4-6` | `agy --model` | Fallback. Much longer quota reset (hours). |
| `grok-4.6` | `grok --always-approve --prompt-file` | Free on the owner's machine, and the only model in this chain whose CLI takes the prompt from a file — which sidesteps the shell-quoting damage that `-p "$(cat ...)"` does to backslashes and backticks. Logged in via grok.com. |
| `opencode/muse-spark-1.3-contributor-free` | `opencode run --auto -m` | Last resort. **Free in exchange for Meta training on prompts and completions** — do not point it at anything sensitive. **Delete `.env` from the worktree before launching it and restore it afterwards** (see below). Strong at coding: it found the `ILIKE` wildcard escaping bug, a `UNION` duplicating rows, and a missing `UNIQUE (key, window_start)` that would have made OTP rate limiting fail silently. |

Both CLIs need an auto-approve flag to run unattended: `--dangerously-skip-permissions` for `agy`, `--auto` for `opencode`. That is a standing grant to edit files and run commands in that worktree; the worktree is the blast radius.

### Invocation

```bash
agy  --model <id> --dangerously-skip-permissions -p "$(cat prompt.md)"
grok --always-approve --prompt-file prompt.md
opencode run --auto -m <id> "$(cat prompt.md)"
```

`grok`'s `--prompt-file` is the shape to prefer. Passing a long prompt through `"$(cat ...)"` runs it through the shell, and a prompt containing backslashes, backticks or `$` comes out altered — silently, and in the parts most likely to be code.

### Handing a worktree to the free model

The free tier is paid for with the prompt and the completion, so the credentials must not be in the tree while it runs. It never needs them — it runs no command that touches the database or the network.

```bash
mv .env "$TMPDIR/env-t0NN.bak"      # before launching opencode
opencode run --auto -m opencode/muse-spark-1.3-contributor-free "$(cat prompt.md)"
mv "$TMPDIR/env-t0NN.bak" .env      # before reviewing, the suite needs it
```

This narrows the exposure, it does not remove it: the main checkout's `.env` is still one `cat ../meus-livros/.env` away, and `printenv` still shows whatever the process inherited. A disposable Neon branch is the only version of this that actually holds.

**Restore `.env` before reviewing.** The integration suite silently skips every database test without `DATABASE_URL` — `describe.skipIf(!process.env.DATABASE_URL)` — so a forgotten restore produces a green run that tested nothing.

A run can exit **0 having done nothing** — quota exhaustion prints an error and still exits 0. Never trust the exit code. Diff the worktree against a snapshot taken before launching.

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

`develop` at `79e97bf`. Lint 0, typecheck 0, **364 tests passing**, `npm run build` clean.

**Twenty-one of the twenty-six tasks are merged.** `npm run test` now requires a
current bundle and says so if it is missing — run `npm run build` first.

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
| 007 | Email OTP sign-in, allowlist gate, Postgres rate limiting |
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

### Waiting

Nothing is in flight. **021 (accessibility pass) is next** — every page it audits now exists. 025 (reading map) is unblocked but optional. 022, 023 and 024 are the owner's.

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
- **Delete `reading_logs` before `works` in cleanup.** A partial setup leaves an
  id out of the user list, the works delete dies on the foreign key, and the
  whole fixture stays in the database. That happened, and the rows were found by
  querying afterwards, not by reading the test.
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

### Next

TASK-008, profile creation — it is what turns a verified identity into a `users` row, and without it nobody but the owner can do anything. Then 013.
