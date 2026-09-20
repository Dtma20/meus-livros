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
      → findings: one correction round, then re-review
        → same finding survives two rounds: stop, ask the owner
```

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

Owner's policy: **Gemini first. Use another model only when Gemini is unavailable.**

| Model | Where | Notes |
|---|---|---|
| `gemini-3.8-flash-high` | `agy --model` | Default. Backgrounds long commands and idles — mitigated by §2. Quota is per-account and resets hourly. |
| `claude-sonnet-4-6` | `agy --model` | Fallback. Much longer quota reset (hours). |
| `opencode/muse-spark-1.3-contributor-free` | `opencode run --auto -m` | Last resort. **Free in exchange for Meta training on prompts and completions** — do not point it at anything sensitive. Strong at coding: it found the `ILIKE` wildcard escaping bug, a `UNION` duplicating rows, and a missing `UNIQUE (key, window_start)` that would have made OTP rate limiting fail silently. |

Both CLIs need an auto-approve flag to run unattended: `--dangerously-skip-permissions` for `agy`, `--auto` for `opencode`. That is a standing grant to edit files and run commands in that worktree; the worktree is the blast radius.

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

`develop` at `f841919`. Lint 0, typecheck 0, 104 tests passing.

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

### Waiting

- **`task/019-migrate-livros-json`** — committed at `208e41f`, **not reviewed, not merged**. It already wrote to the database: 86 works, 60 authors, 86 editions, 86 reading logs. Review it first; it is the cheapest one outstanding.
- **`task/007-auth-email-otp`** — fourteen files written, **no commit, no verification**. Includes a real `getSessionUser` implementation, `0002_better_auth.sql` (generated, **not applied**), Gmail SMTP mail transport, rate limiting, and updates to `architecture.md` and `security.md`. Auth is the most security-sensitive task in the project; do not rush it.

### Decisions taken during implementation

- **Email delivery moved from Resend to Gmail SMTP via `nodemailer`.** Resend refuses to send from a domain it cannot verify, and the sender is a `@gmail.com` address. Measured: two HTTP 403s, `The gmail.com domain is not verified` and `You can only send testing emails to your own email address`. The cost of this choice is deliverability — no custom domain means the OTP depends on Gmail's reputation and may land in spam. `architecture.md` §3.5 must record the reversal or someone will reintroduce Resend.
- **`vitest` bumped to 5.x** to remove a duplicate Vite (8.3.0 from Nuxt against 7.3.6 nested inside vitest 3), which produced two incompatible `Plugin` types.
- **`tsx` added** so `scripts/**` can run at all. Node cannot resolve their extensionless TypeScript imports.
- **`tsconfig.test.json` created** — `tests/`, `scripts/`, `vitest.config.ts` and `drizzle.config.ts` were in no tsconfig and were never typechecked.
- **`createWork` gained `skipRateLimit` and `tx`**, so the 86-book migration exercises the production code path inside one transaction instead of a parallel one.

### Corrections to the planning documents, found in the real data

- **Three of the 86 "ISBNs" are Amazon ASINs**, not ISBNs: `B07PV188F2`, `B09LZ3RVZD`, `B015EE5N7G`. `CLAUDE.md` says 22 of 86 are ISBN-10; 22 are ten-character strings, of which three are ASINs. Real split: 19 ISBN-10, 64 ISBN-13, 3 not ISBNs at all.
- **`infrastructure.md` §88 is wrong.** It offers "the shared sandbox domain for the first weeks" as an alternative to a verified sending domain. Resend's sandbox delivers only to the account owner's own address, so it cannot serve a multi-user product for a single day, let alone weeks.
- **Author count is 60**, not the 59 or 61 `migration.md` predicted.

### Blocked on the owner

1. `GMAIL_APP_PASSWORD` in `.env` — generate at `https://myaccount.google.com/apppasswords` (the link is gone from the Security page; go to the URL directly).
2. `pg_dump` is not on `PATH`. TASK-022 needs it.
3. TASK-023 needs a Vercel account and dashboard configuration. TASK-024 depends on 023.
4. Real email delivery beyond the owner's own address needs either a verified domain or acceptance that Gmail SMTP is the ceiling.

### Next

Review and merge `task/019`. Then finish `task/007` from its `REPORT.md`. After 007 lands, 008 unblocks, then 013, which is the gate to everything on the distribution path.
