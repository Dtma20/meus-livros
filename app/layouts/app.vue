<template>
  <NuxtLayout name="default">
    <template #nav>
      <NuxtLink to="/app/novo" class="nav-link">
        Registrar livro
      </NuxtLink>
      <NuxtLink :to="profileLink" class="nav-link">
        Perfil
      </NuxtLink>
      <NuxtLink to="/entrar" class="nav-link">
        Sair
      </NuxtLink>
    </template>
    <slot />
  </NuxtLayout>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AuthSessionState } from '~/middleware/auth'

const session = useState<AuthSessionState>('auth:session')

const profileLink = computed(() => {
  const handle = session.value?.user?.handle
  return handle ? `/@${handle}` : '/app/perfil'
})
</script>

<style scoped>
.nav-link {
  color: var(--text-color);
  text-decoration: none;
  font-size: var(--font-size-sm);
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  transition: color 0.2s;
}

.nav-link:hover {
  color: var(--highlight);
}

.nav-link:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}
</style>
