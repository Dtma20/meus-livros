# TASK-042 - Filters fit on a phone

## Context

Frontend round of 2026-09-27. Agent prompt: [PROMPT-frontend-melhorias.md](../PROMPT-frontend-melhorias.md). Runs in parallel with the other tasks 039-048; touch only the files listed below.

Below 640px `app/components/profile/FilterBar.vue` puts genre, country, decade, sort and "Limpar" in one `nowrap` / `min-width: max-content` strip: 791px inside 341px, so a phone sees one and a half controls and the reset button is the last thing off-screen (`docs/frontend-audit.md`, P1).

## Implementation requirements

- Below 640px: a 2-column grid - row 1 genre | country, row 2 decade | sort (sort keeps its "Ordenar" label visually or as `aria-label`). No horizontal scroll inside the bar.
- When `hasActiveFilters`, the reset button spans both columns under the grid, full width, ≥ 44px tall.
- Selects ≥ 44px tall on phones. Long option labels ellipsize inside the select, never widen the grid.
- ≥ 640px layout unchanged.
- Props, `v-model` names and the `reset` emit unchanged (`useBookFilters` keeps `""` as the empty value).

## Explicitly excluded

- `useBookFilters.ts`, the profile page, the sort options themselves.

## Expected files

```
app/components/profile/FilterBar.vue
tests/unit/profile-components.test.ts   (extend) or a new filter-bar test
```

## Acceptance criteria

- [ ] `grep -n "max-content\|nowrap" app/components/profile/FilterBar.vue` returns nothing inside the `max-width: 640px` block
- [ ] At 375px the bar's `scrollWidth` equals its `clientWidth` (reviewer checks in the browser)
- [ ] With an active filter the reset button renders and has `min-height` ≥ 44px on phones
- [ ] All four selects still emit `update:*` (existing or new test)

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
