# TASK-036 - Activity page with pagination

## Goal

"Atividade recente do grupo" stops at 10 rows. Add a full, cursor-paginated activity page and link to it from the home.

## Context

UX round of 2026-09-27 ([ux-round-2026-09-27.md](../reports/ux-round-2026-09-27.md)), block B.

`server/services/feed.ts` → `getRecentFeed(viewer, limit)` caps at 10 and `GET /api/feed/recentes` requires a session. The backlog item `SOC-7` asked for cursor pagination "from day one (cheap now, a rewrite later)" and for the feed to be **a tab, not the homepage**.

## Scope

### Included

- `server/services/feed.ts`: new `getFeedPage(viewer, { cursor, limit })`. `getRecentFeed` keeps its behaviour (it may delegate).
- New route `GET /api/feed` (`server/api/feed/index.get.ts`).
- `shared/schemas/feed.ts`: cursor query schema and `nextCursor` on the response type.
- New page `app/pages/atividade.vue`.
- `app/pages/index.vue`: a "Ver toda a atividade →" link in the feed section header, and copy `Cadastrar livro` / `Registrar livro` → `Registrar leitura` in this file.

### Explicitly excluded

- Likes, comments, filters, follows.
- Nav link to `/atividade` (TASK-037).
- Changing `/api/feed/recentes`.

## Dependencies

None.

## Expected files/components

```
server/services/feed.ts
server/api/feed/index.get.ts   (new)
shared/schemas/feed.ts
app/pages/atividade.vue        (new)
app/pages/index.vue            (link + two labels)
tests/integration/feed.test.ts (extend)
```

## Data/API changes

`GET /api/feed?cursor=<opaque>&limit=<1..30, default 20>` → `{ entries: FeedEntry[], nextCursor: string | null }`

## Implementation requirements

1. Keyset pagination on `(reading_logs.created_at desc, reading_logs.id desc)`. The cursor is base64url of `{ t: ISO timestamp, id: uuid }`; a malformed cursor → 400 `cursor_invalido`. No `OFFSET`.
2. Fetch `limit + 1` rows to decide `nextCursor`.
3. Every read goes through `visibleLogs(viewer)` exactly as `getRecentFeed` does.
4. Route: `requireSessionUser`, `defineApiHandler`, `parseOrThrow`.
5. Page `/atividade`: `definePageMeta({ layout: 'app', middleware: 'auth' })`, title "Atividade do grupo". Reuse the row markup of the home feed (extract it into `app/components/feed/FeedItem.vue` and use it from both `index.vue` and `atividade.vue`). A **"Carregar mais"** button appends the next page; hidden when `nextCursor` is null. Client fetches get `timeout` and `retry: 0`.
6. Empty / error / loading states from `app/components/ui/`.

## Security requirements

- Private logs never appear, including on later pages.
- Anonymous → 401.

## Testing requirements

Integration (fixtures via `removeFixtures(MARKER)`, 30 s timeout, scoped to fixture rows): create 3 visible fixture logs with distinct `created_at`; `limit=2` returns the 2 newest and a cursor; following the cursor returns the third; a private fixture log never appears; malformed cursor → 400.

## Acceptance criteria

- [ ] `GET /api/feed?limit=2` returns 2 entries and a non-null `nextCursor` when more exist
- [ ] Following `nextCursor` returns no entry already seen
- [ ] `grep -n "offset" server/services/feed.ts` returns nothing
- [ ] Home feed section links to `/atividade`
- [ ] `/atividade` "Carregar mais" appends entries and disappears at the end

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer)
