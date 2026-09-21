# Infrastructure and deployment

Three managed services, all free, nothing self-operated.

```
GitHub (source) ──push──> Vercel Hobby (build + SSR, region gru1)
                                │
                                ├──> Neon Postgres (free)
                                └──> Gmail SMTP (free; activation + password-reset codes only)
```

No Docker in production. No VPS. No Kubernetes. No CI runner executing migrations. No staging environment.

---

## 1. Local development

Requires Node 22+ (the host has v24.15.0) and npm 10+.

```bash
npm install
cp .env.example .env     # fill in the values from §2
npm run db:migrate       # applies committed migrations to your Neon branch
npm run dev              # http://localhost:3000
```

**The local database is a Neon branch, not a local Postgres.** Neon free allows 100 projects with 10 branches each, and a branch is a copy-on-write fork created in seconds. This means development runs against the real Postgres version and the real extensions, with no Docker and no "works on my machine" divergence. Branches are disposable — delete and recreate freely.

The one thing that *is* local: `npm run db:studio` (Drizzle Studio) for inspecting rows.

### Scripts

| Script | Does |
|---|---|
| `dev` | Nuxt dev server |
| `build` | Production build |
| `typecheck` | `nuxt typecheck` — must pass before every commit |
| `lint` | ESLint, including the `v-html` and `no-restricted-imports` rules |
| `test` | Vitest |
| `db:generate` | Generate a migration from `schema.ts` diffs |
| `db:migrate` | Apply migrations (uses `DATABASE_URL_DIRECT`) |
| `db:studio` | Drizzle Studio |
| `db:seed:genres` | Seed the 26 genres |
| `migrate:livros` | The one-off `livros.json` import |

---

## 2. Environment variables

| Variable | Where | Notes |
|---|---|---|
| `DATABASE_URL` | local + Vercel | Neon **pooled** endpoint (`-pooler` in the host). Used by the app |
| `DATABASE_URL_DIRECT` | **local only** | Neon direct endpoint. Migrations and `pg_dump` only. Never set on Vercel |
| `BETTER_AUTH_SECRET` | local + Vercel | ≥ 32 random bytes, different per environment |
| `BETTER_AUTH_URL` | local + Vercel | `http://localhost:3000` / the production origin |
| `GMAIL_APP_PASSWORD` | local + Vercel | Google Account App Password for SMTP |
| `EMAIL_FROM` | local + Vercel | Gmail address used as sender |
| `OWNER_EMAIL`, `OWNER_HANDLE`, `OWNER_NAME` | local only | Consumed by `migrate:livros` |

`.env` is gitignored; `.env.example` is committed with placeholders only. Nothing secret may appear in `runtimeConfig.public` — [tasks/024](tasks/024-security-hardening-pass.md) greps the client bundle to prove it.

**Pooled vs direct matters.** Serverless functions must not hold a pool: configure `postgres(url, { max: 1 })` and let Neon's pooler pool. Migrations need session state the pooler does not preserve, so they use the direct endpoint from a laptop.

---

## 3. Production

### Vercel

- Framework preset: Nuxt (auto-detected; Nitro emits the `vercel` build output with no configuration).
- **`regions: ["gru1"]`** in `nuxt.config.ts` — São Paulo. The function-to-database hop stays in-region; getting this wrong adds ~200 ms to every query.
- `NODE_ENV=production`.
- Deploy on push to `main`. Pull requests get preview deployments automatically.

**Licence constraint:** Vercel Hobby is **non-commercial use only**. This project — free, ad-free, 30 friends — qualifies. **If it is ever monetised, Vercel Pro (~US$20/mo) becomes mandatory.** Tracked in [open-questions.md](open-questions.md).

### Neon

- One project, one `main` branch for production.
- Postgres 17. Extensions: `citext`, `unaccent`.
- Autosuspend after 5 minutes idle; **automatic resume in under a second**. This is the reason Neon was chosen over Supabase, whose free tier pauses after 7 days and requires a manual dashboard restore.
- Free tier: 0.5 GB storage, 100 CU-hours/month (≈ 400 h at 0.25 CU), 100 projects × 10 branches.

**Headroom:** 30 users × ~100 books ≈ 3,000 logs plus a catalog of a few thousand works is well under 50 MB against 500 MB, and realistic usage is perhaps 10–20 CU-hours against 100. Roughly 10× headroom on both axes.

### Gmail SMTP

- Sent via Nodemailer over Gmail SMTP (`smtp.gmail.com:465`).
- Authenticated with a Google Account App Password (`GMAIL_APP_PASSWORD`).
- Free tier: 500 emails/day per standard Gmail account. **Signing in sends no email** — only first-access activation and password reset do, so 30 friends produce a handful of messages a month.

---

## 4. Staging: deliberately none

The free tier allows plenty of Neon branches, so a staging environment is *possible*. It is still not built, for two reasons: there is one developer, and Vercel's preview deployments already give a per-PR URL. A staging environment is a second thing to keep in sync and a second place for configuration to drift.

**Preview deployments point at a Neon branch, not production.** Set `DATABASE_URL` for the Preview environment separately in Vercel. Getting this wrong means a preview deploy writing to real data — check it explicitly during [tasks/023](tasks/023-deploy-to-vercel.md).

---

## 5. Migrations

```bash
# 1. edit server/db/schema.ts
npm run db:generate      # writes SQL into server/db/migrations/
git add server/db/migrations && git commit
npm run db:migrate       # applies to production, from the laptop
git push                 # then deploy the code
```

**Rules**

- Migrations are applied **manually, from the maintainer's machine, before the code that needs them is deployed.** Not from CI. A solo maintainer with one environment does not need a schema deployment pipeline, and an automated migration running against production on every push is a much larger foot-gun than a forgotten command.
- Never edit an applied migration; add a new one.
- Generated SQL is reviewed before commit. `drizzle-kit` occasionally proposes a drop where a rename was meant — that review is the safety net.
- Three things are hand-written SQL because Drizzle cannot express them: the `f_unaccent` function, the generated `search_text` column, and the partial unique index on `editions.isbn13`.

---

## 6. Backups

The free tier has **no automated backups**. This is the least comfortable part of the zero-cost constraint: the database will hold 13 years of irreplaceable reading history and 56 original reviews.

**One GitHub Actions workflow, every 3 days:**

```yaml
on:
  schedule: [{ cron: '0 6 */3 * *' }]
  workflow_dispatch:
```

1. `pg_dump --format=plain "$DATABASE_URL_DIRECT" | gzip > dump.sql.gz`
2. Upload as a workflow artifact with 90-day retention.

**Deliberate choices**

- **Artifacts, not a git commit.** A gzipped dump does not delta-compress, so committing one every few days accumulates dozens of full copies permanently and bloats the repository forever.
- **The direct endpoint**, not the pooled one — `pg_dump` needs session state.
- **Also copy one dump off GitHub by hand**, monthly, to a personal drive. Artifacts expire in 90 days; a backup that only exists on the same platform as the source is not really a backup.
- **A restore must be tested once, into a scratch Neon branch, before launch.** An untested backup is a hypothesis. [tasks/022](tasks/022-backup-workflow.md) is not done until a restore has succeeded.

**Note:** GitHub disables scheduled workflows after 60 days without commits on public repositories. If development goes quiet, the backup stops silently. Either keep the workflow in a private repository, or accept the risk and check it on the monthly manual copy — that check is the reason the manual copy exists.

---

## 7. Deployment and rollback

**Deploy:** push to `main`. Vercel builds and promotes.

**Rollback:** Vercel keeps every deployment; promoting a previous one is instant and is the first response to a bad deploy.

**A code rollback does not roll back the database.** This is the operational trap. Therefore:

- Migrations must be **backward compatible with the previous release**. Add a column, deploy code that writes it, *then* make it `NOT NULL` in a later migration. Never add a `NOT NULL` column and the code that populates it in the same deploy.
- Never drop a column in the same release that stops using it. Two releases minimum.

At this scale a bad migration is recoverable from a 3-day-old dump with acceptable loss, but the discipline costs nothing and avoids needing that.

---

## 8. Domain, SSL, observability

- A `.vercel.app` subdomain is sufficient for launch. A custom domain (~R$40/year) is optional and, being a cost, is the only thing in this plan that is not free — it is deferred, and recorded in [open-questions.md](open-questions.md).
- SSL is automatic and not configurable.

**Observability — the minimum, deliberately:**

| Need | Tool |
|---|---|
| Errors | Vercel's runtime logs. **No Sentry** at launch — 30 users generate few enough errors to read by hand |
| Logs | `console.error` with a correlation id. Structured JSON, no PII |
| Database | Neon's dashboard: storage, CU-hours, slow queries |
| Uptime | None. A friend reporting "tá fora do ar" in the group chat is a sufficient monitor for 30 people |
| Product | `SELECT` against `reading_logs` and `search_misses` |

Add Sentry when hand-reading logs stops working — that is a real signal, not a hypothetical.

---

## 9. Cost

| Stage | Vercel | Neon | Gmail SMTP | Domain | **Total** |
|---|---|---|---|---|---|
| Development | R$0 | R$0 | R$0 | — | **R$0** |
| Launch (~30 users) | R$0 | R$0 | R$0 | R$0–40/yr | **R$0** |
| ~1,000 users | R$0 | R$0 | R$0 | R$40/yr | **≈R$0** |
| ~10,000 users | ~US$20 | ~US$19 | ~US$20 | R$40/yr | **≈US$60/mo** |

**Assumptions.** ~30 users ≈ 2,000 page views/month ≈ 0.2% of Vercel's 1M invocations. 1,000 users ≈ 70,000 views/month — still inside the free tier on every axis, though Neon storage would be worth watching. 10,000 users is where all three tiers break at once and the Hobby licence almost certainly no longer applies.

**What would cost money before scale does**

1. **Monetisation** — Vercel Pro becomes mandatory the day the project earns anything, at any traffic level.
2. **A custom domain** — the only real line item at launch.
3. **Backups you actually trust** — currently free via GitHub artifacts, but Neon Launch (~US$5/mo) adds point-in-time recovery and removes the 60-day-workflow risk entirely. **The most defensible first dollar this project would spend.**
