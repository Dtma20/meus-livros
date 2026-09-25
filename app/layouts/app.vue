<template>
  <NuxtLayout name="default">
    <template #nav>
      <NuxtLink to="/app/novo" class="nav-link">
        Cadastrar livro
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
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  background-color: transparent;
  transition: background-color 0.25s ease 0.05s, color 0.25s ease 0.05s;
}

.nav-link:hover {
  background-color: var(--card-bg);
  color: var(--highlight);
}

.nav-link:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}
</style>
