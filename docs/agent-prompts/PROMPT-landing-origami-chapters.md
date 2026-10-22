# Landing: chapters, each with its own scroll-scrubbed origami scene

> **Superseded (2026-10-10).** The chapters were built as described here, then the owner chose a background loop over scroll-scrubbing. The scrub logic (`scrollScrub.ts`, pinning, progress) was removed. What shipped is in `docs/landing-origami-plan.md`, under "O que foi entregue". This prompt is kept as the record of what the implementing agent was given.

You implement one change in a Nuxt 4 app (`meus-livros`), in the worktree `C:\Users\diogo\Documents\ml-origami` (branch `feat/landing-origami`, base `84753f7`). The worktree already holds **uncommitted** work from a previous round. Part of it stays, part of it goes; see §1. The reviewer runs typecheck, the full tests, build and the browser; you do not.

Read the whole prompt first, then read every file you will touch, in full, before editing it.

## Goal

The logged-out landing becomes a sequence of **chapters**. Each chapter pairs its copy with one origami scene (a short 5 s video, camera locked). While the visitor scrolls through a chapter, the scene's playback position follows the scroll, so the illustration *does* what the paragraph next to it *says*. When nobody scrolls, nothing moves. Videos never autoplay and never loop. This replaces the single 260 svh video block from the previous round.

The plan and its reasoning are in `C:\Users\diogo\Documents\meus-livros\docs\landing-origami-plan.md`. Read §1-§4. This prompt overrides it where they differ: the per-chapter sticky layout below replaces the plan's single global stage, because it is simpler and needs no crossfade logic.

## 1. Keep and remove from the previous round

**Keep as is:** `app/utils/scrollScrub.ts` and `tests/unit/scroll-scrub.test.ts` (you add a function, §3), `app/components/ui/AppLogo.vue`, `nuxt.config.ts` icon links, `public/brand/*`, `public/favicon.ico`, the `favicon.svg` deletion, and the `LandingHero.vue` shelf removal.

**Remove:** `app/components/landing/LandingReadersScroll.vue`, its import and usage in `LandingView.vue`, and `public/landing/readers-960.mp4`, `readers-640.mp4`, `readers-poster.webp`, `readers-poster-640.webp`. They are untracked, so delete them with `rm`.

## 2. Chapters and scenes

| Chapter | Scene | Copy it carries (move it, do not rewrite it) | Mode |
|---|---|---|---|
| 1 | 1 | `LandingHero` text: h1, lede, CTA, invite line | `pin` |
| 2 | 2 | `LandingCommunity`: h2, intro, the Dom Casmurro `<article>` and the notes list | `follow` |
| 3 | 3 | `LandingPillars` h2 "Depois do registro, a estante." + row "Leitura em andamento" | `pin` |
| 4 | 4 | row "Estante e diário" | `pin` |
| 5 | 5 | row "Mapa e estatísticas" | `pin` |
| 6 | 6 | row "Atividade do grupo" | `pin` |
| 7 | 7 | row "Seus dados" | `pin` |
| 8 | 8 | `LandingClosing`: h2, text, CTA and link | `pin` |

- **Copy is byte-identical:** every pt-BR string, heading level, `id` and `aria-labelledby` stays. The Pillars `<dl>` becomes one `<dl class="more-list">` per chapter, with its single `.more-row`. Chapter 3 keeps the `h2` above its `dl`, and chapters 4-7 have no new heading.
- **Assets** (the reviewer drops them into `public/landing/` later; do not create them and do not fail if they are missing): `scene-N-960.mp4`, `scene-N-640.mp4`, `scene-N.webp` (960×540), `scene-N-640.webp` (640×360), for N = 1..8. All 16:9.

## 3. Pure logic: `app/utils/scrollScrub.ts`

Add:

```ts
/** 0..1 progress of an element passing through the viewport: 0 when its top reaches the viewport bottom, 1 when its bottom reaches the viewport top. */
export function passProgress(rectTop: number, height: number, viewportHeight: number): number
```

It is `clamp((viewportHeight - rectTop) / (viewportHeight + height), 0, 1)`, and it returns `0` for non-finite input or `viewportHeight + height <= 0`. Add four unit tests: entering gives 0, halfway gives 0.5, gone gives 1, degenerate input gives 0.

## 4. Components

### `app/components/landing/LandingChapter.vue`

Props: `scene: number` (1-8) and `mode: 'pin' | 'follow'`. It has a default slot for the copy.

```html
<section ref="root" class="chapter" :class="`chapter-${mode}`" :data-scene="scene">
  <div class="chapter-inner">
    <div class="chapter-copy"><slot /></div>
    <LandingSceneMedia class="chapter-media" :scene="scene" :progress="progress" />
  </div>
</section>
```

The slot content keeps its own landmark and heading markup. Where the moved section already was a `<section aria-labelledby>`, change it to a `<div>` so that sections do not nest: the chapter's `<section>` takes over `aria-labelledby` (pass it through as an attribute).

**Layout, desktop (`min-width: 900px`):**
- `.chapter-inner` is a grid `minmax(0, 5fr) minmax(0, 7fr)` with `gap: var(--space-12)`, `align-items: center`.
- `pin`: `.chapter` has `height: 150svh` (fallback `150vh`); chapter 1 uses `140svh`. `.chapter-inner` is `position: sticky; top: 0; height: 100svh`. Copy and scene stay pinned together while the chapter scrolls by.
- `follow`: `.chapter` has natural height. `.chapter-inner` aligns to start. `.chapter-media` is `position: sticky; top: calc(50svh - (min(100%, 42rem) * 9 / 32))`, which centres a 16:9 box vertically, or simply `top: var(--space-16)` if that is cleaner. The long copy flows past it.
- Chapter 1 sits where the hero was. The site header stays above it.

**Layout, mobile (< 900px):** no pinning in either mode. `.chapter-inner` is a single column with the media **above** the copy (`order: -1`), `margin-block: var(--space-10)`. `.chapter` has natural height.

**Reduced motion** (`@media (prefers-reduced-motion: reduce)`, pure CSS so SSR is right without JS): `.chapter` height becomes `auto` and nothing is sticky.

**No layout shift on mount:** pinning is CSS-only (media queries), never toggled by JS.

**Progress** (`ref<number>`, passed to the media):
- desktop `pin` and `follow`: `scrubProgress(rect.top, root.offsetHeight, innerHeight)`;
- mobile: `passProgress(mediaRect.top, mediaRect.height, innerHeight)` of the media element.
- Decide desktop or mobile with `matchMedia('(min-width: 900px)')`, and listen to its `change` event.
- Compute progress inside one rAF loop that runs only while the chapter is near the viewport (`IntersectionObserver`, `rootMargin: '50% 0px'`). The loop stops when the chapter is away and when reduced motion matches.

### `app/components/landing/LandingSceneMedia.vue`

Props: `scene: number` and `progress: number`. Purely decorative: the root carries `aria-hidden="true"`, there is no text, nothing is focusable, and every `alt=""`.

```html
<div ref="root" class="scene-media" aria-hidden="true">
  <img class="scene-poster" :class="{ 'is-covered': ready }" :src="`/landing/scene-${scene}.webp`"
       :srcset="`/landing/scene-${scene}-640.webp 640w, /landing/scene-${scene}.webp 960w`"
       sizes="(min-width: 900px) 42rem, 100vw" width="960" height="540" alt="" decoding="async"
       :loading="scene === 1 ? 'eager' : 'lazy'" :fetchpriority="scene === 1 ? 'high' : undefined">
  <video v-if="src" ref="video" class="scene-video" :class="{ 'is-ready': ready }" :src="src"
         muted playsinline preload="auto" disablepictureinpicture disableremoteplayback tabindex="-1"
         @seeked="ready = true" />
</div>
```

- Box: `width: min(100%, 42rem); aspect-ratio: 16 / 9; display: grid`. Poster and video share one grid cell with `object-fit: cover`. Feather the edges of **both** with the mask from the previous round (`linear-gradient` 8%/92% horizontal and 10%/90% vertical, `mask-composite: intersect` plus the `-webkit-` pair). The video starts at `opacity: 0` and gets `is-ready` on its first `seeked`. The poster gets `visibility: hidden` once `ready` is true, so it never ghosts under the feathered edges.
- **Source:** set `src` in `onMounted` only when reduced motion does not match. Use `/landing/scene-N-640.mp4` when `(max-width: 860px), (pointer: coarse)` matches, otherwise the `-960` file. Load lazily: set `src` only when an `IntersectionObserver` with `rootMargin: '150% 0px'` first reports the media as intersecting, then disconnect it.
- **Scrub:** `watch(() => props.progress)` sets `target = progressToTime(progress, video.duration)`. A rAF smoothing loop runs only while `|target - current| > 1e-3`: it does `current += (target - current) * 0.18`, and seeks only when `|current - video.currentTime| > threshold` (`1/48` s desktop, `1/24` s on the 640 source) and `!video.seeking` and `video.readyState >= HAVE_METADATA`. The loop stops when it converges. Never call `play()` in the loop.
- **iOS unlock:** on the first `pointerdown` or `touchstart` on `window` (`{ once: true, passive: true }`), run `play().then(pause).catch(() => {})` on the video, if one exists.
- **Reduced motion turning on at runtime:** remove the video (`src = null`, `ready = false`) and stop the loop.
- **Cleanup** in `onBeforeUnmount`: observers, rAF and listeners, in both components.
- No `<ClientOnly>`, no `v-html`, no `any`, no Blob or `createObjectURL`, no `fetch` of the video, no new dependency, no CSP change.

### `LandingView.vue`, `LandingHero.vue`, `LandingCommunity.vue`, `LandingPillars.vue`, `LandingClosing.vue`

- `LandingView` renders the 8 chapters in order with explicit imports. Each chapter wraps the copy component that owns its text.
- Split `LandingPillars` so it can render one row. The simplest way is a `row` prop (1-5) plus a `withHeading` prop, and `LandingView` renders `<LandingPillars :row="1" with-heading />`, and so on. Keep its styles.
- Keep each copy component's own styles. Remove only layout rules that fight the chapter grid: max-widths wider than the copy column, and the old two-column `.entry-layout` if it no longer fits at 5fr. In that case stack the article and the notes. Say what you removed under DECISIONS.
- `.landing-experience` keeps `overflow-x: clip` (it does not break sticky). Keep its gap, but the chapters now carry their own vertical rhythm, so reduce the gap to `var(--space-8)` if the spacing doubles up.

## 5. Constraints

- Files: `~ app/utils/scrollScrub.ts`, `~ tests/unit/scroll-scrub.test.ts`, `+ app/components/landing/LandingChapter.vue`, `+ app/components/landing/LandingSceneMedia.vue`, `~ LandingView.vue`, `~ LandingHero.vue`, `~ LandingCommunity.vue`, `~ LandingPillars.vue`, `~ LandingClosing.vue`, and `- LandingReadersScroll.vue` with the 4 `readers-*` assets. The previous round's kept files stay untouched.
- `package.json`, the lockfile and the CSP stay unchanged. No new UI copy.

## 6. Acceptance criteria (the reviewer checks each one)

| # | Criterion | How it is checked |
|---|---|---|
| AC1 | File list as in §5 | `git status --porcelain -uall` |
| AC2 | Copy unchanged | every pt-BR string of the 5 copy components is present exactly once in the SSR HTML of `/` (scripted diff of text nodes vs `develop`'s landing, minus the old shelf caption) |
| AC3 | Unit logic | `npx vitest run tests/unit/scroll-scrub.test.ts` passes, 10 cases |
| AC4 | SSR | HTML of `/` has 8 `scene-media` blocks, 8 posters, 0 `<video>`; scene 1's poster is `eager`, the others `lazy` |
| AC5 | Pinning, desktop 1280×800 | while scrolling chapter 3, the `.chapter-inner` top stays 0 and the copy stays visible next to the media |
| AC6 | Scrub | in each chapter at progress 0 / 0.5 / 1, `currentTime` ≈ 0 / 2.5 / ≥ 4.9 s (±0.3), and it reverses when scrolling back; no `play` event while scrolling |
| AC7 | Lazy video | on load only chapter 1's (and at most chapter 2's) video `src` is set; the others get theirs only as they approach |
| AC8 | Mobile 375×812 | no pinning, media above the copy, `scrollWidth <= 375`, `-640.mp4` sources, scrub follows the pass-through progress |
| AC9 | Reduced motion | no `<video>`, no sticky, chapters at natural height, posters visible (SSR proves the static path; CSS media query for the rest) |
| AC10 | No ghosting/seam | screenshot mid-scrub in 3 chapters: no poster showing through the feathered edges |
| AC11 | Cleanup | `/` to `/entrar` to `/`: no console errors, 0 rAF callbacks while on `/entrar` |
| AC12 | a11y | axe passes on `/` (in `npm run test`); media `aria-hidden`; heading order h1 then h2s unchanged; no nested `<section>` |
| AC13 | Gates | `npm run lint`, `npm run typecheck`, `npm run test` |

## 7. Execution rules

- Work only in `C:\Users\diogo\Documents\ml-origami`. Never edit anything under `C:\Users\diogo\Documents\meus-livros`. No `git checkout`, `switch`, `merge`, `rebase`, `stash`, `commit` or `push`. Leave everything uncommitted.
- You may run only `npx eslint <changed files>` and `npx vitest run tests/unit/scroll-scrub.test.ts`. No build, dev, typecheck or full suite. Everything in the foreground.
- Do not write memory files.

## 8. Report

Print only:

```
FILES: one per line, + new, ~ changed, - removed
DEPS ADDED: none
CRITERIA: AC1-AC13, one line each: DONE | NOT DONE | UNSURE - reason (browser ones may be UNSURE)
DECISIONS: one per line
RISKS: one per line
OUT OF SCOPE NOTICED: one per line
```
