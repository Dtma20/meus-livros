<template>
  <div class="page-new-book">
    <h1>Registrar livro</h1>
    <p>Registre uma nova leitura em sua biblioteca.</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'app',
  middleware: 'auth'
})
</script>
