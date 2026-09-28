# TASK-066 - Who may delete an edition

## Context

Security round of 2026-09-28, finding **M-2** of the pre-deploy review. `deleteEdition` (`server/services/catalog.ts`) checks only that the edition exists. Any signed-in member can `DELETE /api/editions/<id>` for any edition, including one another member's reading points at; `reading_logs.edition_id` is `onDelete: 'set null'`, so that reading silently loses its cover and page count (stats, reading progress). Commit `648cfdc` opened catalog **editing** to every member with `updated_by` as the audit trail; deletion leaves no trail and can be looped over the whole catalog.

Reviewer's decision (2026-09-28, owner delegated): an edition may be deleted by

- an admin (`users.is_admin`), always; or
- its creator (`editions.created_by`), only while **no reading by another user** references it.

Everyone else gets `403`. An edition is public catalog data, so a 403 reveals nothing (the 404-not-403 rule is for private resources).

## Implementation requirements

1. `deleteEdition(editionId, userId)`: load the edition with `created_by`, load the requesting user's `is_admin`, count `reading_logs` with `edition_id = editionId AND user_id <> userId`. Apply the rule above. Refusal: `403 { error: 'sem_permissao', message: 'Só quem cadastrou esta edição pode excluí-la, e só enquanto ninguém mais a usa em uma leitura.' }`.
2. Missing edition stays `404 nao_encontrado`.
3. The existing `logger.info` for a deletion also records whether the deleter was the creator or an admin, and how many readings (the requester's own) were detached.
4. `app/components/book/EditionEditor.vue` already shows `data.message` from a failed request (line ~238); confirm that the 403 message reaches the screen. Do not change the component unless it does not.

## Explicitly excluded

- `deleteWork` (finding B-2 is recorded as an accepted risk, not changed). `updateEdition`. Soft delete, undo, or a deletion history table.

## Expected files

```
server/services/catalog.ts
tests/integration/catalog.test.ts   (or work-edit.test.ts, whichever already covers deleteEdition - check)
```

## Acceptance criteria

- [ ] Integration: member B deletes an edition created by member A → 403 `sem_permissao`, edition still exists.
- [ ] Integration: A deletes their own edition used only by their own reading → 204; the reading's `edition_id` is now NULL.
- [ ] Integration: A deletes their own edition used by B's reading → 403.
- [ ] Integration: an admin deletes B's edition used by A's reading → 204.
- [ ] Integration: unknown id → 404.
- [ ] The first case fails on today's code.

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` pass (run by the reviewer, not the agent)
