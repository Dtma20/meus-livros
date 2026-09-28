# TASK-034 - Diary view on the profile

## Goal

A profile can be read as a diary - readings grouped by year and month, newest first - as well as a poster grid. Books still being read are marked.

## Context

UX round of 2026-09-27 ([ux-round-2026-09-27.md](../ux-round-2026-09-27.md)), block B.

Letterboxd's Diary is the view that makes a profile feel like a history instead of a collection. `ProfileLogItem` (`shared/schemas/profile.ts`) already has `finished_on`, `finished_precision` (`dia` / `mes` / `ano`), `started_on`, `rating`, `format` and the work. **No server change.**

Today a log with `finished_on = null` (currently reading) looks identical to a finished one in the grid.

## Scope

### Included

- `app/pages/@[handle].vue`: a view toggle, the diary, a "Lendo" badge on grid cards, and copy `Registrar livro` → `Registrar leitura` in this file's empty states.
- New `app/components/profile/DiaryList.vue` (presentational).
- New pure helper `app/utils/diary.ts` (grouping).

### Explicitly excluded

- `BookCard.vue` (TASK-033). The badge goes in the page, next to the existing `private-badge`.
- `server/**`, `shared/**`.
- The page-count footer logic.
- Year-in-review statistics.

## Dependencies

None.

## Expected files/components

```
app/pages/@[handle].vue
app/components/profile/DiaryList.vue   (new)
app/utils/diary.ts                     (new)
tests/unit/diary.test.ts               (new)
```

## Implementation requirements

1. Toggle above the grid: **"Grade" | "Diário"**, `role="tablist"`, state in the query string `?vista=diario` so the view is shareable. Default "Grade".
2. The diary uses the **same filtered set** as the grid (genre, country, decade, visibility tab) but ignores the sort control - it is always chronological, newest first. Hide the sort select while in "Diário".
3. `app/utils/diary.ts` → `groupDiary(logs)`, pure:
   - `finished_on === null` → a first group **"Lendo agora"**.
   - Others grouped by year, then by month (`finished_precision` `dia` or `mes`). `ano` precision goes to a trailing bucket **"Sem mês"** inside its year.
   - Within a bucket: newest `finished_on` first, tie broken by `created_at` desc.
   - Month names in pt-BR from a fixed array, **not** `Intl` (see memory note on ICU hydration mismatches in `docs/agent-workflow.md`).
4. `DiaryList` row: day number when precision is `dia` (else blank column), small cover (`BookCover`, `alt=""`), title linking to `/entrada/<id>`, author, stars (`StarRating`), format. A re-read of the same work appears as its own row.
5. Grid: a log with `finished_on === null` gets a **"Lendo"** badge in the same position style as `private-badge`; when both apply, both show without overlapping.
6. Copy in this file: every `action-label="Registrar livro"` becomes `"Registrar leitura"`.

## Testing requirements

- Unit: `groupDiary` - null first; two logs in March 2024 and one in January 2024 give year 2024 with March before January; an `ano`-precision 2024 log lands in "Sem mês" after the months; ties ordered by `created_at` desc.

## Acceptance criteria

- [ ] `/@<handle>?vista=diario` renders the diary
- [ ] A filter applied in "Grade" still applies after switching to "Diário"
- [ ] A log with `finished_on` null shows under "Lendo agora" and carries a "Lendo" badge in the grid
- [ ] `grep -n "Intl" app/utils/diary.ts` returns nothing
- [ ] No file under `server/` or `shared/` changed

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer)
