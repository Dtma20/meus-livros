# TASK-045 - One wording for 'back to home'

## Context

Frontend round of 2026-09-27. Agent prompt: [PROMPT-frontend-melhorias.md](../PROMPT-frontend-melhorias.md). Runs in parallel with the other tasks 039-048; touch only the files listed below.

The same action has three labels: "Ir para o início" (`app/error.vue`, `livro/[slug].vue`, admin), "Voltar para o início" (`app/pages/entrada/[id].vue:13`, `app/pages/app/entrada/[id]/editar.vue:15`) and "Voltar ao início" (profile, handled by TASK-043). The audit also found two different visual styles for it.

## Implementation requirements

- `entrada/[id].vue` and `editar.vue`: label becomes **"Ir para o início"**.
- Where it is rendered through `EmptyState`, it keeps `EmptyState`'s own button style; where it is a bare link (`editar.vue`), it uses the same `back-link` look the page already has - no new button styles.

## Explicitly excluded

- `@[handle].vue` (TASK-043), `error.vue`, `livro/[slug].vue`, admin page.

## Expected files

```
app/pages/entrada/[id].vue
app/pages/app/entrada/[id]/editar.vue
```

## Acceptance criteria

- [ ] `grep -rn "Voltar para o início" app` returns nothing
- [ ] Both pages still render their not-found state with a link to `/`

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
