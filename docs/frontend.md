# Frontend

Nuxt 4, Vue 3 `<script setup>`, TypeScript. No component library, no CSS framework - the existing `styles.css` tokens are ported and extended.

---

## 1. Routes

Eleven route shapes. Four carry Open Graph tags; four are authenticated; three are the sign-in flows.

| Route | Auth | Rendering | Indexable | Purpose |
|---|---|---|---|---|
| `/` | optional | SSR | - | Landing for strangers; 10 most recent visible entries for members |
| `/@[handle]` | optional | SSR + **OG** | - | Profile: poster grid, filters, stat counters, map |
| `/livro/[slug]` | optional | SSR + **OG** | - | Work page: metadata + everyone's visible entries |
| `/entrada/[id]` | optional | SSR + **OG** | - | **The review permalink. The object pasted into WhatsApp** |
| `/entrar` | public | SSR | no | Sign-in: `handle` or email + password |
| `/entrar/ativar` | public | SSR | no | First access: email → 6-digit code → choose a password |
| `/entrar/senha` | public | SSR | no | Forgot password: email → 6-digit code → new password |
| `/app/bem-vindo` | session | SSR | no | Choose handle + display name (first sign-in only) |
| `/app/novo` | session | SSR | no | Log a book |
| `/app/entrada/[id]/editar` | session + owner | SSR | no | Edit an entry |
| `/app/perfil` | session | SSR | no | Edit bio, display name, profile visibility |

**There is no sitemap and no `robots.txt` beyond `Disallow: /app/`.** The channel is a group chat, not Google. SEO is explicitly out of scope ([mvp-definition.md](mvp-definition.md) §3). Public pages are *shareable*, which is a different requirement from *indexable* - it means correct OG tags, not crawl optimisation.

**Not built:** `/autor/*`, `/genero/*`, `/pais/*`, `/ano/*`, `/busca`, `/feed`, `/estatisticas`, `/listas`. All deferred.

---

## 2. Open Graph

The single highest-leverage thing on the frontend. A bare URL in a group chat gets scrolled past; a cover image with a rating and a line of Portuguese prose gets tapped.

Every public route sets:

```html
<meta property="og:title">
<meta property="og:description">
<meta property="og:image">
<meta property="og:type" content="article">
<meta property="og:locale" content="pt_BR">
<meta property="og:url">
```

Two rules learned the hard way:

1. **Never emit a cover URL carrying `?default=false` as `og:image`.** That parameter makes Open Library return `404` for unknown ISBNs, which is correct for an `<img onerror>` fallback but leaves WhatsApp with a broken preview - on exactly the books with no cover. Serve a **static fallback image** when there is no cover.
2. **`og:image` must be absolute and publicly reachable with no cookies.** Test by pasting a real link into a real WhatsApp chat. Validators lie.

**Verification is manual and required:** [tasks/014](tasks/014-entry-permalink-and-og.md) is not done until a link has been pasted into WhatsApp on Android and iOS and the preview observed.

---

## 3. Component hierarchy

```
app/
├── layouts/
│   ├── default.vue          # header, nav, container
│   └── app.vue              # authenticated shell
├── pages/                   # the routes above
└── components/
    ├── book/
    │   ├── BookCard.vue      # poster + stars (from index.html:145-152)
    │   ├── BookGrid.vue      # responsive grid (from .grid)
    │   ├── BookCover.vue     # src fallback chain + alt text
    │   └── StarRating.vue    # display AND input; half-star
    ├── log/
    │   ├── LogEntry.vue      # one diary entry
    │   ├── LogForm.vue       # the core creative act
    │   └── ReviewText.vue    # renders plain text, whitespace-pre-wrap
    ├── search/
    │   ├── SearchBox.vue     # debounced local search
    │   └── ExternalLookup.vue# explicit "buscar online" button
    ├── profile/
    │   ├── StatBox.vue
    │   ├── FilterBar.vue     # genre / country / decade (from index.html:101-142)
    │   └── ReadingMap.vue    # <ClientOnly>
    └── ui/
        ├── EmptyState.vue
        ├── ErrorState.vue
        └── AppModal.vue      # focus trap, Escape, <button> close
```

### Porting from `index.html`

The existing file is **one 421-line `setup()` block with no component boundaries**. Decomposition is real work - roughly 2–3 days - not a copy-paste. Budget it honestly.

| Existing code | Port | Note |
|---|---|---|
| `.grid` / `.card` markup | `BookGrid` + `BookCard` | Nearly direct |
| `getStars()` `index.html:385` | `StarRating` | Add an input mode |
| `getCover()` `index.html:375` | `BookCover` | **Add `?default=false`** and real `alt` text |
| filter selects `index.html:101-142` | `FilterBar` | **Fix**: `filterCountry` initialises to `null` while the reset option is `""`, so it renders blank on load |
| `sortedBooks` `index.html:279` | `useBookFilters()` | Keep the `original_index` stable-sort tiebreak |
| `mapCountryName` `index.html:199` | delete | Replaced by ISO codes + `Intl.DisplayNames('pt-BR')` |
| GeoChart `index.html:322-367` | `ReadingMap` | **Not SSR-safe.** Third-party CDN script + direct DOM manipulation. `<ClientOnly>` + lazy load, or replace with a static SVG map |
| `v-html` review `index.html:77` | `ReviewText` | **Deleted.** Plain text + `white-space: pre-wrap` |

---

## 4. Server/client boundary

**Default: server.** Public pages fetch their data in the SSR pass via `useAsyncData` calling a service directly - no round trip through `/api`.

Client-side only where interaction demands it:

- `SearchBox` - debounced 250 ms, calls `/api/search`
- `ExternalLookup` - explicit button, never automatic
- `ReadingMap` - `<ClientOnly>`
- `FilterBar` / sorting - operates on already-loaded data, no refetch
- `LogForm` - client validation mirroring the server's Zod schema

**State management: none.** No Pinia in the MVP. Session comes from `useUserSession()`; page data from `useAsyncData`; form state is local `ref`s. Add Pinia when two distant components genuinely share mutable state - they do not yet.

---

## 5. Forms and validation

`LogForm` is the most important component in the product.

- The **same Zod schema** is imported by the form and the server route. One definition, `shared/schemas/`.
- Client validation is a convenience. **The server revalidates everything**, always.
- `finished_on` defaults to the **browser's** local date, not the server's (UTC would record tomorrow for anything logged after 21:00 in Brazil).
- Rating input: 10 half-star steps, keyboard-operable (arrow keys), `aria-valuenow`.
- Review: plain `<textarea>`. No rich text, no markdown preview, no toolbar.
- Edition picker: **collapsed by default** behind "li outra edição?". Most users never open it.
- Submit disabled while in flight; the button shows a spinner; a failure keeps the typed text. `handleSubmit` also returns early while a save is pending, and controls stay disabled until navigation to the saved entry settles.
- On edit, a field the user cleared is sent as `null`, never `undefined`: the service skips `undefined` fields, so `undefined` would mean "keep the old value".

**Losing a typed review is the worst failure this app can have.** `LogForm` and `AddBookForm` draft through `useFormDraft` (`app/composables/useFormDraft.ts`):

- Key `meus-livros:form-draft:v1:<form>:<userId>:<mode>:<context>`. No user id, no draft. Another account on the same browser never restores it.
- Writes are debounced (250 ms) and flushed on `beforeunload` and unmount; restore validates every field before applying it.
- Cleared after a confirmed save, and on sign-out: `handleSignOut` calls `clearStoredFormDrafts`, which also removes the pre-v1 keys `meus-livros:log-draft` and `meus-livros:add-book-draft`.
- Wrapped in try/catch - private-mode browsers throw.

---

## 6. Loading, error and empty states

Every list has all three. The current app has **none** - filtering to zero results renders a blank void with a footer reading "0 Páginas Lidas".

| State | Treatment |
|---|---|
| Loading | Skeleton grid matching the real card dimensions. No spinners on full pages |
| Error | `ErrorState` with a plain-Portuguese message and a retry button. Never a stack trace |
| Empty - no results | Names the active filters and offers "limpar filtros" |
| Empty - new profile | "Ainda não registrou nenhum livro" + a link to `/app/novo` |
| Empty - search miss | The **manual-add path, prominently**, not a dead end. This is the 60% case |
| Open Library unavailable | "Não conseguimos buscar online agora" + manual add. Never an error page |

Rules that came out of the 2026-09-30 review ([reports/frontend-review-2026-09-30.md](reports/frontend-review-2026-09-30.md)):

- **404 and failure are different states.** A page shows "não encontrado" only for a real 404; any other error is `ErrorState` with retry, and the SSR response carries the real status.
- **Independent sources fail independently.** The dashboard settles `/api/dashboard` and `/api/feed/recentes` separately; a feed failure shows an error inside the feed section and keeps the reader's shelves.
- **Content is visible without JavaScript.** Scroll reveal only hides an element after the client adds `.reveal-enabled`; the SSR HTML is never at `opacity: 0`.
- **Destructive actions are delayed, not confirmed.** `useDelayedDelete` runs a 6 s countdown with Desfazer; the DELETE is sent when it ends, on unmount, or with `keepalive` on `pagehide`. A `pagehide` result is reported after a back-forward-cache return; a failure restores the item and shows the error. Leaving mid-countdown deletes - see Q7 in [open-questions.md](open-questions.md).

The search-miss state carries unusual weight: Open Library will fail to find the book roughly 60% of the time ([book-catalog.md](book-catalog.md)), so "não encontrei" is a **normal, expected outcome** and must look like a next step rather than a failure.

---

## 7. Responsive and accessible

Mobile-first. The cohort reads links on phones, in WhatsApp's in-app browser.

- Breakpoints: 600px (the existing one), 900px. Grid: 2 columns → 4 → 6.
- 16px side gutter, no horizontal scroll at 320px.
- Test in WhatsApp's in-app browser specifically, not only in Chrome DevTools.

Accessibility fixes the current app needs (it is presently unusable with a screen reader):

- Cards become `<a>` wrapping the cover, not `<div @click>` - this also makes them middle-clickable and shareable.
- Every cover `<img>` gets `alt="Capa de {title}, de {author}"`.
- Modals: focus trap, Escape closes, focus restored, close control is a `<button aria-label="Fechar">`.
- Star ratings expose `role="img"` with a text label; the input version is a native `<input type="range" step="0.5">` labelled by the visible "Sua avaliação" (`aria-labelledby`).
- Single-character shortcuts (`/`, `n`, `?`, `g` + letter) can be turned off in the shortcuts dialog (WCAG 2.1.4). The preference is per device, in `localStorage` key `ml:character-key-shortcuts-enabled`; the dialog stays reachable from the "Atalhos de teclado" button in the header.
- Visible focus rings. Do not remove outlines.
- Colour contrast: the existing `--text-color: #9ab` on `--bg-color: #14181c` is approximately 6.6:1 - passes AA. Keep it when extending the palette.

---

## 8. Design tokens

The palette lives in `app/assets/css/tokens.css`:

```css
color-scheme: dark;

--bg-color: #14181c;
--card-bg: #232a31;
--text-color: #9ab;
--poster-border: #fff;
--star-color: #f59e0b;
--highlight: #f59e0b;
--highlight-hover: #d97706;
--input-bg: #2c3440;

--danger: #ef4444;
--danger-text: #f87171;
--success: #34d399;
--highlight-soft: rgba(245, 158, 11, 0.12);
--highlight-glow: rgba(245, 158, 11, 0.25);
```

Add only what is missing: a spacing scale, a type scale, radii, and `--danger`.

**Fix while porting:** the GeoChart colours are hardcoded in `index.html:339-350` and duplicate these values. If the map survives as GeoChart, it reads the tokens via `getComputedStyle`. One source of truth for the palette.

Dark theme only. A light theme is not in the MVP.
