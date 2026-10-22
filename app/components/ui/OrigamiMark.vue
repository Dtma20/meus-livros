<template>
  <svg class="origami-mark" viewBox="0 0 96 72" width="96" height="72" aria-hidden="true" focusable="false">
    <path class="paper-shadow" d="m10 56 38 10 38-10-38-9Z" />
    <path class="paper-cover" d="m9 22 39 9 39-9v32l-39 11L9 54Z" />
    <path class="paper-light" d="m12 16 36 12v30L12 47Z" />
    <path class="paper-mid" d="m48 28 36-12v31L48 58Z" />
    <path class="paper-fold" d="m12 16 36 12-22 4Zm72 0L48 28l23 4Z" />
    <path class="paper-crease" d="M48 28v30M17 37l25 8m12 0 25-8" />
    <path class="paper-ribbon" d="m64 22 7-2v22l-3.5-3-3.5 5Z" />
  </svg>
</template>

<style scoped>
.origami-mark {
  display: block;
  flex-shrink: 0;
}

.paper-shadow { fill: rgba(0, 0, 0, 0.18); }
.paper-cover, .paper-ribbon { fill: var(--highlight); }
.paper-light { fill: var(--paper-white); }
.paper-mid { fill: var(--paper-fold); }
.paper-fold { fill: var(--text-color); }
.paper-crease {
  fill: none;
  stroke: var(--bg-color);
  stroke-opacity: 0.2;
  stroke-width: 1;
}
</style>
