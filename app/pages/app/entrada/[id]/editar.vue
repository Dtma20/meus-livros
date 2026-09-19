<template>
  <div class="page-edit-entry">
    <h1>Editar entrada: {{ id }}</h1>
    <p>ID da entrada: {{ id }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const id = computed(() => route.params.id as string)

definePageMeta({
  layout: 'app',
  middleware: 'auth'
})
</script>
