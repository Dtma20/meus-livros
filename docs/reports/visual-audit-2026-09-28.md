# Visual audit - 2026-09-28

Follow-up to [frontend-audit.md](../frontend-audit.md) (2026-09-20), which was about broken layout and function. This one asks whether the screens are **pleasant**: coherent, finished, and dominated by the right thing. Every number below was read from computed styles in a running browser, not from source. Read-only: no code changed, nothing committed, no form submitted.

---

## 1. Method

- **Server.** `npx nuxt dev --port 3100` from the `ml-verify` worktree at `develop` `e267496` (`.nuxt/dev/index.mjs` mtime 00:08:40, six seconds before the first request). The owner's dev server on port 3000 was not touched. Local docker Postgres, user `@MeusLivros`, 86 books.
- **Session.** The owner signed in inside the browser pane on `localhost:3100`; I typed no credentials. For the anonymous view I used `http://[::1]:3100` - same server, different cookie host, so the session does not follow.
- **Measurement.** The script from the prompt, extended with measured WCAG contrast (text colour against the first opaque ancestor background), a count of `--highlight` usages and a list of text elements not rendered in Inter/Lora. Run at 375 and 1440 on every route below.
- **Routes covered.** `/` (member dashboard and anonymous landing), `/entrar`, `/@MeusLivros` (grid and diary), `/livro/{slug}` (with cover, long title), `/entrada/{id}` (with a 2,505-character review, owner and visitor), `/membros`, `/atividade`, `/app/novo`, `/app/entrada/{id}/editar`, `/app/perfil`, `/app/admin/convites`, 404. Profile and landing also at 320, 768, 1024 and 1920.
- **Extreme content.** Simulated in the page with `javascript_tool` (no data written): a 120-character title and a 46-character author on a card, a forced `error` on a cover to render the placeholder, keyboard Tab for focus.
- **Screenshots.** Saved outside the repo under the session scratchpad `shots/` directory, named `<route>-<width>.png`, captured with headless Chrome. **The 375 files are not valid:** headless Chrome enforces a ~500px minimum window, renders wider and crops, which fakes a horizontal overflow the pane measurement shows is not there (`scrollWidth 375 = clientWidth 375`). All 375 judgements come from the pane.
- **Left out, and why.**
  - Loading and error states: the pane has no network throttling, and forcing a 500 would mean stopping the shared database.
  - Chrome autofill: there is no saved credential in the pane profile.
  - Profile with 0 readings: there is only one user.
  - `/entrar/ativar`, `/entrar/senha`, `/app/livro/novo`, `/app/bem-vindo`: captured headless at 1440 only.
  - The **transition** of the cover shimmer: the pane was hidden (`document.visibilityState: hidden`), and a control `div` with the same `transition: opacity .2s` also stayed at 0, so transitions do not run there at all.
  - 10px/9px sizes and an unclassed `div` that appear on every page are the Nuxt DevTools overlay (dev only) and are excluded from every count.

## 2. Status of the 2026-09-20 findings

| Finding | Status | Evidence |
|---|---|---|
| P0 Permalink renders "Entrada não encontrada" | **Fixed** | `/entrada/860c…` renders cover, title, review; `og:title` is `Fragmentos do horror - ★★★½ por @MeusLivros` |
| P1 Poster smaller on 1920 than on a phone | **Fixed** | card width 163 (375) → 213 (1440) → 294 (1920) |
| P1 Three of five filters off-screen on a phone | **Fixed** | filter container `scrollWidth 341 = clientWidth 341` at 375 (TASK-042) |
| P1 Two stat blocks contradict each other | **Fixed** | genre filter: header "6 livros", 6 cards, footer "(filtros ativos)" (TASK-043) |
| P1 Half-star target 14px wide | **Fixed in CSS, not measured on touch** | TASK-041 unit test reads 48px wrapper under `(hover: none)`; the editor at 1440 still has 28px halves by design |

## 3. Scorecard

1 = poor, 5 = finished. Columns: 3.1 hierarchy · 3.2 type · 3.3 spacing · 3.4 colour · 3.5 components · 3.6 covers · 3.7 density · 3.8 interaction · 3.9 platform. "-" = not applicable.

| Route | 3.1 | 3.2 | 3.3 | 3.4 | 3.5 | 3.6 | 3.7 | 3.8 | 3.9 |
|---|---|---|---|---|---|---|---|---|---|
| `/` anonymous (landing) | 4 | 4 | 4 | 4 | 3 | 4 | 4 | 3 | 2 |
| `/` member (dashboard) | 2 | 3 | 3 | 3 | 2 | 4 | 2 | 3 | 2 |
| `/@MeusLivros` grid | 2 | 3 | 3 | 3 | 3 | 3 | 2 | 4 | 2 |
| `/@MeusLivros?vista=diario` | 4 | 3 | 3 | 4 | 3 | 3 | 4 | 3 | 2 |
| `/livro/{slug}` | 4 | 4 | 4 | 3 | 3 | 4 | 2 | 3 | 2 |
| `/entrada/{id}` | 3 | 4 | 3 | 4 | 3 | 4 | 3 | 3 | 1 |
| `/atividade` | 4 | 3 | 4 | 4 | 4 | 4 | 3 | 3 | 2 |
| `/membros` | 3 | 4 | 4 | 4 | 4 | 1 | 2 | 3 | 2 |
| `/app/novo` | 4 | 4 | 4 | 4 | 3 | - | 3 | 3 | 2 |
| `/app/entrada/{id}/editar` | 3 | 3 | 3 | 2 | 2 | 4 | 4 | 3 | 1 |
| `/app/perfil` | 3 | 4 | 3 | 2 | 3 | - | 3 | 3 | 2 |
| `/app/admin/convites` | 4 | 4 | 4 | 3 | 4 | - | 3 | 3 | 2 |
| `/entrar` | 4 | 4 | 3 | 3 | 3 | - | 4 | 2 | 2 |
| 404 | 4 | 4 | 4 | 4 | 4 | - | 4 | 4 | 2 |

Justifications, one per cell, in the same order:

- **Landing.** Serif headline dominates at 375 and 1440 · two families used with clear roles · even rhythm, and no overflow at 320-1920 after TASK-046 · amber is used sparingly (CTA and kicker) · the CTA shadow and the pill are one-off styles · sample covers are real images · the hero fills the width without dead gutter · the CTA has hover but no visible pressed state · `color-scheme: normal`, no `theme-color`.
- **Dashboard.** At 375 the first screen is two **empty** sections plus a lone "+" button; the carousel and the activity are below the fold · 1.05rem and **11px** outside the scale · off-scale `time.card-date margin-top: 17px` · review excerpt in `#94a3b8` and feed excerpt in `#c9d1d9`, both off-palette · 5 button variants, including a round carousel arrow in **Arial** · covers fine · two dashed empty boxes at full width on desktop · hover exists · platform as landing.
- **Profile grid.** Blur test: the **amber map** and the 32px amber handle are the two first-level elements; the books are not. At 1440 the first cover is at y=1195 and at 1920 at y=1577 (the map is 1008px tall) · stars at 14.4px and title at 21.6px, off-scale · 29 off-scale spacing values at 375 · 95 highlight uses (86 of them stars) · 6 button variants · the placeholder (initials on flat grey) looks like a load error next to real covers · the map pushes content down · focus ring 2px amber, offset 4px, visible on covers · platform as landing.
- **Diary.** The year heading leads clearly · mixed 12/14/16 in the rows · rows are evenly spaced · amber only on stars · the tabs match the visibility tabs · small covers fine; placeholder as above · compact and readable · no row hover · platform as landing.
- **Book page.** Cover, title and primary action read in order · type within scale except stars · even gaps · 21 highlight uses on one card (bars, labels, three links, CTA) · genre chips use `padding 0 10px`, off-scale · cover correct · **55% of 1920 and 53% of 1440 is empty gutter** around an 868/680px card · with one rating the histogram is ten grey tracks and one bar · platform as landing.
- **Entry permalink.** The review, the reason for the visit, starts at **962px** for a visitor at 375 (viewport 812), below a 291px "Progresso da leitura" block · review body 16px Inter, line-height 1.6, **61ch** at 1440 - good · owner's action row overflows the card (below) · amber limited · "Compartilhar", "Editar" and "Remover" are three styles · cover fine · card padding 32px at 375 leaves 247px of content · share button hover only · **og:image is the generic fallback for 39 of 86 entries** (P0).
- **Activity.** One row pattern, well repeated · 1.05rem titles off-scale · even · `#c9d1d9` excerpts · consistent rows · covers fine · rows stretch to 1440 with the date far right · row hover exists · platform as landing.
- **Members.** The name leads · fine · fine · fine · one card style · **recent covers render as initials on grey (FD, OR, AM, AD)** for books that do have covers · one 300px card alone at the top-left of a 1440 page · card hover · platform as landing.
- **New log.** The search leads · fine · fine · amber on the active tab only · tab buttons are a third tab style · - · the card is centred at ~560px, acceptable for a form · focus visible · platform as landing.
- **Edit log.** Many controls of equal weight · 13.33px on the star buttons (UA default) · 21 off-scale spacing values · **selected format has an old-blue background** `rgba(64,188,244,.15)` inside an amber UI · **10 button variants** on one screen · cover fine · a form, so density is right · "Remover" fails contrast (3.86:1) · the date picker icon is near-black on dark, and the checkbox and textarea scrollbar render light (`color-scheme: normal`).
- **Settings.** Title leads · fine · fine · the selected visibility card is **blue fill + amber border** · the password toggle is a text button in Arial · - · fine · radio renders native light · platform as landing.
- **Invites.** Clear · fine · fine · a fourth green (`#34d399`) for "Ativado" · consistent · - · fine · the disabled submit is readable · platform as landing.
- **Sign in.** Card and title clear · fine · the help links wrap to two lines each at 375 · placeholder `#757575` (UA default) at 2.73:1 on `--input-bg` · the submit is **disabled until both fields are filled** (opacity .5, amber turned brown) · - · fine · a primary action that looks broken on first sight · no autofill styling exists (`grep -rn autofill app` returns nothing).
- **404.** One message, one action · fine · fine · fine · uses `EmptyState` · - · fine · fine · platform as landing.

## 4. Findings

### P0 - The WhatsApp card for 45% of permalinks is a blank book with a blue bookmark

**Objective.** `/entrada/860c…` (visitor) has `og:image = …/og-fallback.png`. `resolveEntryOgImageUrl` (`app/utils/entry.ts:69`) only uses `edition.cover_url`, `work.cover_url` and `ol_cover_id`. 39 of 86 logs have none of those with `https:`, only an ISBN, so 39 permalinks share the fallback. `public/og-fallback.png` (1200×630) is an empty dark rectangle with a `#40bcf4` bookmark - the retired blue - with no wordmark and no text.

**Subjective (consistency, first impression).** The permalink is the product's distribution channel. Nearly half the links pasted into the group show a generic, off-brand image.

**Change.** Redesign the fallback in the current palette: `--bg-color` background, the AppLogo mark, "Meus Livros" in Lora 72px `--poster-border`, a 4px `--highlight` rule. It is a static asset, so no runtime dependency. Keep the "never `?default=false` in `og:image`" rule.

### P1 - The profile's first screen has no books on the owner's laptop

**Objective.** At 1440 the reading map is 770px tall and the first cover starts at y=1195 (viewport 900). At 1920 the map is 1008px and the first cover is at y=1577. Blur test: the amber map and the amber `@handle` are the first things seen.

**Subjective (hierarchy, "poster first").** The profile is a library. A decorative map owning the first screen inverts the Letterboxd principle the product claims.

**Change.** In `ReadingMap.vue`, cap the map at `max-height: 320px` (≈ aspect 3.3:1 at 1440) with the SVG `preserveAspectRatio="xMidYMid meet"`, or place it after the grid. Acceptance: first cover top < 900px at 1440 and 1920.

### P1 - `@handle` is the loudest text on the profile

**Objective.** `button.handle` renders at 32px/700 in `--highlight` (`app/pages/@[handle].vue:564-567`), the same size as the display name beside it.

**Subjective (hierarchy, scarcity of accent).** The accent colour marks the one thing you can act on. Here it marks a username at headline size.

**Change.** `font-size: var(--font-size-lg)`, `font-weight: 500`, `color: var(--text-color)`, with the underline and highlight only on hover and focus.

### P1 - Native controls render light in a dark app

**Objective.** `getComputedStyle(document.documentElement).colorScheme` is `normal` on every route, and `grep -rn "color-scheme" app` returns nothing. Consequences observed:
- the date picker icon is near-black on `--input-bg` in `/app/entrada/{id}/editar`;
- the checkbox, radio and textarea scrollbar render in the light UA style;
- select popups use the light UA theme.

**Change.** `:root { color-scheme: dark; }` in `tokens.css`. One line, all routes.

### P1 - Buttons do not inherit the font

**Objective.** Arial is computed on `button.carousel-nav-btn`, `.btn-load-more`, `.btn-add-block`, `.format-btn`, `.delete-btn`, `.submit-btn` (profile, invites, sign-in) and `.toggle-password-btn`. `button.header-search-trigger` and the star buttons compute `13.3333px`, the UA default.

**Change.** In the global styles (`app/app.vue`): `button, input, select, textarea { font: inherit; color: inherit; }`.

### P1 - The member dashboard opens on two empty sections (375)

**Objective.** The first screen at 375 shows "Minha Leitura", "Lendo atualmente" with a dashed empty box, and "Minha estante" with a lone 24px "+" button and another dashed empty box. The finished-books carousel and the group activity start below y=812.

**Subjective (hierarchy).** The owner's 86 books and the group's activity are the content; two empty states are what a member sees first.

**Change.** In `app/pages/index.vue:31` and `:117`: when a section is empty, collapse it to a single 44px row ("Nada em leitura agora · Começar a ler →"), and render the carousel (`:119`) and the feed (`:124`) first.

### P1 - On the permalink, the review sits below reading-progress bookkeeping

**Objective.** For a visitor at 375, `.review-section` starts at y=962. Above it, `ReadingBlocksSection` (`app/pages/entrada/[id].vue:187`) takes 291px to say "224 de 224 páginas lidas (100%)" and "Nenhum trecho com anotação…".

**Change.** Render the review (`:196`) before `ReadingBlocksSection`. For a finished log with no blocks, show only a one-line "Lido por completo · 224 págs." for visitors.

### P1 - Owner's action row escapes the entry card at 375

**Objective.** `.actions-row` (`app/pages/entrada/[id].vue:640`) is `display: flex; flex-wrap: nowrap`, 343.7px wide, inside a card whose content box is 247px (card 32-343, `padding: 32px`). The buttons span x=16 to 359, 16px outside the card on each side.

**Change.** `flex-wrap: wrap` on the row. Card padding at `max-width: 540px`: `var(--space-4)` (16px), which raises the content to 311px.

### P1 - Member cards show initials instead of covers

**Objective.** `/membros` renders four grey initials tiles per member. `server/services/members.ts:51-53` returns only `cover_url`, while most covers come from `ol_cover_id` or the ISBN, which `BookCover` resolves but never receives here.

**Change.** Return `ol_cover_id` and `isbn13` in `recent_covers` and pass them to `BookCover`. This touches the server; it is still the only way this screen looks finished.

### P1 - The retired blue is still in five components

**Objective.** `rgba(64,188,244,*)` (#40bcf4, the blue from `docs/frontend.md` §8) remains in:

- `LogForm.vue:993`, `:1059` and `:1200`: focus glow, selected format, selected visibility;
- `AddBookForm.vue:1016`;
- `bem-vindo.vue:329`;
- `perfil.vue:531` and `:604`.

On screen, the selected-format fill is blue inside an amber UI, and the selected visibility card combines a blue fill with an amber border. `docs/frontend.md` §8 still documents `--highlight: #40bcf4` and `--star-color: #0083e0`; `tokens.css` has `#f59e0b`.

**Change.** Add `--highlight-soft: rgba(245, 158, 11, 0.12)` and `--highlight-glow: rgba(245, 158, 11, 0.25)` to `tokens.css`, replace the seven occurrences, and correct §8.

### P2 - "Remover" fails AA

**Objective.** `button.delete-btn` in the log editor measures `#ef4444` on `#232a31` = **3.86:1** at 14px.

**Change.** Add `--danger-text: #f87171` (5.25:1 on `--card-bg`) for text-only danger. Keep `--danger` for fills.

### P2 - Four greens, no token

**Objective.** `#3fb950` (`JsonImportSection.vue:517,609`, `entrada/[id].vue:682`), `#34d399` (`convites.vue:404,502`, `perfil.vue:638`, `entrar/senha.vue:524`), `#00e054` (as a fallback of `--highlight` in `JsonImportSection.vue:440-471`) and `#10b981` (`LandingPillars.vue:317`). One meaning (success) spelled four ways.

**Change.** Add `--success: #34d399` and use it everywhere. Remove the `#00e054` fallbacks: the token exists.

### P2 - Card stars do not line up across a row

**Objective.** In one grid row at 375, the cards measure 328px and 314px because one title wraps to two lines and the other to one, so the stars sit at different heights.

**Change.** In `BookCard.vue`, give `.caption` `min-height: calc(2 × title line-height + author line-height + gap)` on touch (≈ 52px at 12px/1.2), or push `.info` to the bottom with `margin-top: auto` in a column-flex card.

### P2 - The missing-cover placeholder reads as an error

**Objective.** A forced `error` renders flat `#2c3440` with two grey initials ("OR"), beside full-colour covers.

**Subjective (consistency).** In a poster-first grid, a missing poster should look like a plain edition, not a broken image.

**Change.** In the SVG built at `BookCover.vue:86`: a vertical gradient `--card-bg`→`--input-bg`, the full title in Lora (2-3 lines, 13px, `--poster-border` at 80%) and the author in Inter 10px `--text-color`, with a 4px `--highlight` spine on the left.

### P2 - Type scale: five off-scale sizes in regular use

**Objective.**

| Size | Where |
|---|---|
| 21.6px / 18.4px | site title, `default.vue:97` and `:216` |
| 14.4px | stars, `StarRating.vue:37` |
| 16.8px | card and feed titles, `ShelfSection.vue:225`, `FeedItem.vue:122` |
| 11px | carousel date and excerpt, `ReadingCarousel.vue:275` and `:282`, `ShelfSection.vue:252` |

The dashboard shows 11 distinct sizes at 375.

**Change.** Map them onto the scale: xl, sm, lg, xs. Target: ≤ 6 distinct sizes per route.

### P2 - Book page: one card in a sea of gutter, and a noisy histogram

**Objective.** `.work-card` is capped at `max-width: 900px` (`livro/[slug].vue:417`) and renders 680px wide at 1440 (53% empty) and 868px at 1920 (55%). With one rating, `RatingHistogram` draws 10 tracks and a single bar.

**Change.** At ≥ 1024px, a two-column layout inside a 1100px container: cover, meta and action sticky on the left (280px), logs and editions on the right. Render the histogram only when `ratings.length >= 3`.

### P2 - Sign-in: primary action looks disabled, weak placeholder

**Objective.** The "Entrar" submit is `disabled` until both fields have text (`entrar/index.vue:62`), rendered at opacity .5 (brown). The placeholder is the UA `#757575`, 2.73:1 on `--input-bg`, and "seu-email@exemplo.com ou" is truncated. At 375 the two help links wrap to two lines each.

**Change.**
- Keep the button enabled and validate on submit (the Zod check already exists).
- `::placeholder { color: var(--text-color); opacity: 1 }` in `forms.css` (5.28:1; still distinct from the white value text - at 70% opacity it would drop to 3.41:1).
- Placeholder text "e-mail ou usuário".
- Stack the help links vertically at < 400px.

### P3 - Platform finish

**Objective.**
- No `<meta name="theme-color">`: the Android address bar stays white-grey above a dark page.
- `-webkit-tap-highlight-color` is the default `rgba(51,181,229,.4)`, a blue flash on every card tap.
- `::selection` is the UA default.
- Broken-image `alt` text would render in UA link blue `rgb(0,0,238)`, because `a.cover-link` does not set `color`.

**Change.**
- `theme-color: #14181c` in `nuxt.config.ts` `app.head.meta`.
- `a, button { -webkit-tap-highlight-color: transparent }`.
- `::selection { background: var(--highlight); color: var(--bg-color) }`.
- `color: inherit` on cover links.

## 5. System-level findings

1. **No global element reset.** Form controls fall back to UA font, size, colour and `color-scheme`, which explains Arial, 13.33px, the light date icon and the light scrollbars across seven routes. One block in the global styles fixes all of them.
2. **The palette has no tokens for the states it needs** - soft highlight, success, danger text, placeholder - so each component invented its own: 4 greens, 7 leftover blues, 2 GitHub greys, 1 Tailwind slate. Tokens first; then `grep -rnE "#[0-9a-f]{3,8}" app --include=*.vue | grep -v "var(--"` should approach zero. It returns 226 raw hex today, plus 116 fallbacks.
3. **Buttons are re-styled per page.** The log editor alone has 10 variants; the dashboard 5; the entry page 5. Semantically there are 4: primary, secondary (outlined), ghost/text, danger. A `ui/BaseButton.vue` with `variant` and `size`, or `.btn-*` classes finished in `forms.css`, is the primitive the 2026-09-20 audit already asked for.
4. **Off-scale spacing clusters in the nav.** `padding: 4px 10px` on every `.nav-link`, `.site-title` and `.genre-chip`, plus `.tab-count 1px 6px` and `.bottom-nav-link 6px 2px, gap 3px`. Moving them to `var(--space-2) var(--space-3)` removes most of the off-scale values on every route (they are 10-12 of the 14-19 listed per page).
5. **The accent is spent on stars.** 86 of the 95 highlight uses on the profile are star glyphs. When the stars are amber, amber cannot also mark "the action" and "the active tab". Proposal: stars in `--poster-border` at 85% opacity on the grid, amber only on the book page and the entry, where the rating is the content.

## 6. What already works - do not regress it

- No horizontal scroll on any audited route at 320, 375, 768, 1024, 1440 or 1920.
- Focus ring: `2px solid var(--highlight)`, offset 4px, visible on covers and on `--card-bg` (keyboard Tab on `/@MeusLivros`).
- Measured contrast: every text element except `delete-btn` passes AA. The existing `--text-color` on `--bg-color` is fine.
- Review typography on the permalink: 16px Inter, line-height 1.6, 61ch at 1440.
- Card captions (TASK-040): the title renders once, is clamped to 2 lines and the author to 1, and a 120-character title still ellipsizes cleanly.
- Filters on a phone (TASK-042): 2×2 grid, 44px controls, full-width "Limpar".
- Header touch targets (TASK-048): 44px at 320.
- The cover shimmer never hides a cover in SSR: 0 `is-loading` in the SSR HTML of `/@MeusLivros`, and all 86 `span.book-cover` wrappers are present.
- Inter and Lora are loaded (`document.fonts`), with serif for titles and sans for UI, consistently.
- `og:title` composition: `Título - ★★★½ por @handle`.
- The landing (TASK-046) at every width, and the 404 page.

## 7. Proposed tasks

### TASK-049 - Platform dark mode and element reset
**Files:** `app/assets/css/tokens.css`, `app/app.vue`, `app/assets/css/forms.css`, `nuxt.config.ts` (`app.head.meta` only).
**Criteria:**
- `getComputedStyle(document.documentElement).colorScheme === 'dark'` on every route.
- No text element computes a `font-family` other than Inter or Lora on `/`, `/@MeusLivros`, `/entrada/{id}`, `/app/entrada/{id}/editar`, `/entrar`.
- No element computes `font-size: 13.3333px`.
- `<meta name="theme-color" content="#14181c">` is in the SSR HTML.
- `-webkit-tap-highlight-color` on `a.card` is `rgba(0, 0, 0, 0)`.
- The placeholder on `/entrar` measures ≥ 4:1 against `--input-bg`.

### TASK-050 - Retire the blue, add state tokens
**Files:** `tokens.css`, `LogForm.vue`, `AddBookForm.vue`, `bem-vindo.vue`, `perfil.vue`, `JsonImportSection.vue`, `convites.vue`, `entrada/[id].vue`, `entrar/senha.vue`, `LandingPillars.vue`, `docs/frontend.md` §8.
**Criteria:**
- `grep -rniE "64, ?188, ?244|#40bcf4|#0083e0" app` returns nothing.
- `grep -rhoiE "#(3fb950|34d399|00e054|10b981)" app` returns nothing (all via `--success`).
- `delete-btn` contrast ≥ 4.5:1.
- §8 lists the tokens in `tokens.css`.

### TASK-051 - OG fallback in the current brand
**Files:** `public/og-fallback.png`.
**Criteria:**
- 1200×630, background `#14181c`, the wordmark "Meus Livros" readable at 300px wide.
- No `#40bcf4` pixel.
- File < 60 KB.

### TASK-052 - Profile: books above the fold, quieter handle
**Files:** `app/components/profile/ReadingMap.vue`, `app/pages/@[handle].vue`.
**Criteria:**
- At 1440×900 and 1920×1000, the first `a.card` top is < viewport height.
- `button.handle` computes a font-size ≤ 18px and a `color` equal to `--text-color`.

### TASK-053 - Permalink: review first, actions inside the card
**Files:** `app/pages/entrada/[id].vue`, `app/components/log/ReadingBlocksSection.vue`.
**Criteria:**
- At 375×812, a visitor sees `.review-section` top < 812.
- The owner's `.actions-row` `getBoundingClientRect()` stays within the card's content box.
- At < 540px the card padding computes to 16px.

### TASK-054 - Dashboard: content before empty states
**Files:** `app/pages/index.vue`, `app/components/dashboard/ShelfSection.vue`.
**Criteria:**
- With 0 in-progress and 0 shelf books at 375×812, the first carousel cover's top is < 812.
- An empty section renders one row ≤ 56px tall.

### TASK-055 - Type scale and nav spacing
**Files:** `app/layouts/default.vue`, `app/layouts/app.vue`, `app/components/book/StarRating.vue`, `ReadingCarousel.vue`, `ShelfSection.vue`, `FeedItem.vue`.
**Criteria:**
- ≤ 6 distinct computed `font-size` values (excluding DevTools) on `/`, `/@MeusLivros`, `/atividade` at 375 and 1440, all in the `--font-size-*` set.
- The off-scale spacing count from the §4 script is ≤ 5 on those routes.

### TASK-056 - Card polish: aligned stars, a placeholder that looks like a book
**Files:** `app/components/book/BookCard.vue`, `app/components/book/BookCover.vue`.
**Criteria:**
- In any grid row at 375, all `.info` (stars) elements share the same `top` (±1px).
- The error placeholder renders the title as text inside the SVG and uses no colour outside the tokens.

### TASK-057 - Member cards show real covers
**Files:** `server/services/members.ts`, `shared/schemas/members.ts`, `app/pages/membros.vue`.
**Criteria:**
- For `@MeusLivros`, 4 of 4 recent covers on `/membros` render an `<img>` whose `currentSrc` is not a `data:` URI.

### TASK-058 - Book page layout on wide screens
**Files:** `app/pages/livro/[slug].vue`, `app/components/book/RatingHistogram.vue`.
**Criteria:**
- At 1440, the content spans ≥ 1000px.
- The histogram is absent with < 3 ratings and present with ≥ 3.

### TASK-059 - Sign-in finish
**Files:** `app/pages/entrar/index.vue`.
**Criteria:**
- The submit button is enabled on load.
- With empty fields, submit shows the existing pt-BR error and makes no request.
- At 375, each help link is on one line.
