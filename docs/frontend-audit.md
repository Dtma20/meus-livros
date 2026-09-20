# Frontend audit — 2026-09-20

Baseline for rewriting [frontend.md](frontend.md). Every claim below was observed in a running browser against the real Neon database, not read from code.

**Method.** `npm run dev`, Chromium pane, seven viewports (320, 375, 768, 1024, 1280, 1440, 1920). Each public route loaded and screenshotted **at both phone and desktop width**, then measured in the page (`scrollWidth` vs `clientWidth`, computed `grid-template-columns`, element bounding boxes, `naturalWidth` per `<img>`). SSR output checked with `curl` so what WhatsApp's crawler sees is judged on the HTML, not on the hydrated page.

The five `/app/**` routes were audited in a second pass, with a session the owner supplied. Nothing was submitted: no reading log created, edited or deleted. The one side effect — a `meus-livros:log-draft` in the pane's `localStorage`, from selecting a book to reveal the form — was removed afterwards.

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

### P1 — The poster grid is smaller on a 1920 monitor than on a phone

The grid stops growing at 920px and never widens again. Measured on `/@dtma23`:

| Viewport | Grid width | Columns | Card width | Side gutter |
|---|---|---|---|---|
| 375 | 343 | 2 | **164px** | 16 |
| 1024 | 920 | 6 | 140px | 52 |
| 1440 | 920 | 6 | 140px | 253 |
| 1920 | 920 | 6 | 140px | **493** |

Two consequences, both against a poster-first product:

1. **The cover shrinks as the screen grows.** 164px on a phone, 140px on every desktop. The card is 24px *narrower* on a 1920 monitor than on a 375 phone.
2. **At 1920, 51% of the window is empty gutter** — 986 of 1920px. The column count is frozen at 6 by the `> 900px` breakpoint with no tier above it, so a wide monitor buys nothing.

`frontend.md` §7 specifies `Breakpoints: 600px, 900px. Grid: 2 columns → 4 → 6`, and the implementation matches it exactly. The spec itself is what is wrong: it was written as three mobile-first steps and never asked what a 1440 or 1920 screen should do. The cohort reads links on phones, but the owner curates 86 books on a laptop.

Same shape on the work page: the reading-log row is 818px wide holding a handle on the far left and a star rating on the far right, with roughly 700px of nothing between them.

### P1 — Three of five filter controls are off-screen on a phone

At 375px, `.filter-container` has `scrollWidth 791` inside `clientWidth 341`. Below 640px [FilterBar.vue](app/components/profile/FilterBar.vue) sets `overflow-x: auto` with `flex-wrap: nowrap` and `min-width: max-content`, so genre, country, decade, sort and reset sit in one 791px strip. A phone shows the first one and part of the second; the only affordance for the rest is a thin scrollbar.

At 1440 all five fit comfortably in one row — genre, country and decade left, `Ordenar:` and a `Limpar ×` button right. So the control that clears the filters exists and is one click away **on a PC**, and is the last thing in the off-screen strip on a phone: the empty state's own "Limpar filtros" button is the only way a phone user reaches it.

This is not a bug — the CSS does exactly what it says. It is a design decision an agent made because `frontend.md` §3 specifies `FilterBar.vue // genre / country / decade (from index.html:101-142)` and says nothing about how five controls behave in 343 logical pixels.

### P1 — Two stat blocks contradict each other on one screen

Filtering to zero results (genre *Biografia e Autobiografia* + country *China*) renders, top to bottom: header stats **86 livros · 60 autores · 14 países**, then the empty state, then a footer reading **0 Páginas Lidas · 0 Média p/ Livro**. The header ignores filters; the footer honours them.

TASK-020's criterion — *"The '0 Páginas Lidas' footer never appears beside an empty grid"* — is violated today, and 020 has not run yet. It will be written against a page that already has the bug it was meant to prevent.

Worse on a PC than on a phone: at 1440 the whole page fits without scrolling, so **86 livros** and **0 Páginas Lidas** sit about 250px apart on one screen. On a phone you at least have to scroll between the two lies.

### P1 — The half-star target is 14px wide on a phone

`RatingInput` splits each star into two `<button>` halves. Measured at 375px:

| Control | Size |
|---|---|
| Half-star button | **14 × 28** |
| Whole star track | 156 × 28 |
| Format button (`📖 Físico`) | 88 × 61 |
| Visibility option (label wrapping the radio) | 279 × 61 |
| `← Trocar livro` | — × **14** |
| Header nav links (`Registrar livro`, `Perfil`, `Sair`) | — × **19** |

WCAG 2.5.8 (AA) sets 24 × 24 as the minimum. The rating control — the most-used input in the product, and the reason half-stars exist at all — is 14px wide on the device the entire cohort uses. The format and visibility controls, by contrast, are 61px tall and fine, which shows this was never a consistent decision either way.

`frontend.md` §7 lists breakpoints, gutters and focus rings. It never mentions a minimum touch target, and neither does TASK-021.

### P2 — No shared primitives, and it shows in the same button

Two pages, the same action, two designs and two wordings:

| Page | Label | Style |
|---|---|---|
| 404 | "Voltar ao início" | outlined, grey |
| `/entrada/[id]` not-found | "Voltar para o início" | solid, `--highlight` blue |

Four files declare their own `--highlight` button independently ([LogForm.vue](app/components/log/LogForm.vue), [entrar.vue](app/pages/entrar.vue), [bem-vindo.vue](app/pages/app/bem-vindo.vue), [perfil.vue](app/pages/app/perfil.vue)). `tokens.css` defines variables only — there is no `BaseButton`, `BaseInput` or `BaseField`, and `frontend.md` §3 never lists one. Each of the 17 merged tasks styled its own controls in isolation.

### P2 — The grid is posters with no text, and no skeleton

`BookCard` renders cover + stars, no title, no author. That is a legitimate Letterboxd borrowing, but covers are `loading="lazy"` with no reserved placeholder, so scrolling produces bands of empty `--card-bg` rectangles carrying no text at all. There is no `LoadingSkeleton` (TASK-020, not started).

The gap is bigger on a PC, because a desktop screen shows about three times as many cards at once: the first paint of `/@dtma23` at 1440 showed 9 of the 12 cards above the fold as empty rectangles. On a phone it is 2 to 4. Once loaded, nothing is blank at any width.

Measurement note: an earlier count of "68 of 86 covers broken" was **wrong** — `naturalWidth === 0` also means *not yet loaded*. Forcing every `<img>` to `eager` and re-requesting: **86 settled, 86 ok, 0 broken.** Covers work. The problem is purely the unstyled gap while they arrive.

### P2 — TASK-021 is about to break a correct rating control

TASK-021 requirement 5 reads: *"`RatingInput`: a real radio group, arrow-key operable, with a visible focus ring."*

The shipped component is not a radio group. It is `role="slider"`, `tabindex="0"`, with `aria-valuemin/max/now/valuetext` and a `keydown` handler, plus ten `tabindex="-1"` buttons for the mouse. For a continuous 0–5 value that is the better ARIA mapping, and it already satisfies the outcome the criterion was aiming at.

An agent handed that criterion will "fix" a working control into a worse one, or a reviewer will mark it failed. **The criterion prescribes an implementation where it should have specified an outcome** — keyboard-operable, announced as a value, visible focus.

### P2 — The edit form tells you the date came from today's browser clock

`/app/entrada/{id}/editar` for entry `2233331b-…` ("Maus") shows the date input correctly loaded with the stored `2024-01-01`, under the helper line:

> Preenchida com a data de hoje pelo seu navegador.

Today is `2026-09-20`. The stored value is right and nothing is rewritten on save — this is a copy bug, not a data bug. `LogForm` is shared between create and edit and the helper string was never made conditional. On the one screen where a wrong date would be silent and permanent, the app asserts something false about its own state.

### P2 — The search dropdown escapes its card, and has no covers

On `/app/novo`, typing `tolkien` returns four results as title / author / year rows. The dropdown is absolutely positioned and renders well past the bottom edge of the card behind it, so at 1440 it reads as a detached panel floating over black.

It also carries no cover thumbnails. In a product whose every other surface is poster-first, the one screen where you pick a book is text-only.

### Site-wide — the footer sentence is not grammatical Portuguese

[app/layouts/default.vue:25](app/layouts/default.vue#L25):

> Dados bibliográficos parcialmente do Open Library

Missing its verb — *parcialmente provenientes do*, or *em parte do*. It renders on every page of the site, signed in or not, and has survived seventeen merged tasks.

---

## What already works — do not regress it

- **Grid matches the spec exactly.** 2 columns at 320 and 375, 4 at 768, 6 at 1280. 16px gap.
- **No horizontal page scroll at 320px** (`scrollWidth 320` = `clientWidth 320`).
- **Every `<img>` has `alt`** — 86 of 86 on the profile. TASK-021 starts ahead.
- **The zero-results empty state is good**: names both active filters in prose and offers "Limpar filtros" as the primary action.
- **`/livro/{slug}` has real hierarchy** — cover, title, author, rating, series, genre chips, editions, logs. The best page in the app, at both widths.
- **404 and `/entrar` are clean and correctly in pt-BR**, and both centre properly at 1440.
- **Nothing overflows or breaks at desktop.** The desktop problems below are all about wasted space, never about broken layout.
- **`LogForm` has the right content in the right order** — book, rating, finish date with a precision selector, optional start date, review with a character counter, format, edition collapsed behind "li outra edição?", visibility with both options explained. `frontend.md` §5 asked for exactly this and got it.
- **Draft persistence works.** Selecting a book and navigating away restores the form from `localStorage` under `meus-livros:log-draft`, which is the protection §5 calls the worst failure the app could have.
- **`/app/livro/novo` is properly minimal** — título, autores, and two collapsed "Adicionar detalhes" sections. The manual-add path stays a one-minute path.
- **`/app/perfil` explains itself well** — the handle is locked with a reason given, the bio has a counter, and both visibility options say what they mean in plain pt-BR.
- **`/app/bem-vindo` correctly redirects** to `/app/novo` when a profile already exists.
- **The edit form loads real stored values** — rating 4,5, a 645-character review, `finished_on` 2024-01-01 — for the very entry whose public permalink renders "Entrada não encontrada". Same API, same data. Conclusive proof that P0 is a page bug and nothing is wrong with the record.

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
3. **Give `frontend.md` a per-route design section** — block order, what dominates, and what happens to every control at **both** 375px and 1440px. The filter bar proves that naming a component is not specifying one; the frozen 920px grid proves that a mobile-first breakpoint list is not a desktop spec.
4. **Decide what a wide screen is for.** Either add a tier above 900px so the grid keeps growing (more columns, or wider cards, or both), or state deliberately that 920px is the cap and the gutters are intentional. Right now it is neither — it is the absence of a decision. Whichever way it goes, the rule to write down is that the poster is never smaller on a desktop than on a phone.
5. **Add a visual step to the review protocol**: load the route at 375 **and 1440**, screenshot both, and check the SSR body with `curl` for the four public routes. Plus per-task criteria that are visual *and* checkable — column count at each breakpoint, card width monotonically non-decreasing with viewport width, no element with `scrollWidth > clientWidth` unless intended, one stat source per screen, no button styled outside `ui/`.
6. **Reconcile the two stat blocks** — header stats honour the filters, or the footer disappears when filtered. Pick one and write it down.
7. **Set a minimum touch target and put it in the tokens.** 44px preferred, 24px the floor, applied to the half-star, the nav links and `Trocar livro`. It is one line in `frontend.md` §7 and a verifiable criterion: no interactive element under 24px in either dimension at 375px.
8. **Rewrite TASK-021 requirement 5 as an outcome**, not a widget: *"the rating is operable with the keyboard, announces its current value, and shows a visible focus ring"*. The current wording would demote a working `role="slider"` to a radio group. Audit the other criteria for the same mistake before 020 and 021 run — they are the two tasks that touch every file.
