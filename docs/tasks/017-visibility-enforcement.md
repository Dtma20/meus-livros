# TASK-017 — Visibility enforcement and tests

## Goal

Centralise the público/privado rule in one helper, and prove it holds with integration tests.

## Context

The one security property this product genuinely must get right. Everything else degrades gracefully; a visibility leak means a friend's private reading showed up somewhere it should not have, and that cannot be undone.

## Scope

### Included

- `server/utils/visibility.ts`
- Refactoring every log read to use it
- The ESLint boundary rule
- Four mandatory integration tests

### Explicitly excluded

- RLS — see [architecture.md](../architecture.md) §3.6
- Blocking/muting
- Any third visibility level

## Dependencies

- TASK-013

## Expected files/components

```
server/utils/visibility.ts
tests/integration/visibility.test.ts
eslint.config.mjs   (extended)
```

## Implementation requirements

1. **The rule, and it is the only one:**
   > A reading log is visible to a viewer if `log.user_id = viewer.id`, **or** (`log.visibility = 'publico'` **and** `author.profile_visibility = 'publico'`).
2. `visibleLogs(viewer: Viewer)` returns a Drizzle condition. **`Viewer` is a required, non-optional parameter** — `visibleLogs()` with no argument must be a compile error, so "I forgot the viewer" cannot ship.
3. Refactor every existing query that reads `reading_logs` to use it: profile, work page, entry permalink, home strip.
4. ESLint `no-restricted-imports` forbids the raw `db` handle outside `server/services/**`.
5. A privado resource returns **404**, never 403, everywhere.
6. Aggregates (counts, averages) use the same condition. An inflated count leaks existence.

## Data/API changes

None — a refactor.

## UX requirements

None. Behaviour must not change for público content.

## Security requirements

This task *is* the security requirement. The four tests below are mandatory and blocking for launch.

## Testing requirements

Four integration tests, non-negotiable:

1. **Owner sees own privado.** User A creates a privado log; A's profile, the work page and the permalink all show it.
2. **Second user does not.** User B sees neither the entry nor its contribution to any count or average; the permalink returns 404.
3. **Anonymous does not.** Same as B, unauthenticated.
4. **Privado profile hides público entries.** User A sets `profile_visibility = 'privado'` with a `publico` entry; B and anonymous see neither the profile (404) nor the entry (404), and the entry does not appear on the work page or the home strip.

Plus: a test that a query written without the helper fails lint, and a test that every route reading `reading_logs` calls it.

## Acceptance criteria

- [ ] All four integration tests pass
- [ ] `visibleLogs()` called with no argument is a TypeScript error
- [ ] `grep -rn "from.*server/db" app/ server/api/` returns nothing (only `server/services/**` may import it)
- [ ] A privado entry returns 404, never 403, on every surface
- [ ] The work-page average excludes entries invisible to the viewer
- [ ] Profile counters exclude entries invisible to the viewer
- [ ] The home strip excludes privado entries and entries from privado profiles
- [ ] Importing `db` from a route file fails `npm run lint`
- [ ] Every query touching `reading_logs` uses the helper (verified by inspection and recorded in the PR)

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Write the four tests **first**, watch them fail, then refactor until they pass. This is the one place in the project where test-first is clearly worth it.

Test 4 is the one people forget. A público entry on a privado profile must be invisible — otherwise switching your profile to private does not actually hide anything, which is the opposite of what the setting promises.
