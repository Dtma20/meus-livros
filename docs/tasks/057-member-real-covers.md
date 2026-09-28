# TASK-057 - Member cards show real covers

## Context

Visual-audit round of 2026-09-28. Findings and measurements: [visual-audit-2026-09-28.md](../visual-audit-2026-09-28.md). Agent prompt: [PROMPT-frontend-melhorias.md](../PROMPT-frontend-melhorias.md). Tokens `--danger-text`, `--success`, `--highlight-soft`, `--highlight-glow` and `color-scheme: dark` are already in `tokens.css` (commit 2b4ec2f) - use them, do not edit `tokens.css`. Tasks 049-059 run in parallel; touch only the files listed below.

`/membros` renders four grey initials tiles per member, because `server/services/members.ts:51-53` returns only `cover_url`, while most covers resolve through `ol_cover_id` or `isbn13`, which `BookCover` handles but never receives here. **This task is allowed to change `server/services/members.ts` and `shared/schemas/members.ts`** - the exception to the prompt's "no server" rule.

## Implementation requirements

1. `recent_covers` items gain `ol_cover_id: number | null` and `isbn13: string | null`, taken from the log's edition, falling back to the first edition of the work that has one (same pattern already used for `cover_url` in the same query). Still one query for covers; visibility still via `visibleLogs(viewer)`.
2. `membros.vue` passes both to `BookCover`.
3. Extend `tests/integration/members.test.ts`: a fixture log whose edition has only `isbn13` returns it in `recent_covers`.

## Explicitly excluded

- Anything else in the members page layout.

## Expected files

```
server/services/members.ts
shared/schemas/members.ts
app/pages/membros.vue
tests/integration/members.test.ts
```

## Acceptance criteria

- [ ] For `@MeusLivros`, the 4 recent covers on `/membros` render `<img>` whose `currentSrc` is not a `data:` URI (reviewer measures)
- [ ] Integration test for the isbn-only case passes
- [ ] Private logs still excluded (existing tests)

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
