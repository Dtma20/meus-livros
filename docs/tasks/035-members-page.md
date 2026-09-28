# TASK-035 - Members page

## Goal

A member can see who else is in the group and open their profiles.

## Context

UX round of 2026-09-27 ([ux-round-2026-09-27.md](../ux-round-2026-09-27.md)), block B.

Today nobody can discover anyone: there is no user list and no user search, and a profile is reachable only through a pasted link or a feed row. With ~30 members, a plain list replaces follows, search and suggestions at once.

## Scope

### Included

- New service `server/services/members.ts` → `listMembers(viewer)`.
- New route `GET /api/members` (session required, same stance as `/api/feed/recentes`).
- New shared type `shared/schemas/members.ts`.
- New page `app/pages/membros.vue`.

### Explicitly excluded

- Any nav link to the page (TASK-037).
- Follows, search of users, pagination.
- Changes to `server/db/schema.ts` or existing services.

## Dependencies

None.

## Expected files/components

```
server/services/members.ts        (new)
server/api/members/index.get.ts   (new)
shared/schemas/members.ts         (new)
app/pages/membros.vue             (new)
tests/integration/members.test.ts (new)
```

## Data/API changes

`GET /api/members` → `{ members: MemberView[] }`

```ts
interface MemberView {
  handle: string
  display_name: string
  bio: string | null
  visible_log_count: number        // logs this viewer can see
  last_activity_at: string | null  // max(created_at) of those logs
  recent_covers: Array<{ work_title: string, cover_url: string | null }> // up to 4, newest first
}
```

## Implementation requirements

1. `listMembers(viewer: Viewer)`: every user with `profile_visibility = 'publico'`, **plus the viewer themself** even if private. Counts, last activity and covers come **only from `visibleLogs(viewer)`** (`server/services/visibility.ts`) - a private log must not be counted.
2. Order: `last_activity_at` desc nulls last, then `display_name`.
3. Route: `requireSessionUser`, `defineApiHandler`; no query params.
4. Page: `definePageMeta({ layout: 'app', middleware: 'auth' })`, title "Membros". A responsive grid of member cards: display name, `@handle`, bio clamped to 2 lines, "N leituras", up to four mini covers (`BookCover`, `alt=""`, `cover_url` null falls back as `BookCover` already does). The whole card links to `/@<handle>` (a single `<a>`, nothing interactive inside).
5. Empty, error and loading states with `EmptyState` / `ErrorState` / `LoadingSkeleton`. Empty copy: "Ninguém por aqui ainda."
6. Cover URLs: the service returns the edition or work `cover_url` as stored; do not build Open Library URLs server-side.
7. **No N+1:** at most three queries regardless of member count.

## Security requirements

- A user with a private profile never appears to another viewer.
- A private log never contributes to `visible_log_count`, `last_activity_at` or `recent_covers`.
- Anonymous request → 401 with the standard error shape.

## Testing requirements

Integration (`describe.skipIf(!process.env.DATABASE_URL)`, fixtures via `removeFixtures(MARKER)` from `tests/integration/fixtures.ts`, 30 s timeout, assertions scoped to fixture rows):

- a private-profile user is absent for another viewer and present for themself;
- a private log is not counted;
- anonymous `GET /api/members` → 401.

## Acceptance criteria

- [ ] `GET /api/members` without session → 401
- [ ] Private profile absent for others, present for self
- [ ] Private logs excluded from count, last activity and covers
- [ ] `/membros` renders a card per member linking to `/@<handle>`
- [ ] `grep -n "from '../db'" server/services/members.ts` matches and no file outside `server/services/` imports `db`

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer)
