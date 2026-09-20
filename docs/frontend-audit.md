# Frontend audit — 2026-09-20

Baseline for rewriting [frontend.md](frontend.md). Every claim below was observed in a running browser against the real Neon database, not read from code.

**Method.** `npm run dev`, Chromium pane, four viewports (320, 375, 768, 1280). Each public route loaded, screenshotted, then measured in the page (`scrollWidth` vs `clientWidth`, computed `grid-template-columns`, `naturalWidth` per `<img>`). SSR output checked with `curl` so what WhatsApp's crawler sees is judged on the HTML, not on the hydrated page.

**Not audited:** `/app/bem-vindo`, `/app/novo`, `/app/perfil`, `/app/entrada/[id]/editar`, `/app/livro/novo`. They need a session; minting one directly in `session` did not authenticate (signature scheme mismatch), and the OTP path sends a real email. These are also the highest-risk surfaces — `LogForm.vue` is 945 lines and `AddBookForm.vue` is 1330, most of it local CSS.

---

## Findings

### P0 — The permalink renders "Entrada não encontrada"

`/entrada/2233331b-e86e-4507-985b-0e02113f7c96` — a `publico` reading log by `@dtma23` with a review — returns HTTP 200 whose **SSR body is the empty state**, for anonymous and authenticated visitors alike.

The API is fine: `GET /api/logs/2233331b-…` returns 200 with the full record. Only the page fails.

Cause, at [app/pages/entrada/[id].vue:162](app/pages/entrada/[id].vue#L162): `useRequestEvent()` and `useCookie()` are called **after `await requestFetch(...)`**, inside the `useAsyncData` handler. Nuxt composables require the synchronous setup context; after an await it is gone. The server logs `NUXT_E1001 — A composable that requires access to the Nuxt instance was called outside of a plugin, Nuxt hook, Nuxt middleware, or Vue setup function`, the handler's own `catch` re-throws, `error` becomes truthy, and the template falls to its not-found branch.

Consequence beyond the blank page: the Open Graph card is generic.

```
og:title  content="Entrada — Meus Livros"
```

No book title, no rating, no reader handle, no cover. `frontend.md` §2 calls OG *"the single highest-leverage thing on the frontend"*, and TASK-014's acceptance criteria require the title and rating in `og:title`. Both are currently false in the rendered HTML.

The block that breaks it is a caching refinement (`Cache-Control: public, max-age=60` for public entries). It costs the product its entire distribution channel.

**Why review missed it:** 307 tests pass. They test `/api/logs/[id]`, which works. Nothing loads the page, and `npm run build` does not render routes.

### P1 — Three of five filter controls are off-screen on a phone

At 375px, `.filter-container` has `scrollWidth 791` inside `clientWidth 341`. Below 640px [FilterBar.vue](app/components/profile/FilterBar.vue) sets `overflow-x: auto` with `flex-wrap: nowrap` and `min-width: max-content`, so genre, country, decade, sort and reset sit in one 791px strip. A phone shows the first one and part of the second; the only affordance for the rest is a thin scrollbar.

This is not a bug — the CSS does exactly what it says. It is a design decision an agent made because `frontend.md` §3 specifies `FilterBar.vue // genre / country / decade (from index.html:101-142)` and says nothing about how five controls behave in 343 logical pixels.

### P1 — Two stat blocks contradict each other on one screen

Filtering to zero results (genre *Biografia e Autobiografia* + country *China*) renders, top to bottom: header stats **86 livros · 60 autores · 14 países**, then the empty state, then a footer reading **0 Páginas Lidas · 0 Média p/ Livro**. The header ignores filters; the footer honours them.

TASK-020's criterion — *"The '0 Páginas Lidas' footer never appears beside an empty grid"* — is violated today, and 020 has not run yet. It will be written against a page that already has the bug it was meant to prevent.

### P2 — No shared primitives, and it shows in the same button

Two pages, the same action, two designs and two wordings:

| Page | Label | Style |
|---|---|---|
| 404 | "Voltar ao início" | outlined, grey |
| `/entrada/[id]` not-found | "Voltar para o início" | solid, `--highlight` blue |

Four files declare their own `--highlight` button independently ([LogForm.vue](app/components/log/LogForm.vue), [entrar.vue](app/pages/entrar.vue), [bem-vindo.vue](app/pages/app/bem-vindo.vue), [perfil.vue](app/pages/app/perfil.vue)). `tokens.css` defines variables only — there is no `BaseButton`, `BaseInput` or `BaseField`, and `frontend.md` §3 never lists one. Each of the 17 merged tasks styled its own controls in isolation.

### P2 — The grid is posters with no text, and no skeleton

`BookCard` renders cover + stars, no title, no author. That is a legitimate Letterboxd borrowing, but covers are `loading="lazy"` with no reserved placeholder, so scrolling produces bands of empty `--card-bg` rectangles carrying no text at all. There is no `LoadingSkeleton` (TASK-020, not started).

Measurement note: an earlier count of "68 of 86 covers broken" was **wrong** — `naturalWidth === 0` also means *not yet loaded*. Forcing every `<img>` to `eager` and re-requesting: **86 settled, 86 ok, 0 broken.** Covers work. The problem is purely the unstyled gap while they arrive.

---

## What already works — do not regress it

- **Grid matches the spec exactly.** 2 columns at 320 and 375, 4 at 768, 6 at 1280. 16px gap.
- **No horizontal page scroll at 320px** (`scrollWidth 320` = `clientWidth 320`).
- **Every `<img>` has `alt`** — 86 of 86 on the profile. TASK-021 starts ahead.
- **The zero-results empty state is good**: names both active filters in prose and offers "Limpar filtros" as the primary action.
- **`/livro/{slug}` has real hierarchy** — cover, title, author, rating, series, genre chips, editions, logs. The best page in the app.
- **404 and `/entrar` are clean and correctly in pt-BR.**

## Out of scope, found anyway

- **Integration tests write to the development database and never clean up.** `users` holds `ta882726522` and `tr882726522` beside `dtma23`; `allowed_emails` holds at least three `test-*@example.com` rows. Any count-based assertion or any future "who's on this site" view reads them.
- **The working tree is dirty and not from this audit**: `vitest.config.ts`, `tests/integration/routes.test.ts` modified, `tests/global-setup.ts` untracked — a globalSetup fix for a build race, from an earlier session, uncommitted.

---

## What this says about the planning

The plan is strong on everything that can be asserted in a test and silent on everything that cannot.

`/entrada/[id]` has nine acceptance criteria, all of them satisfiable by the API, and it ships a page that says "Entrada não encontrada". The filter bar has a component name and a line reference and no behaviour spec, so an agent invented a 791px scroll strip. There is no `BaseButton` in the component tree, so four files invented four buttons.

The loop in [agent-workflow.md](agent-workflow.md) §4 verifies lint, typecheck, tests, build and security-sensitive code. All five pass on a permalink that renders nothing. **The missing step is not a document — it is opening the page.**

## Changes this justifies

1. **Fix the permalink first**, before any planning rewrite. Hoist `useRequestEvent()` and `useCookie()` above the `await` in the `useAsyncData` handler, and add a test that asserts the SSR body of a public entry contains the work title and that `og:title` is not the generic string. One test, and the highest-value page in the product stops being able to fail silently.
2. **Add a UI primitives task before 018/020/021**: `base.css` element defaults plus `ui/Base{Button,Input,Field,Card,Modal}.vue`, then strip local control CSS from the pages. Verifiable: `grep -rn "var(--highlight)" app --include=*.vue` matches only under `ui/`.
3. **Give `frontend.md` a per-route design section** — block order, what dominates, what happens to each control at 375px. The filter bar is the proof that naming a component is not specifying one.
4. **Add a visual step to the review protocol**: load the route at 375 and 1280, screenshot it, and check the SSR body with `curl` for the four public routes. Plus per-task criteria that are visual *and* checkable — column count at each breakpoint, no element with `scrollWidth > clientWidth` unless intended, one stat source per screen, no button styled outside `ui/`.
5. **Reconcile the two stat blocks** — header stats honour the filters, or the footer disappears when filtered. Pick one and write it down.
