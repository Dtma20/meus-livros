# TASK-018 — Home page

## Goal

`/` — a landing page for strangers and a ten-entry recent strip for members.

## Context

Deliberately minimal. WhatsApp is already the feed — a real-time activity stream with push notifications and 100% cohort adoption. This strip exists so the signed-in home is not empty, not to compete with the group chat.

## Scope

### Included

- `/` server-rendered
- Anonymous: what the site is + sign-in link
- Authenticated: 10 most recent visible entries
- A prominent "Registrar livro" action

### Explicitly excluded

- Pagination, infinite scroll, cursors
- Follow filtering
- Trending, recommendations, statistics

## Dependencies

- TASK-016

## Expected files/components

```
app/pages/index.vue
server/api/feed/recentes.get.ts
server/services/feed.ts
```

## Implementation requirements

1. Server-rendered.
2. Anonymous: a short pt-BR explanation of what this is, and a sign-in link. No book data — this is an invite-only site and a stranger has no reason to browse.
3. Authenticated: the 10 most recent visible entries, `ORDER BY created_at DESC LIMIT 10`. **No pagination, no cursor, no tab, no infinite scroll.**
4. Each row: cover, title, reader handle, rating, review excerpt, relative date — linking to the permalink.
5. Filter through `visibleLogs(viewer)`.
6. A "Registrar livro" button, prominent, linking to `/app/novo`.
7. Empty state when nobody has logged anything visible: *"Ninguém registrou nada ainda. Seja o primeiro."*
8. OG tags for the site itself.

## Data/API changes

`GET /api/feed/recentes?limit=10` → `200 { entries: [...] }`

## UX requirements

- An authenticated user sees activity immediately, without navigating.
- A stranger understands what the site is in one screen.
- Relative dates in pt-BR ("há 2 dias").
- Mobile-first.

## Security requirements

- Visible entries only, via the helper.
- The anonymous view exposes no book or user data — it is an invite-only product.
- `limit` capped at 10 server-side regardless of the query string.

## Testing requirements

- Integration: anonymous `/` returns 200 and contains no entry data.
- Integration: authenticated `/` shows up to 10 visible entries.
- Integration: privado entries and entries from privado profiles are excluded.
- Integration: `?limit=1000` still returns at most 10.
- Integration: with no visible entries, the empty state renders.

## Acceptance criteria

- [ ] Anonymous `/` returns 200, explains the site, and contains no book or user data
- [ ] Authenticated `/` shows at most 10 entries, newest first
- [ ] Privado entries never appear
- [ ] Entries from privado profiles never appear
- [ ] `?limit=1000` returns at most 10
- [ ] Each entry links to its `/entrada/{id}`
- [ ] With no visible entries, the empty state renders
- [ ] "Registrar livro" is visible without scrolling on a phone

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Resist making this a feed. No pagination, no filters, no tabs. If the ten-row strip turns out to be insufficient, that is a signal worth acting on later — but building for it now is speculative, and the group chat already does this job better.
