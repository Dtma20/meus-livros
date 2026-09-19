<template>
  <div class="page-book">
    <h1>Livro: {{ slug }}</h1>
    <p>Slug: {{ slug }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const slug = computed(() => route.params.slug as string)
</script>
