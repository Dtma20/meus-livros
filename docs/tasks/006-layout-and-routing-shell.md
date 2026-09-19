# TASK-006 — Layouts and routing shell

## Goal

Create the two layouts and stub every MVP route so navigation exists end to end.

## Context

Establishes the route table before any page has content, so later tasks fill pages rather than inventing URLs. Route shapes are public commitments — `/@handle` and `/entrada/{id}` get pasted into a group chat and must not change afterwards.

## Scope

### Included

- `default.vue` and `app.vue` layouts
- Stub pages for all routes in [frontend.md](../frontend.md) §1
- Auth middleware stub (redirect only)
- 404 page

### Explicitly excluded

- Page content (later tasks)
- Real auth (TASK-007)
- OG tags (TASK-014)

## Dependencies

- TASK-005

## Expected files/components

```
app/layouts/{default,app}.vue
app/pages/index.vue
app/pages/@[handle].vue          # or users/[handle].vue with a route rule
app/pages/livro/[slug].vue
app/pages/entrada/[id].vue
app/pages/entrar.vue
app/pages/app/{bem-vindo,novo,perfil}.vue
app/pages/app/entrada/[id]/editar.vue
app/error.vue
app/middleware/auth.ts
```

## Implementation requirements

1. `default.vue`: header with the site name linking to `/`, a container matching `legacy/styles.css .container`, and a footer carrying the Open Library attribution line (*"Dados bibliográficos parcialmente do Open Library"*).
2. `app.vue`: extends default, adds authenticated nav (Registrar livro / Perfil / Sair).
3. The `/@handle` route needs care — `@` is not a standard dynamic-segment character. Either a `~/users/[handle].vue` page with a route rule rewriting `/@:handle`, or a catch-all that matches the `@` prefix. **Verify the chosen approach actually resolves `/@diogo` before moving on**; this is the most-shared URL in the product.
4. `auth.ts` middleware redirects unauthenticated users from `/app/**` to `/entrar?next=<path>`. It may read a stub session until TASK-007.
5. Every stub page renders its own name and any route params, so routing is visibly working.
6. `error.vue` handles 404 and 500 with pt-BR copy and a link home. Never shows a stack trace.
7. `robots.txt` with `Disallow: /app/`. No sitemap — SEO is explicitly out of scope.

## Data/API changes

None.

## UX requirements

- All copy in pt-BR.
- Header navigation works on a phone.
- A 404 is a normal page, not a crash.

## Security requirements

- `/app/**` is unreachable without a session, enforced by middleware — not by hiding links.
- `error.vue` must not render error internals in production.

## Testing requirements

- A route test asserting each stub path returns 200 (or 302 for `/app/**` when unauthenticated).
- A test asserting `/@diogo` resolves and exposes `handle === 'diogo'`.

## Acceptance criteria

- [ ] `/`, `/livro/x`, `/entrada/x`, `/entrar` all return 200
- [ ] `/@diogo` returns 200 and the page receives `handle = 'diogo'`
- [ ] `/app/novo` unauthenticated returns a redirect to `/entrar?next=/app/novo`
- [ ] `/rota-inexistente` renders `error.vue` with pt-BR copy, status 404
- [ ] `/robots.txt` contains `Disallow: /app/`
- [ ] The footer contains the Open Library attribution
- [ ] Every stub page renders under `default` or `app` layout as appropriate

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Settle the `/@handle` routing here. Changing it later breaks every link already shared in the WhatsApp group, which is precisely the thing this product is built around.
