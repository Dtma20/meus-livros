# TASK-047 - Diary without redundant 'Sem mês' headings

## Context

Frontend round of 2026-09-27. Agent prompt: [PROMPT-frontend-melhorias.md](../PROMPT-frontend-melhorias.md). Runs in parallel with the other tasks 039-048; touch only the files listed below.

All 86 migrated readings have year precision, so in `app/components/profile/DiaryList.vue` every year renders a "2026" heading followed by a "Sem mês" heading followed by the table: one useless heading per year.

## Implementation requirements

- When a year's only bucket is "Sem mês", do not render the month heading; the year heading is enough.
- When a year has real months and also a "Sem mês" bucket, keep "Sem mês" as the last heading (current behaviour).
- The "Lendo agora" group is unchanged.

## Explicitly excluded

- `app/utils/diary.ts` grouping logic (only the component decides what to render). The profile page.

## Expected files

```
app/components/profile/DiaryList.vue
tests/unit/diary.test.ts
```

## Acceptance criteria

- [ ] A year with only year-precision logs renders no `.diary-month-title`
- [ ] A year with March + year-only logs renders "Março" then "Sem mês"
- [ ] Existing diary tests still describe the same behaviour (update only what this change invalidates)

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
