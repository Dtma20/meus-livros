<template>
  <div class="page-welcome">
    <h1>Bem-vindo</h1>
    <p>Escolha seu nome de usuário e nome de exibição.</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'app',
  middleware: 'auth'
})
</script>
