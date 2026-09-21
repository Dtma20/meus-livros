# Frontend

Nuxt 4, Vue 3 `<script setup>`, TypeScript. No component library, no CSS framework — the existing `styles.css` tokens are ported and extended.

---

## 1. Routes

Eleven route shapes. Four carry Open Graph tags; four are authenticated; three are the sign-in flows.

| Route | Auth | Rendering | Indexable | Purpose |
|---|---|---|---|---|
| `/` | optional | SSR | — | Landing for strangers; 10 most recent visible entries for members |
| `/@[handle]` | optional | SSR + **OG** | — | Profile: poster grid, filters, stat counters, map |
| `/livro/[slug]` | optional | SSR + **OG** | — | Work page: metadata + everyone's visible entries |
| `/entrada/[id]` | optional | SSR + **OG** | — | **The review permalink. The object pasted into WhatsApp** |
| `/entrar` | public | SSR | no | Sign-in: `handle` or email + password |
| `/entrar/ativar` | public | SSR | no | First access: email → 6-digit code → choose a password |
| `/entrar/senha` | public | SSR | no | Forgot password: email → 6-digit code → new password |
| `/app/bem-vindo` | session | SSR | no | Choose handle + display name (first sign-in only) |
| `/app/novo` | session | SSR | no | Log a book |
| `/app/entrada/[id]/editar` | session + owner | SSR | no | Edit an entry |
| `/app/perfil` | session | SSR | no | Edit bio, display name, profile visibility |

**There is no sitemap and no `robots.txt` beyond `Disallow: /app/`.** The channel is a group chat, not Google. SEO is explicitly out of scope ([mvp-definition.md](mvp-definition.md) §3). Public pages are *shareable*, which is a different requirement from *indexable* — it means correct OG tags, not crawl optimisation.

**Not built:** `/autor/*`, `/genero/*`, `/pais/*`, `/ano/*`, `/busca`, `/feed`, `/estatisticas`, `/listas`. All deferred.

---

## 2. Open Graph

The single highest-leverage thing on the frontend. A bare URL in a group chat gets scrolled past; a cover image with a rating and a line of Portuguese prose gets tapped.

Every public route sets:

```html
<meta property="og:title">        <!-- "O retorno do rei — ★★★★½ por @diogo" -->
<meta property="og:description">  <!-- first ~160 chars of the review, plain text -->
<meta property="og:image">        <!-- edition cover, absolute URL -->
<meta property="og:type" content="article">
<meta property="og:locale" content="pt_BR">
<meta property="og:url">          <!-- canonical, absolute -->
```

Two rules learned the hard way:

1. **Never emit a cover URL carrying `?default=false` as `og:image`.** That parameter makes Open Library return `404` for unknown ISBNs, which is correct for an `<img onerror>` fallback but leaves WhatsApp with a broken preview — on exactly the books with no cover. Serve a **static fallback image** when there is no cover.
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

The existing file is **one 421-line `setup()` block with no component boundaries**. Decomposition is real work — roughly 2–3 days — not a copy-paste. Budget it honestly.

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

**Default: server.** Public pages fetch their data in the SSR pass via `useAsyncData` calling a service directly — no round trip through `/api`.

Client-side only where interaction demands it:

- `SearchBox` — debounced 250 ms, calls `/api/search`
- `ExternalLookup` — explicit button, never automatic
- `ReadingMap` — `<ClientOnly>`
- `FilterBar` / sorting — operates on already-loaded data, no refetch
- `LogForm` — client validation mirroring the server's Zod schema

**State management: none.** No Pinia in the MVP. Session comes from `useUserSession()`; page data from `useAsyncData`; form state is local `ref`s. Add Pinia when two distant components genuinely share mutable state — they do not yet.

---

## 5. Forms and validation

`LogForm` is the most important component in the product.

- The **same Zod schema** is imported by the form and the server route. One definition, `shared/schemas/`.
- Client validation is a convenience. **The server revalidates everything**, always.
- `finished_on` defaults to the **browser's** local date, not the server's (UTC would record tomorrow for anything logged after 21:00 in Brazil).
- Rating input: 10 half-star steps, keyboard-operable (arrow keys), `aria-valuenow`.
- Review: plain `<textarea>`. No rich text, no markdown preview, no toolbar.
- Edition picker: **collapsed by default** behind "li outra edição?". Most users never open it.
- Submit disabled while in flight; the button shows a spinner; a failure keeps the typed text.

**Losing a typed review is the worst failure this app can have.** `LogForm` drafts to `localStorage` on every change, restores on mount, and clears only after a confirmed save. Wrapped in try/catch — private-mode browsers throw.

---

## 6. Loading, error and empty states

Every list has all three. The current app has **none** — filtering to zero results renders a blank void with a footer reading "0 Páginas Lidas".

| State | Treatment |
|---|---|
| Loading | Skeleton grid matching the real card dimensions. No spinners on full pages |
| Error | `ErrorState` with a plain-Portuguese message and a retry button. Never a stack trace |
| Empty — no results | Names the active filters and offers "limpar filtros" |
| Empty — new profile | "Ainda não registrou nenhum livro" + a link to `/app/novo` |
| Empty — search miss | The **manual-add path, prominently**, not a dead end. This is the 60% case |
| Open Library unavailable | "Não conseguimos buscar online agora" + manual add. Never an error page |

The search-miss state carries unusual weight: Open Library will fail to find the book roughly 60% of the time ([book-catalog.md](book-catalog.md)), so "não encontrei" is a **normal, expected outcome** and must look like a next step rather than a failure.

---

## 7. Responsive and accessible

Mobile-first. The cohort reads links on phones, in WhatsApp's in-app browser.

- Breakpoints: 600px (the existing one), 900px. Grid: 2 columns → 4 → 6.
- 16px side gutter, no horizontal scroll at 320px.
- Test in WhatsApp's in-app browser specifically, not only in Chrome DevTools.

Accessibility fixes the current app needs (it is presently unusable with a screen reader):

- Cards become `<a>` wrapping the cover, not `<div @click>` — this also makes them middle-clickable and shareable.
- Every cover `<img>` gets `alt="Capa de {title}, de {author}"`.
- Modals: focus trap, Escape closes, focus restored, close control is a `<button aria-label="Fechar">`.
- Star ratings expose `role="img"` with a text label; the input version is a real radio group.
- Visible focus rings. Do not remove outlines.
- Colour contrast: the existing `--text-color: #9ab` on `--bg-color: #14181c` is approximately 6.6:1 — passes AA. Keep it when extending the palette.

---

## 8. Design tokens

Port `styles.css` `:root` as-is; it is coherent and the owner's aesthetic:

```css
--bg-color: #14181c;  --card-bg: #232a31;  --text-color: #9ab;
--poster-border: #fff; --star-color: #0083e0; --highlight: #40bcf4;
--input-bg: #2c3440;
```

Add only what is missing: a spacing scale, a type scale, radii, and `--danger`.

**Fix while porting:** the GeoChart colours are hardcoded in `index.html:339-350` and duplicate these values. If the map survives as GeoChart, it reads the tokens via `getComputedStyle`. One source of truth for the palette.

Dark theme only. A light theme is not in the MVP.
