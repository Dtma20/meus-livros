# TASK-022 — Backup workflow and tested restore

## Goal

Automated database dumps, plus one restore that has actually been performed.

## Context

The free tier has **no automated backups**, and the database will hold 13 years of irreplaceable reading history and 56 original reviews. This is the least comfortable part of the zero-cost constraint. An untested backup is a hypothesis, not a backup.

## Scope

### Included

- A GitHub Actions workflow dumping every 3 days
- Artifact upload with 90-day retention
- **A documented, successful restore**
- Restore instructions in the repository

### Explicitly excluded

- Point-in-time recovery (a paid feature)
- Off-platform automated storage — the monthly copy is manual and deliberate

## Dependencies

- TASK-004

## Expected files/components

```
.github/workflows/backup.yml
docs/runbook-restore.md
```

## Implementation requirements

1. Workflow on `schedule: '0 6 */3 * *'` **and** `workflow_dispatch` so it can be run by hand.
2. `pg_dump --format=plain "$DATABASE_URL_DIRECT" | gzip > dump-$(date +%F).sql.gz`.
3. **Use the direct endpoint, not the pooled one** — `pg_dump` needs session state the transaction pooler does not preserve.
4. `DATABASE_URL_DIRECT` lives in GitHub Actions secrets.
5. Upload as a workflow artifact with `retention-days: 90`. **Do not commit dumps to git** — a gzipped dump does not delta-compress, so committing one every three days accumulates dozens of full copies permanently and bloats the repository forever.
6. Fail loudly: a non-zero `pg_dump` exit must fail the workflow, not upload an empty file. Assert the dump is larger than 10 KB before uploading.
7. `docs/runbook-restore.md`: step-by-step restore into a fresh Neon branch, written so it can be followed under stress.
8. **Perform a real restore before marking this done.** Download an artifact, create a scratch branch, restore, and verify the row counts match.
9. Document the two known risks in the runbook:
   - GitHub disables scheduled workflows after 60 days without commits on public repositories. The monthly manual copy is the check for this.
   - Artifacts expire after 90 days. A backup that lives only on the same platform as the source is not really a backup.

## Data/API changes

None.

## UX requirements

None.

## Security requirements

- `DATABASE_URL_DIRECT` is a GitHub secret, never printed, never echoed.
- The dump contains all user data including email addresses. Artifacts inherit repository visibility — **if this repository is public, artifacts are downloadable by anyone with access to the Actions tab.** Verify repository visibility before the first run; if public, move the workflow to a private repository.
- The restore runbook must warn against restoring into production by accident.

## Testing requirements

- Trigger the workflow manually; confirm an artifact is produced and is larger than 10 KB.
- Download it, restore into a scratch Neon branch, and assert `works`, `reading_logs` and `users` counts match production.
- Break the connection string deliberately; confirm the workflow **fails** rather than uploading an empty artifact.

## Acceptance criteria

- [ ] `workflow_dispatch` produces a gzipped dump artifact
- [ ] The artifact is larger than 10 KB
- [ ] A bad connection string fails the workflow and uploads nothing
- [ ] **A restore into a scratch Neon branch has been performed successfully**
- [ ] Post-restore row counts for `works`, `reading_logs` and `users` match the source
- [ ] `docs/runbook-restore.md` exists and was followed verbatim during that restore
- [ ] Repository visibility has been checked and the artifact exposure decision recorded
- [ ] The workflow uses the direct endpoint, not the pooled one
- [ ] No dump file is committed to git

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Do the restore. It is tempting to mark this done once the workflow is green, but a dump that has never been restored has never been shown to contain anything useful.

If the repository is public, the artifact exposure question is not theoretical — the dump contains every user's email address.
