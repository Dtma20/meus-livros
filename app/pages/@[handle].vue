<template>
  <div class="page-profile">
    <h1>Perfil de @{{ handle }}</h1>
    <p>Handle: {{ handle }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const handle = computed(() => route.params.handle as string)
</script>
