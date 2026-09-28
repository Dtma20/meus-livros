<template>
  <NuxtLayout name="default">
    <template #nav>
      <NuxtLink to="/atividade" class="nav-link nav-link-desktop">
        Atividade
      </NuxtLink>
      <NuxtLink to="/membros" class="nav-link nav-link-desktop">
        Membros
      </NuxtLink>
      <NuxtLink to="/app/novo" class="nav-link nav-link-primary nav-link-desktop">
        + Registrar leitura
      </NuxtLink>
      <NuxtLink :to="profileLink" class="nav-link nav-link-desktop">
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
    <nav class="bottom-nav" aria-label="Navegação inferior">
      <NuxtLink to="/" class="bottom-nav-link">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span class="bottom-nav-label">Início</span>
      </NuxtLink>
      <NuxtLink to="/atividade" class="bottom-nav-link">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <span class="bottom-nav-label">Atividade</span>
      </NuxtLink>
      <NuxtLink to="/app/novo" class="bottom-nav-link bottom-nav-register">
        <span class="register-icon-wrapper">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </span>
        <span class="bottom-nav-label">Registrar</span>
      </NuxtLink>
      <NuxtLink to="/membros" class="bottom-nav-link">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span class="bottom-nav-label">Membros</span>
      </NuxtLink>
      <NuxtLink :to="profileLink" class="bottom-nav-link">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span class="bottom-nav-label">Perfil</span>
      </NuxtLink>
    </nav>
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

.nav-link[aria-current="page"],
.nav-link.router-link-exact-active {
  color: var(--highlight);
}

.nav-link-primary {
  background-color: var(--highlight);
  color: var(--bg-color);
  font-weight: 600;
}

.nav-link-primary:hover {
  background-color: var(--highlight-hover);
  color: var(--bg-color);
}

.nav-link-primary[aria-current="page"],
.nav-link-primary.router-link-exact-active {
  background-color: var(--highlight-hover);
  color: var(--bg-color);
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

.bottom-nav {
  display: none;
}

.bottom-nav-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  padding: 6px 2px;
  color: var(--text-color);
  text-decoration: none;
  font-size: var(--font-size-xs);
  gap: 3px;
  transition: color 0.2s ease;
  box-sizing: border-box;
}

.bottom-nav-link:hover {
  color: var(--highlight);
}

.bottom-nav-link:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: -2px;
}

.bottom-nav-link:not(.bottom-nav-register)[aria-current="page"],
.bottom-nav-link:not(.bottom-nav-register).router-link-exact-active {
  color: var(--highlight);
}

.bottom-nav-label {
  font-size: var(--font-size-xs);
  line-height: 1;
  text-align: center;
  white-space: nowrap;
}

.bottom-nav-register {
  color: var(--highlight);
  font-weight: 600;
}

.bottom-nav-register .register-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background-color: var(--highlight);
  color: var(--bg-color);
  transition: background-color 0.2s ease;
}

.bottom-nav-register:hover .register-icon-wrapper {
  background-color: var(--highlight-hover);
}

.bottom-nav-register[aria-current="page"] .register-icon-wrapper,
.bottom-nav-register.router-link-exact-active .register-icon-wrapper {
  box-shadow: 0 0 0 2px var(--bg-color), 0 0 0 4px var(--highlight);
}

@media (max-width: 767.98px) {
  .nav-link-desktop {
    display: none;
  }

  .nav-link {
    min-height: var(--target-min-size);
    min-width: var(--target-min-size);
    box-sizing: border-box;
    justify-content: center;
  }

  .bottom-nav {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 100;
    background-color: var(--bg-color);
    border-top: 1px solid var(--input-bg);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    box-sizing: border-box;
  }

  :deep(.site-footer) {
    padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px) + var(--space-4));
  }
}
</style>
