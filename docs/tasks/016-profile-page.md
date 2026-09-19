# TASK-016 — Profile page

## Goal

`/@{handle}` — the poster grid, filters, stat counters and recent entries. The object people paste into the group chat.

## Context

For a diary product the profile *is* the product. This is also where most of the existing `legacy/index.html` finally lands: the grid, the filters, the sorting and the stat header all come from there.

## Scope

### Included

- `/@[handle]` server-rendered with OG
- Poster grid of visible entries
- Genre / country / decade filters, sorting
- Stat counters: books, authors, countries, pages
- Bio and display name

### Explicitly excluded

- The map (TASK-025)
- Following, statistics page, year-in-review

## Dependencies

- TASK-013

## Expected files/components

```
app/pages/@[handle].vue
app/components/profile/{FilterBar,StatBox}.vue
app/composables/useBookFilters.ts
server/services/profiles.ts
```

## Implementation requirements

1. Server-rendered. A `privado` profile returns **404** to everyone except its owner.
2. Entries filtered through `visibleLogs(viewer)`.
3. Grid uses `BookCard`/`BookGrid` from TASK-005.
4. Port `FilterBar` from `legacy/index.html:101-142` — genre, country, decade — and **fix the known bug**: `filterCountry` initialises to `null` while the reset option is `""`, so the select renders blank on first load.
5. Port sorting from `legacy/index.html:279-320` (6 modes) and **keep the stable tiebreak**. Use `created_at` in place of `original_index`; TASK-019 encodes reading order there specifically so this ordering is preserved.
6. Stats: books, unique authors, unique countries, total pages, average pages. **Header counters are global; footer counters follow the active filters** — the existing app does this inconsistently without saying so. Label them so it is obvious which is which.
7. Country names come from `authors.country_code` rendered with `Intl.DisplayNames('pt-BR')` — the existing app leaks English names into a Portuguese UI via a hardcoded map.
8. Filtering and sorting operate on already-loaded data, client-side, no refetch.
9. OG: display name, book count, a cover collage or the most recent cover.
10. Empty state for a profile with no entries: *"Ainda não registrou nenhum livro."*

## Data/API changes

Adds `GET /api/users/:handle` returning profile + visible logs.

## UX requirements

- Loads fast enough to feel instant with ~200 entries.
- Filters visibly reflect state; a reset button appears only when a filter is active (the existing app gets this right — keep it).
- Zero-result filtering shows an empty state naming the filters and offering to clear them.
- Owner sees their own privado entries, visually marked as private.
- Mobile: 2 columns, filters collapse into a row that scrolls.

## Security requirements

- `privado` profile → 404 for everyone but the owner.
- Entries via `visibleLogs(viewer)` only.
- Privado entries excluded from counters for other viewers — an inflated book count leaks their existence.
- `display_name` and `bio` render escaped.

## Testing requirements

- Integration: a profile with 5 público + 2 privado shows 5 anonymously, 7 to the owner.
- Integration: stat counters match the visible set for each viewer.
- Integration: a privado profile returns 404 anonymously, 200 to its owner.
- Integration: an unknown handle returns 404.
- Component: the country filter renders "Todos os Países" on first load, not blank.
- Component: sorting by "Lidos Recentemente" with equal dates falls back to `created_at`.

## Acceptance criteria

- [ ] `/@{handle}` renders the poster grid server-side
- [ ] A profile with 5 público and 2 privado entries shows 5 to a stranger and 7 to the owner
- [ ] The book counter shows 5 to the stranger, not 7
- [ ] A `privado` profile returns 404 to a stranger and 200 to its owner
- [ ] The country filter shows "Todos os Países" on first paint
- [ ] Filtering to zero results shows an empty state naming the active filters
- [ ] Countries render in Portuguese ("Reino Unido", not "United Kingdom")
- [ ] All six sort modes work and are stable for equal keys
- [ ] The owner's privado entries are visually marked
- [ ] With 200 entries the page is interactive in under 2.5s on a phone over 4G
- [ ] OG tags present and absolute

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

This is where the 86 migrated books become visible, so it is the most satisfying task to finish. It is also the largest port from the legacy file — budget 4 hours and keep `legacy/index.html` open.

The visible-count rule is subtle and worth a test: if a stranger sees "7 livros" but only 5 cards, they have learned that two private entries exist.
