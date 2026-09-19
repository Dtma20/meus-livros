<template>
  <div class="page-edit-profile">
    <h1>Editar perfil</h1>
    <p>Atualize sua biografia e informações do perfil.</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'app',
  middleware: 'auth'
})
</script>
