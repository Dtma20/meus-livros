<template>
  <div class="page-entry">
    <h1>Entrada: {{ id }}</h1>
    <p>ID da entrada: {{ id }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const id = computed(() => route.params.id as string)
</script>
