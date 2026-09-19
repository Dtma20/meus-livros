# TASK-014 — Entry permalink and Open Graph

## Goal

`/entrada/{id}` — a server-rendered page for one reading log, with Open Graph tags that preview correctly in WhatsApp.

## Context

**The single highest-leverage page in the product.** WhatsApp is the entire distribution channel. A bare URL is scrolled past; a cover image with a rating and a line of Portuguese prose gets tapped. This is the object that gets shared, and the object strangers land on.

## Scope

### Included

- `/entrada/[id]` server-rendered
- OG tags with a real cover image
- A share affordance
- 404 for private/missing entries

### Explicitly excluded

- Likes, comments
- Sitemaps and SEO — the channel is a group chat, not Google

## Dependencies

- TASK-013

## Expected files/components

```
app/pages/entrada/[id].vue
server/services/logs.ts   (extended)
public/og-fallback.png
```

## Implementation requirements

1. Server-rendered on every request. No client-side fetch for the primary content — WhatsApp's crawler does not execute JavaScript.
2. Fetch through `visibleLogs(viewer)`. A `privado` entry belonging to someone else returns **404**.
3. Page shows: cover, title, author(s), year, the reader's handle and display name, the rating, the full review, the reading date (formatted by `finished_precision` — `'ano'` renders "2016", not "1 de janeiro de 2016"), and the format.
4. OG tags:
   - `og:title` — `"{title} — ★★★★½ por @{handle}"`
   - `og:description` — the first ~160 chars of the review, plain text, HTML-attribute-escaped. Falls back to `"{display_name} leu {title}"` when there is no review.
   - `og:image` — absolute cover URL
   - `og:type=article`, `og:locale=pt_BR`, `og:url` canonical absolute
5. **`og:image` must never carry `?default=false`.** That parameter makes Open Library return 404 for unknown ISBNs, which is correct for an `<img onerror>` fallback but leaves WhatsApp with a broken preview on exactly the books that have no cover. Serve `/og-fallback.png` instead.
6. `Cache-Control: private, no-store` when rendered with a session; public entries rendered anonymously may be cached briefly.
7. A share button using the Web Share API where available, falling back to copy-to-clipboard.
8. Links to the work page and the reader's profile.

## Data/API changes

None — reuses the log service.

## UX requirements

- Readable on a phone: review text at a comfortable measure, not full-width.
- The review preserves paragraph breaks (`white-space: pre-wrap`).
- Reading date formatted per precision.
- A stranger landing here must understand whose library this is and be able to navigate onward.

## Security requirements

- `visibleLogs(viewer)` is the only access path.
- `privado` returns 404, never 403.
- `og:description` built from plain text and attribute-escaped — no injection via a review into a meta tag.
- Never render a `privado` entry into a cacheable response.

## Testing requirements

- Integration: a `publico` entry renders 200 with complete OG tags.
- Integration: a `privado` entry returns 404 to an anonymous viewer and to a second user.
- Integration: a `privado` entry returns 200 to its owner.
- Integration: `og:description` on an entry whose review contains `"` produces valid HTML.
- Integration: an entry with no cover uses `/og-fallback.png`, not a `?default=false` URL.
- Integration: `finished_precision = 'ano'` renders a year only.
- **Manual (blocking): paste a real link into a real WhatsApp chat on Android and on iOS, and observe the preview.**

## Acceptance criteria

- [ ] `/entrada/{id}` for a público entry returns 200 with `og:title`, `og:description`, `og:image`, `og:url` present and absolute
- [ ] Viewing the HTML source with JavaScript disabled shows the full review text
- [ ] A privado entry returns 404 to anonymous and to a second user
- [ ] A privado entry returns 200 to its owner
- [ ] `og:image` never contains `default=false`
- [ ] An entry without a cover uses the static fallback image
- [ ] A review containing `"` and `<` produces valid, non-injected meta tags
- [ ] `finished_precision = 'ano'` renders `2016`, not a full date
- [ ] **A link pasted into WhatsApp on Android shows cover, title and review snippet**
- [ ] **The same is true on iOS**
- [ ] The share button copies the canonical absolute URL

## Definition of done

- [ ] Implementation complete
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No unrelated regressions
- [ ] Documentation updated where appropriate

## Notes / implementation guidance

**The WhatsApp acceptance criteria are blocking and cannot be verified with a validator.** OG validators lie — they follow redirects differently, ignore caching, and do not reproduce WhatsApp's crawler. Paste a real link into a real chat.

WhatsApp caches previews aggressively. Use a fresh entry id for each test rather than wondering why a fix did not take.
