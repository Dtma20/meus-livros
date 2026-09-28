<template>
  <NuxtLayout name="default">
    <template #nav>
      <NuxtLink to="/app/novo" class="nav-link">
        Registrar leitura
      </NuxtLink>
      <NuxtLink :to="profileLink" class="nav-link">
        Perfil
      </NuxtLink>
      <button
        type="button"
        class="nav-link nav-btn"
        :disabled="isSigningOut"
        @click="handleSignOut"
      >
        {{ isSigningOut ? 'Saindo…' : 'Sair' }}
      </button>
    </template>
    <slot />
  </NuxtLayout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AuthSessionState } from '~/middleware/auth'
import { authClient } from '~/utils/auth-client'

const session = useState<AuthSessionState>('auth:session')
const isSigningOut = ref(false)

const profileLink = computed(() => {
  const handle = session.value?.user?.handle
  return handle ? `/@${handle}` : '/app/perfil'
})

async function handleSignOut() {
  if (isSigningOut.value) {
    return
  }
  isSigningOut.value = true

  try {
    await Promise.race([
      authClient.signOut().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 10000)),
    ])
  }
  catch {
  }

  session.value = { user: null, fetched: false }
  await navigateTo('/', { external: true })
}
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

.nav-btn {
  background: none;
  border: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  cursor: pointer;
}

.nav-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.nav-btn:disabled:hover {
  background-color: transparent;
  color: var(--text-color);
}
</style>
