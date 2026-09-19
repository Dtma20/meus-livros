# TASK-020 — Empty, error and loading states

## Goal

Give every list and page a deliberate empty, error and loading state.

## Context

The legacy app has **none**: filtering to zero results renders a blank void with a footer reading "0 Páginas Lidas". At launch most states are empty — a new friend's profile has zero books and most searches return nothing — so these are not edge cases. They are the normal first experience.

## Scope

### Included

- `EmptyState`, `ErrorState`, `LoadingSkeleton`
- Applying them across every list and page
- pt-BR copy throughout

### Explicitly excluded

- Illustrations or animation
- A toast/notification system

## Dependencies

- TASK-016, TASK-018

## Expected files/components

```
app/components/ui/{EmptyState,ErrorState,LoadingSkeleton}.vue
(applied across pages)
```

## Implementation requirements

1. `LoadingSkeleton`: a grid of grey cards matching the real card dimensions, so nothing shifts on load. No spinners on full pages.
2. `ErrorState`: a plain-Portuguese message and a retry button. **Never a stack trace or an error code.**
3. `EmptyState`: an icon or glyph, a message, and an action.
4. Required states, each with specific copy:

| Where | Copy | Action |
|---|---|---|
| Profile, no entries (owner) | "Você ainda não registrou nenhum livro." | Registrar livro |
| Profile, no entries (visitor) | "Ainda não registrou nenhum livro." | — |
| Profile, filters match nothing | "Nenhum livro com esses filtros." + names the active filters | Limpar filtros |
| Search, no local results | "Não encontramos esse livro." | **Adicionar à mão** (primary) + Buscar online |
| Open Library unavailable | "Não conseguimos buscar online agora." | Adicionar à mão |
| Work page, no visible logs | "Ninguém registrou esse livro ainda." | Registrar |
| Home, nothing visible | "Ninguém registrou nada ainda. Seja o primeiro." | Registrar livro |
| 404 | "Não encontramos essa página." | Ir para o início |
| 500 | "Algo deu errado. Tente de novo." | Tentar de novo |

5. The search-miss state carries unusual weight — it is the ~60% case for Brazilian editions. **"Adicionar à mão" must be the primary action**, not a secondary link.
6. Fix the legacy footer bug: the page-count footer must not render "0 Páginas Lidas" beside an empty state.

## Data/API changes

None.

## UX requirements

- Every message is in pt-BR and says what to do next.
- No state is a dead end — each offers at least one action.
- Skeletons match real dimensions so the layout does not jump.

## Security requirements

- Error states never expose internals: no stack traces, no database messages, no correlation ids visible to the user (logged server-side only).

## Testing requirements

- Component: each state renders with the right copy and a working action.
- Integration: filtering a profile to zero shows the empty state, names the filters, and clearing restores the grid.
- Integration: a search with no results shows the manual-add action as primary.
- Integration: a forced 500 renders `ErrorState`, and the response body contains no stack trace.

## Acceptance criteria

- [ ] Filtering a profile to zero results shows an empty state naming the active filters
- [ ] "Limpar filtros" from that state restores the full grid
- [ ] The "0 Páginas Lidas" footer never appears beside an empty grid
- [ ] A search with no results shows "Adicionar à mão" as the primary action
- [ ] An Open Library timeout shows its message, never an error page
- [ ] A new user's own profile invites them to register a book
- [ ] A 404 renders pt-BR copy with a link home
- [ ] A forced 500 shows a retry button and no stack trace in the response body
- [ ] Loading skeletons match card dimensions — no layout shift on load

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Write the copy as if talking to a friend, because you are. "Não encontramos esse livro" beats "Nenhum resultado encontrado para a consulta".
