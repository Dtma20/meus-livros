# TASK-046 - Landing without horizontal scroll on a phone

## Context

Frontend round of 2026-09-27. Agent prompt: [PROMPT-frontend-melhorias.md](../PROMPT-frontend-melhorias.md). Runs in parallel with the other tasks 039-048; touch only the files listed below.

At 375px the anonymous home scrolls sideways: `document.scrollingElement.scrollWidth` is 411. Measured culprit: `.hero-visual-backdrop` in `app/components/landing/LandingHero.vue` (`width: 130%; left: -15%`, right edge at 410px).

## Implementation requirements

- The decorative backdrop is clipped to the hero (`overflow: clip` / `overflow-x: hidden` on its positioned container, or reduce its width below 640px) so the page is exactly as wide as the viewport at 320, 375 and 414px.
- The desktop look (≥ 1024px) does not change.

## Explicitly excluded

- Copy, other landing sections, the logged-in dashboard.

## Expected files

```
app/components/landing/LandingHero.vue
```

## Acceptance criteria

- [ ] At 320, 375 and 414px, `scrollWidth === clientWidth` on `/` signed out (reviewer checks in the browser)
- [ ] `git diff --stat` shows only `LandingHero.vue`

## Definition of done

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass (run by the reviewer, not the agent)
