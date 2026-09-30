# TASK-029 - Search first, then register the reading

## Goal

`/app/novo` starts with a search of the shared catalog. Picking a result opens the log form for that book. Adding a new work is the fallback, and it also ends on the log form.

## Context

UX round of 2026-09-27 ([ux-round-2026-09-27.md](../reports/ux-round-2026-09-27.md)), block A.

Today the core loop only works for books you added yourself:

- `/app/novo` opens straight on `AddBookForm` (tab "Cadastrar livro"). There is no way to search the catalog from it; `LogForm`'s own search is hidden by `disable-change-book`.
- `novo.vue:64` passes `return-to="/"`, and `AddBookForm.vue:963-968` and `:997-1002` treat `'/'` specially: after creating a work, **or after "É este livro" on a duplicate warning**, the user lands on `/` with no `work_id`. A book someone else added is effectively impossible to log.

The `?work_id=` branch of `novo.vue` already loads the work and renders `LogForm` with it. Reuse it.

## Scope

### Included

- `app/pages/app/novo.vue`: new default tab and flow.
- `app/components/search/AddBookForm.vue`: remove the `'/'` special case so every exit goes to `${returnTo}?work_id=<id>`.
- `app/components/log/LogForm.vue`: create-mode submit label `Registrar livro` → `Registrar leitura`. Nothing else in this file.
- Tests that assert the changed copy on `/app/novo` (`tests/unit/routes.test.ts:334` area).

### Explicitly excluded

- **Do not modify `app/components/search/SearchBox.vue`.** Use it through its existing props (`navigateOnSelect`, `initialQuery`) and its `select` event. If it cannot do something you need, report it.
- `/app/livro/novo` page.
- `app/layouts/app.vue` (TASK-028).
- Any server change.

## Dependencies

None.

## Expected files/components

```
app/pages/app/novo.vue
app/components/search/AddBookForm.vue
app/components/log/LogForm.vue        (one label)
tests/unit/routes.test.ts             (copy assertions for /app/novo only)
```

## Implementation requirements

1. Tabs on `/app/novo` without `work_id`, in this order: **"Buscar no catálogo"** (default), **"Adicionar livro novo"**, **"Importar JSON"**. Query values `?tab=` : none / `novo` / `json` (keep accepting `importar`).
2. "Buscar no catálogo" renders `<SearchBox :navigate-on-select="false" @select="...">`, autofocused on desktop. On `select`, `router.push({ query: { work_id: work.id } })` - the existing `work_id` branch then shows `LogForm`. Use `push`, not `replace`, so Back returns to the search.
3. Copy above the search: title **"Registrar leitura"**, description "Procure o livro no catálogo do grupo. Se ninguém cadastrou ainda, adicione-o."
4. "Adicionar livro novo" renders `AddBookForm hide-header return-to="/app/novo"`. After creating a work, or choosing "É este livro", the user lands on `/app/novo?work_id=<id>`.
5. In the `work_id` branch, the back link reads **"← Escolher outro livro"** and goes to `/app/novo`.
6. `AddBookForm`: delete the `target === '/'` branches in both functions; always append `work_id`. Keep the default `returnTo: '/app/novo'`.
7. Page `<title>` follows the active tab.

## UX requirements

- The first thing a member sees after "Registrar leitura" is a search field with the cursor in it (desktop).
- No path out of this page ends on `/` without the book.

## Testing requirements

- Unit: `/app/novo` default tab renders the search and the three tab labels.
- Unit: `AddBookForm` with `returnTo="/app/novo"` navigates to `/app/novo?work_id=<id>` after "É este livro" (stub `navigateTo`, see the `vi.hoisted` block in `tests/unit/routes.test.ts`).

## Acceptance criteria

- [ ] `grep -n "target === '/'" app/components/search/AddBookForm.vue` returns nothing
- [ ] `/app/novo` default tab shows `SearchBox`; selecting a result shows `LogForm` for that work
- [ ] Creating a work from "Adicionar livro novo" ends on `/app/novo?work_id=<new id>`
- [ ] "É este livro" ends on `/app/novo?work_id=<existing id>`
- [ ] LogForm create-mode button reads "Registrar leitura"
- [ ] `SearchBox.vue` is unchanged (`git diff --stat` does not list it)

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer)
