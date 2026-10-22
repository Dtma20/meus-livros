# Frontend review - 2026-09-30

A code and UX review of `app/`, done twice (Claude and GPT, independently), consolidated, fixed on `fix/frontend-review` and merged into `develop` as `31bb07a`. This report records what was found, what was fixed, what was decided and what was not verified.

---

## 1. How the review was done

- **Claude review.** Four read-only agents split by area (architecture, CSS, accessibility, UX/performance), plus the `impeccable` detector. Code reading only: no test run, no browser.
- **GPT review.** Code reading plus typecheck, lint, build and the unit suite (343 passed, 1 failed in `logger.test.ts` on a shell `LOG_FORMAT`), and three isolated reproductions.
- **Cross-check.** Each reviewer audited the other's report against the code and the installed Nuxt runtime. The result changed priorities more than either review alone.

What the area-split review missed was every bug that lives *between* files: a form payload against the service that consumes it, a draft against sign-out, a debounce against a late response. What the GPT review overstated was nothing material; what the Claude review overstated is listed in §3.

## 2. Findings that held up

| # | Finding | Severity | Where (before the fix) |
|---|---|---|---|
| 1 | Clearing rating, review, edition, format or start date on edit never cleared it: the form sent `undefined`, and the service only updates fields that are present | P1, data | `LogForm.vue` payload; `server/services/logs.ts` `!== undefined` guards |
| 2 | Drafts used one fixed key per form, were not cleared on sign-out, and so an unpublished private review stayed in a shared browser | P1, privacy | `LogForm.vue`, `AddBookForm.vue`, `layouts/app.vue` `handleSignOut` |
| 3 | The log draft did not persist "Estou lendo" | P1 | `LogForm.vue` `saveDraft` |
| 4 | Feed, diary and profile grid started at `opacity: 0` and depended on a client directive to appear | P1 | `FeedItem.vue`, `DiaryList.vue`, `@[handle]/index.vue` |
| 5 | Mobile feed cover was 48 × 187 px (width changed, height kept) | P1, visual | `FeedItem.vue` |
| 6 | A late search response could overwrite the current query; search errors were swallowed | P1 | `SearchBox.vue` |
| 7 | Double submit: `void navigateTo` plus a `finally` re-enabled the button before navigation | P1 | `LogForm.vue` |
| 8 | Single-character shortcuts could not be turned off (WCAG 2.1.4, A) | P1, a11y | `useKeyboardShortcuts.ts` |
| 9 | Author autocomplete was not a combobox; some field errors had no `aria-describedby` | P2, a11y | `AddBookForm.vue`, `LogForm.vue` |
| 10 | A network failure rendered as "não encontrado" on livro, entrada and editar | P2 | `livro/[slug].vue`, `entrada/[id].vue`, `editar.vue` |
| 11 | One failing feed request blanked the whole dashboard (`Promise.all`) | P2 | `pages/index.vue` |
| 12 | Undo/delayed delete written three times; draft logic written twice | P2, hygiene | `entrada/[id].vue`, `livro/[slug].vue`, `ReadingBlocksSection.vue` |
| 13 | Form styles copied into eight files with diverging values; wrong token fallbacks; two tokens used but not defined | P2, CSS | `forms.css` vs scoped copies |
| 14 | axe failed only on `critical`, ran signed out, skipped the `app` layout | P2, tests | `tests/integration/axe.test.ts` |

## 3. Claims that did not hold up

Recorded so they are not re-raised.

- **"After 21:00 the form records tomorrow."** False. `setup` runs again on the client during hydration, so the ref holds the browser date and the payload is correct. The real defect was only an SSR/client mismatch on the input; it is fixed anyway (SSR renders empty, `onMounted` fills the browser date).
- **"Static `useAsyncData` keys go stale on param change."** Not in this app: Nuxt's `generateRouteKey` (`node_modules/nuxt/dist/pages/runtime/utils.js`) interpolates route params into the page key and remounts the page.
- **"Missing `await` on `useAsyncData` breaks SSR."** No: it registers `onServerPrefetch` either way. The real bug next to it was the 404 condition (#10).
- **"`v-memo` on the map does nothing."** Overstated: the computed keeps the same arrays between dependency changes, so it does skip hover re-renders.
- **Categorical WCAG failures on the rating slider and the search focus.** The slider already had name, value and arrow keys (APG slider pattern). A border-colour change is a visible indicator for 2.4.7. Half-stars are 24 px, not 14 px, under `(pointer: coarse)`; below the project's 44 px token, which is not the same as failing WCAG 2.1 AA.

## 4. What was fixed

Commits on `develop`, in order:

| Commit | Scope |
|---|---|
| `36fdbee` | Removes comments only (verified line by line); moves 16 `@vitest-environment` directives into `vitest.config.ts`. Labelled `docs:`, which is the wrong type for a change to code and test files |
| `21b1ca9` | Forms: `null` for cleared fields, per-user versioned drafts (`useFormDraft`), double-submit guard, `EditionPicker` and `AuthorInput` extracted, stable author-row keys |
| `60d1e5a` | Search aborts on input change with a generation guard and shows errors with retry; character shortcuts can be turned off (`useKeyboardShortcutPreferences`) |
| `bfc63c0` | Rating input labelled and disabled correctly; axe fails on any A/AA violation and signs in for app-layout routes; logger test isolated from the shell environment |
| `14be71a` | `useDelayedDelete` and `useShareFeedback`; entrada and editar tell 404 from network failure |
| `b246ea5` | JSON import: cancellable reads, stale preview cleared, read errors shown |
| `261b7ea` | Content visible at rest, revealed only after the client adds `.reveal-enabled`; covers with `<picture>` and 1x/2x variants; mobile feed cover 48 × 72 |
| `ce8ff63` | Tokens `--text-strong`, `--text-muted`, `--line-height-snug`, `--shadow-card`; scoped form copies removed; fallbacks match tokens |
| `e89847b` | `ReadingBlocksSection` uses `useDelayedDelete` |
| `4bff49c` | Gaps found in validation: livro raises the fatal 404 only for a real 404; sign-out clears every form draft, including the two legacy keys; passage deletes sent on `pagehide` report their result after a back-forward-cache return; dashboard settles dashboard and feed separately |
| `733af76` | Restores the yellow invite submit button (see §5) |

## 5. Owner decisions

- **Labels stay white.** `ce8ff63` changed the global `.form-label` from `--text-color` to `--text-strong`, with weight 600 on the sign-in, profile and invite pages. Kept.
- **The yellow invite button stays.** `ce8ff63` had removed it without a decision; `733af76` restores it with `--highlight` / `--on-highlight` (8.31:1) and `--highlight-hover` on hover (5.60:1).
- **Leaving during the undo countdown deletes.** Still the behaviour; open as Q7 in [open-questions.md](../open-questions.md).

## 6. Verification

- At `4bff49c` + the invite button: typecheck, lint and `nuxt build` pass; unit suite **654 / 654** (69 files), run in a separate worktree. Two unit files import `server/db` and need `DATABASE_URL` set; they pass with a dummy URL.
- The five tests added in `4bff49c` were run against `e89847b`: the four that cover the fixes fail there and pass after.
- The implementing agent reported integration **178 / 178** and axe **8 routes, 0 violations** against a disposable Postgres. **Not re-run during validation.**
- **Not done:** browser check of any changed screen (including the invite button colour), screen reader, Web Vitals, colour contrast in a real browser (axe still disables it in happy-dom), a direct test of `handleSignOut`.

## 7. Still open

- **Q7** - leaving during the undo countdown confirms the delete; on entrada and livro a failed delete after leaving is silent.
- A POST that times out re-enables submit; if the server did write, a second click duplicates the log (`reading_logs` has no unique key by design).
- `SearchBox` has no request timeout, and each keystroke empties the result list before the new results arrive (visible flicker).
- `BookCard.vue` uses `<a :href>` for internal links: a full page load instead of client navigation.
- `editar.vue` loads with `$fetch` rather than `useRequestFetch`; a hard reload of a private entry may not forward the session cookie during SSR. Not checked in a browser.
- `form-draft.test.ts` now exists; `author-input.test.ts` is still listed in the `vitest.config.ts` glob but does not exist.
