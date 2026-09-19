# TASK-013 — Log a book: create, edit, delete

## Goal

The core creative act: record a finished book with a date, a half-star rating and an optional plain-text review.

## Context

**The single most important task in the project.** Everything else is a view over the output of this form. It is the only content-generating feature in the MVP, and the activation metric — friends who log three books in the first month — measures exactly this.

## Scope

### Included

- `POST/PATCH/DELETE /api/logs`, `GET /api/logs/:id`
- `LogForm.vue` with rating input
- `/app/novo` and `/app/entrada/[id]/editar`
- Visibility toggle, format, dates, optional edition

### Explicitly excluded

- The permalink page (TASK-014)
- Likes, comments, want-to-read
- Re-read UI — the schema supports re-reads; no dedicated interface

## Dependencies

- TASK-008, TASK-010

## Expected files/components

```
server/api/logs/index.post.ts
server/api/logs/[id].{get,patch,delete}.ts
server/services/logs.ts
app/components/log/LogForm.vue
app/components/book/RatingInput.vue
app/pages/app/novo.vue
app/pages/app/entrada/[id]/editar.vue
shared/schemas/log.ts
```

## Implementation requirements

1. Flow: search (TASK-010) → pick a work → rate, date, review → save. **The edition picker is collapsed** behind *"li outra edição?"* and most users never open it.
2. `POST /api/logs` accepts `{ work_id, edition_id?, rating?, review?, started_on?, finished_on?, finished_precision?, format?, visibility? }`.
3. **Rating validated server-side**: `min(0.5).max(5).refine(r => r*2 === Math.trunc(r*2))`. A client posting `3.7` gets 400. The database CHECK is the second line of defence.
4. **Review is plain text.** No sanitiser, no HTML parsing. `<` and `>` are stored literally and rendered escaped. Max 10,000 chars.
5. **Timezone.** `finished_on` defaults to the **browser's** local date, not the server's. The server runs UTC; the cohort is UTC−3, so a server-side default records tomorrow for anything logged after 21:00 local — which is exactly when people log books. The server validates against `America/Sao_Paulo` and rejects future dates.
6. `edition_id`, if given, must belong to `work_id`.
7. **No uniqueness check.** Logging the same work twice is a re-read and must succeed.
8. `PATCH`/`DELETE` compare `user_id` to the session **in the query**, not after fetching. A non-owner gets 404, never 403.
9. `visibility` defaults to `'publico'`, with a clearly-labelled toggle.
10. **Draft persistence**: `LogForm` writes to `localStorage` on every change, restores on mount, clears only after a confirmed save. Wrapped in try/catch.

## Data/API changes

- `POST /api/logs` → 201 `{ id }`
- `GET /api/logs/:id` → 200 | 404
- `PATCH /api/logs/:id` → 200 | 404
- `DELETE /api/logs/:id` → 204 | 404

## UX requirements

- Rating: 10 half-star steps, tappable on mobile, keyboard-operable with arrows, `aria-valuenow` set.
- Review: a plain `<textarea>`. No toolbar, no markdown preview, no rich text.
- Date defaults to today (browser local), easily changed.
- Format: three buttons (Físico / Ebook / Áudio), optional.
- Visibility toggle with explicit copy: *"Público — qualquer pessoa com o link pode ver"* / *"Privado — só você"*.
- Submit disabled while in flight, spinner shown.
- **A failed save must never lose typed text.** This is the worst failure the app can have.
- After saving, go straight to the entry permalink with a share affordance.

## Security requirements

- Session required for every mutation.
- Ownership enforced in the query, not after fetch.
- A `privado` entry returns **404** to a second user, never 403 — a 403 confirms the entry exists.
- Rating and date validated server-side regardless of the client.
- Review stored as text; **`v-html` appears nowhere**.
- Rate limit 60 logs/user/hour.

## Testing requirements

- Integration: a valid log is created and read back.
- Integration: `rating: 3.7` → 400. `rating: 6` → 400. `rating: 0.5` and `5` → 201.
- Integration: a future `finished_on` → 400.
- Integration: the same `(user, work)` logged twice → both 201.
- Integration: user B `PATCH`ing user A's log → 404, and the row is unchanged.
- Integration: user B `GET`ting A's `privado` log → 404.
- Integration: an `edition_id` from a different work → 400.
- Integration: a review containing `<script>` is stored verbatim and rendered escaped.
- Component: draft restored after a simulated reload.

## Acceptance criteria

- [ ] An authenticated user can log a work with a rating, a date and a review, and it appears on their profile
- [ ] `rating: 3.7` is rejected with 400 by the server even when the UI is bypassed
- [ ] `rating: 0.5` and `rating: 5.0` are both accepted
- [ ] A log with no rating and no review is accepted (date only)
- [ ] The same work logged twice creates two rows with two permalinks
- [ ] A log created at 22:00 in Brazil records today's Brazilian date, not tomorrow's
- [ ] User B receives 404 for user A's `privado` entry
- [ ] User B receives 404 attempting to edit user A's entry, and nothing changes
- [ ] A review containing `<script>alert(1)</script>` displays that text and executes nothing
- [ ] A failed submission keeps the typed review in the textarea
- [ ] Refreshing mid-compose restores the draft
- [ ] The rating input is fully operable by keyboard

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Time yourself completing the whole flow from "I finished a book" to "it is logged". If it exceeds a minute for a book already in the catalog, simplify — this is the action the entire product depends on.

Draft persistence is not a nice-to-have. Losing a 900-character review to a network blip is the kind of failure that makes someone stop using a product permanently.
