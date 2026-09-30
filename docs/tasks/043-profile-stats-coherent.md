# TASK-043 - Profile numbers that agree with each other

## Context

Frontend round of 2026-09-27. Agent prompt: [PROMPT-frontend-melhorias.md](../agent-prompts/PROMPT-frontend-melhorias.md). Runs in parallel with the other tasks 039-048; touch only the files listed below.

On `/@handle` the header shows `Livros / Autores / Países` for the whole library while the footer shows `Páginas Lidas / Média p/ Livro` for the filtered set, so a filtered screen can read "86 livros" and "0 páginas lidas" at once (`docs/frontend-audit.md`, P1). And `calculateStats` in `app/composables/useBookFilters.ts` adds `edition.page_count` for **every** log, including books still being read (`finished_on === null`), so "Páginas Lidas" counts pages nobody has read yet.

## Implementation requirements

- `calculateStats`: `totalPages` and `averagePages` count only logs with `finished_on !== null`; `averagePages` divides by that finished count (0 when none).
- Header stats follow the active filters (same source as the footer) and, when a filter is active, show a small "(filtros ativos)" marker like the footer already does.
- The footer is not rendered when the filtered set is empty (the empty state already covers it).
- Copy in this page: `action-label="Voltar ao início"` → `"Ir para o início"` (matches `app/error.vue`).

## Explicitly excluded

- Server stats (`server/services/profiles.ts`). The reading map. `FilterBar.vue` (TASK-042). Diary.

## Expected files

```
app/composables/useBookFilters.ts
app/pages/@[handle].vue
tests/unit/use-book-filters.test.ts
```

## Acceptance criteria

- [ ] Test: two logs with 100 and 300 pages, the 300 one unfinished → `totalPages` 100, `averagePages` 100
- [ ] Test: no finished logs → `totalPages` 0, `averagePages` 0
- [ ] With a filter active, header `Livros` equals the number of cards in the grid
- [ ] Zero results → no "Páginas Lidas" in the DOM
- [ ] `grep -n "Voltar ao início" 'app/pages/@[handle].vue'` returns nothing

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
