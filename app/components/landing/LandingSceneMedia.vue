<template>
  <div ref="root" class="scene-media" aria-hidden="true">
    <img
      class="scene-poster"
      :class="{ 'is-covered': ready }"
      :src="`/landing/scene-${scene}.webp`"
      :srcset="`/landing/scene-${scene}-640.webp 640w, /landing/scene-${scene}-1440.webp 2560w`"
      sizes="(min-width: 900px) 42rem, 100vw"
      width="960"
      height="540"
      alt=""
      decoding="async"
      :loading="scene === 1 ? 'eager' : 'lazy'"
      :fetchpriority="scene === 1 ? 'high' : undefined"
    >
    <video
      v-if="src"
      ref="video"
      class="scene-video"
      :class="{ 'is-ready': ready }"
      :src="src"
      muted
      playsinline
      loop
      preload="metadata"
      disablepictureinpicture
      disableremoteplayback
      tabindex="-1"
      @playing="onPlaying"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

const props = defineProps<{
  scene: number
}>()

const PLAY_RATIO = 0.25
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const COMPACT_SOURCE_QUERY = '(max-width: 860px), (pointer: coarse)'

const root = shallowRef<HTMLElement | null>(null)
const video = shallowRef<HTMLVideoElement | null>(null)
// Stays null until the media nears the viewport, so the server HTML has no <video>.
const src = ref<string | null>(null)
const ready = ref(false)

let observer: IntersectionObserver | null = null
let playObserver: IntersectionObserver | null = null
let reducedMotion: MediaQueryList | null = null

function chooseSource(): string {
  const compact = window.matchMedia(COMPACT_SOURCE_QUERY).matches
  return `/landing/scene-${props.scene}-loop-${compact ? 640 : 1440}.mp4`
}

function onNear(entries: IntersectionObserverEntry[]) {
  if (!entries.some((entry) => entry.isIntersecting)) return
  observer?.disconnect()
  observer = null
  src.value = chooseSource()
  if (root.value) {
    // Observed only once src is set, so the first entry finds the video element rendered.
    playObserver = new IntersectionObserver(onPlayable, { threshold: PLAY_RATIO })
    playObserver.observe(root.value)
  }
}

// Plays the loop while at least a quarter of the scene is on screen, and pauses it otherwise.
function onPlayable(entries: IntersectionObserverEntry[]) {
  const videoEl = video.value
  if (!videoEl) return
  const visible = entries.some((entry) => entry.intersectionRatio >= PLAY_RATIO)
  if (visible) videoEl.play().catch(() => {})
  else videoEl.pause()
}

function onPlaying() {
  ready.value = true
}

// Reduced motion can be switched off at runtime, so the observer is created on demand.
function watchProximity() {
  if (observer) return
  observer = new IntersectionObserver(onNear, { rootMargin: '150% 0px' })
  if (root.value) observer.observe(root.value)
}

function onReducedMotionChange(event: MediaQueryListEvent) {
  if (!event.matches) {
    watchProximity()
    return
  }
  observer?.disconnect()
  observer = null
  playObserver?.disconnect()
  playObserver = null
  src.value = null
  ready.value = false
}

onMounted(() => {
  reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY)
  reducedMotion.addEventListener('change', onReducedMotionChange)
  if (!reducedMotion.matches) watchProximity()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  playObserver?.disconnect()
  playObserver = null
  reducedMotion?.removeEventListener('change', onReducedMotionChange)
})
</script>

<style scoped>
.scene-media {
  display: grid;
  width: min(100%, 42rem);
  aspect-ratio: 16 / 9;
}

.scene-poster,
.scene-video {
  grid-area: 1 / 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* Feathers the edges so the video's slightly lighter background blends into the page. */
  mask-image: linear-gradient(to right, transparent, #000 14%, #000 86%, transparent),
    linear-gradient(to bottom, transparent, #000 16%, #000 84%, transparent);
  mask-composite: intersect;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 14%, #000 86%, transparent),
    linear-gradient(to bottom, transparent, #000 16%, #000 84%, transparent);
  -webkit-mask-composite: source-in;
}

.scene-poster.is-covered {
  visibility: hidden;
}

.scene-video {
  opacity: 0;
}

.scene-video.is-ready {
  opacity: 1;
}
</style>
