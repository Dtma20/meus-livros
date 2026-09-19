# TASK-025 — Reading map *(should-have)*

## Goal

Port the country map to the profile page.

## Context

The most distinctive screen in the legacy app and the seed of a real differentiator — no major competitor treats reading geography as a shareable identity. It is also the only part of the legacy frontend that is **not SSR-safe**: a third-party CDN script (`legacy/index.html:12`) driven by direct DOM manipulation (`legacy/index.html:336`).

**Should-have, not must-have.** It is decoration on the core loop. Cut it if time is short.

## Scope

### Included

- `ReadingMap.vue` on the profile
- Country data from `authors.country_code`
- Click-to-filter

### Explicitly excluded

- A dedicated map page
- Reading challenges or goals
- Language-based maps

## Dependencies

- TASK-016

## Expected files/components

```
app/components/profile/ReadingMap.vue
```

## Implementation requirements

1. **Decide the approach first** — this is [open-questions.md](../open-questions.md) Q6:
   - **Option A**: port Google Charts GeoChart inside `<ClientOnly>` with a lazy loader. Fastest, but keeps a blocking third-party CDN script and cannot server-render.
   - **Option B** *(recommended)*: a static SVG world map coloured from the same data. No third party, SSR-safe, renders inside an OG screenshot, one fewer CDN dependency. Roughly a day.
2. Data comes from `authors.country_code` (ISO 3166-1 alpha-2) aggregated over the profile's **visible** logs. The legacy `mapCountryName` hardcoded map is deleted — it was a workaround for GeoChart requiring English names, and it is the reason the legacy modal leaks "United Kingdom" into a Portuguese UI.
3. Country labels via `Intl.DisplayNames('pt-BR', { type: 'region' })`.
4. Colour scale from the CSS tokens, read via `getComputedStyle`. **Do not hardcode colours** — the legacy code duplicates the palette in `legacy/index.html:339-350`, which is why the theme has two sources of truth.
5. Clicking a country filters the profile grid, matching the legacy behaviour.
6. Countries with no ISO code (`Roma Antiga`) are excluded from the map but still counted in the country stat, with a note.
7. If Option A: `<ClientOnly>` with a skeleton fallback, and the script loaded lazily so it never blocks first paint.

## Data/API changes

None — aggregates existing data.

## UX requirements

- The map is visible without a modal if it fits; otherwise behind the countries stat box, as in the legacy app.
- Hover/tap shows the country name in Portuguese and the book count.
- Clicking filters; the active filter is clearly indicated and clearable.
- On a phone the map is legible or gracefully hidden — a squashed world map is worse than none.

## Security requirements

- Aggregates only **visible** logs. A privado entry must not contribute a country to a stranger's view — with few books, one country can identify one book.
- Option A loads third-party JavaScript: it must be compatible with the CSP `script-src`. If it requires loosening the CSP, that is a strong argument for Option B.

## Testing requirements

- Integration: the map reflects only visible logs; a privado entry's country does not appear to a stranger.
- Integration: clicking a country filters the grid.
- Integration: `Roma Antiga` is excluded from the map but counted in the stat.
- Component: country names render in Portuguese.

## Acceptance criteria

- [ ] The map renders on the profile with countries coloured by book count
- [ ] Country names display in Portuguese
- [ ] A privado entry's country does not appear to a stranger
- [ ] Clicking a country filters the grid; the filter is clearable
- [ ] A work whose author country has no ISO code is excluded from the map but counted in the stat
- [ ] Map colours derive from CSS tokens, not hardcoded values
- [ ] If Option A: the page server-renders without the map and hydrates it afterwards; no CSP violation
- [ ] On a 375px viewport the map is legible or hidden
- [ ] The map does not block first paint

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

Option B is recommended. Beyond being SSR-safe, a static SVG appears in an OG preview image — and the map is the most visually striking thing the product has, which makes it worth putting in front of people who have not signed up yet.
