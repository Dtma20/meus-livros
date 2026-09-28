# TASK-030 - Book page as the hub

## Goal

`/livro/[slug]` becomes the place you act from, the way a Letterboxd film page is: a clear "Registrar leitura" action, your own readings of it, a rating distribution, and what people wrote before the edition bookkeeping.

## Context

UX round of 2026-09-27 ([ux-round-2026-09-27.md](../ux-round-2026-09-27.md)), block B.

Today (`app/pages/livro/[slug].vue`):

- No action to log the book. The empty state's "Registrar" goes to `/app/novo` **without** the book (`:119`).
- `userLog` (`:303-306`) finds only the first of your logs; a re-read is invisible.
- "Edições cadastradas" sits above "Registros de leitura".
- Average and count are shown; the distribution is not.

`work.logs` already carries `rating`, `user.id`, `finished_on` for every visible log (capped at 50 by `server/services/works.ts`). Everything below is computable in the page. **No server change.**

## Scope

### Included

- `app/pages/livro/[slug].vue`
- New `app/components/book/RatingHistogram.vue` (presentational: props in, nothing out)

### Explicitly excluded

- `server/**`, `shared/**`. If the 50-log cap matters, report it.
- Author or genre pages; making authors/genres links.
- Want-to-read, likes, lists.

## Dependencies

TASK-029 makes `/app/novo?work_id=` the log form. That branch already exists today, so this task can run in parallel.

## Expected files/components

```
app/pages/livro/[slug].vue
app/components/book/RatingHistogram.vue   (new)
tests/unit/rating-histogram.test.ts       (new)
```

## Implementation requirements

1. **Primary action** under the title block:
   - member, no log of this work: button-link **"Registrar leitura"** → `/app/novo?work_id=<work.id>`
   - member with ≥1 log: **"Registrar releitura"** → same URL
   - anonymous: **"Entrar para registrar"** → `/entrar?next=/livro/<slug>`
2. Replace the single `userLog` banner with **"Suas leituras (N)"**: every log where `log.user.id === session user id`, newest first, each row showing finish date (use `formatFullDate` from `app/utils/date.ts`; `finished_on` null reads "Lendo agora"), stars, and a link to `/entrada/<id>`.
3. `RatingHistogram` props: `ratings: number[]` (values 0.5-5 in half steps). Ten vertical bars, one per half-star value, height proportional to the max bucket, a ★ label at each end, and an accessible text summary (e.g. `aria-label="Distribuição das notas: 3 de 5 estrelas, 2 de 4,5 …"`). Render nothing when `ratings` is empty. Colours from `tokens.css` only.
4. Show the histogram beside/under the average, fed with every non-null `rating` in `work.logs`.
5. Block order: header (cover, title, authors, average + histogram, action) → Suas leituras → Registros de leitura → Edições cadastradas → creator actions.
6. The empty-state action href becomes `/app/novo?work_id=<work.id>` and its label "Registrar leitura".

## UX requirements

- The action is visible without scrolling at 375 px and at 1440 px.
- Touch target ≥ `--target-min-size`.

## Testing requirements

- Unit (`// @vitest-environment happy-dom`): `RatingHistogram` with `[5, 5, 4.5, 1]` renders ten bars, the `5` bar is the tallest, and the label mentions "5 estrelas". Empty input renders nothing.

## Acceptance criteria

- [ ] Page has a link to `/app/novo?work_id=<id>` for a member
- [ ] Anonymous visitor sees "Entrar para registrar" → `/entrar?next=/livro/<slug>`
- [ ] A user with two logs of the work sees both under "Suas leituras (2)"
- [ ] "Registros de leitura" renders before "Edições cadastradas" in the DOM
- [ ] `grep -n 'action-href="/app/novo"' 'app/pages/livro/[slug].vue'` returns nothing
- [ ] No file under `server/` or `shared/` changed

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer)
