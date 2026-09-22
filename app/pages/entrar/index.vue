<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-logo-header">
        <AppLogo :size="44" badge />
      </div>
      <h1 class="login-title">
        Entrar
      </h1>

      <p class="login-desc">
        Digite seu e-mail ou nome de usuário e sua senha para entrar.
      </p>

      <form class="login-form" @submit.prevent="handleSignIn">
        <div class="form-group">
          <label for="identificador" class="form-label">E-mail ou usuário</label>
          <input
            id="identificador"
            v-model="identificador"
            type="text"
            autocomplete="username"
            required
            placeholder="seu-email@exemplo.com ou usuario"
            class="form-input"
            :disabled="loading"
            :aria-invalid="errorMessage ? 'true' : undefined"
            :aria-describedby="errorMessage ? 'login-error' : undefined"
          >
        </div>

        <div class="form-group">
          <div class="label-row">
            <label for="senha" class="form-label">Senha</label>
            <button
              type="button"
              class="toggle-password-btn"
              :disabled="loading"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? 'Ocultar senha' : 'Mostrar senha' }}
            </button>
          </div>
          <input
            id="senha"
            v-model="senha"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
            required
            placeholder="Sua senha"
            class="form-input"
            :disabled="loading"
            :aria-invalid="errorMessage ? 'true' : undefined"
            :aria-describedby="errorMessage ? 'login-error' : undefined"
          >
        </div>

        <p v-if="errorMessage" id="login-error" class="error-message" role="alert">
          {{ errorMessage }}
        </p>

        <button type="submit" class="submit-btn" :disabled="loading || !identificador || !senha">
          {{ loading ? 'Entrando...' : 'Entrar' }}
        </button>

        <div class="links-container">
          <NuxtLink to="/entrar/senha" class="auth-link">
            Esqueci minha senha
          </NuxtLink>
          <span class="link-divider" aria-hidden="true">•</span>
          <NuxtLink to="/entrar/ativar" class="auth-link">
            Primeiro acesso
          </NuxtLink>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppLogo from '~/components/ui/AppLogo.vue'
import { getSafeRedirectUrl } from '~/utils/redirect'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AuthSessionState } from '~/middleware/auth'
import { signInSchema } from '~~/shared/schemas/auth'

const route = useRoute()
const router = useRouter()

useSeoMeta({
  title: 'Entrar',
})
const session = useState<AuthSessionState>('auth:session', () => ({
  user: null,
  fetched: false,
}))

const identificador = ref('')
const senha = ref('')
const showPassword = ref(false)
const errorMessage = ref('')
const loading = ref(false)

async function handleSignIn() {
  errorMessage.value = ''
  const parsed = signInSchema.safeParse({
    identificador: identificador.value,
    senha: senha.value,
  })

  if (!parsed.success) {
    errorMessage.value = 'E-mail, usuário ou senha incorretos.'
    return
  }

  loading.value = true
  try {
    try {
      await $fetch('/api/auth/entrar', {
        method: 'POST',
        body: { identificador: parsed.data.identificador, senha: parsed.data.senha },
      })
    } catch (err) {
      const status = (err as { statusCode?: number, status?: number }).statusCode
        ?? (err as { status?: number }).status
      errorMessage.value = status === 429
        ? 'Muitas tentativas. Aguarde uma hora e tente novamente.'
        : 'E-mail, usuário ou senha incorretos.'
      return
    }

    // Invalidate cached auth session so middleware fetches fresh profile
    session.value = { user: null, fetched: false }

    const redirectPath = getSafeRedirectUrl(route.query.next)
    await router.push(redirectPath)
  } catch {
    errorMessage.value = 'E-mail, usuário ou senha incorretos.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(80vh - 120px);
  padding: var(--space-4);
}

.login-card {
  background-color: var(--card-bg);
  border-radius: var(--radius-md);
  padding: var(--space-8);
  width: 100%;
  max-width: 420px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.login-logo-header {
  display: flex;
  justify-content: center;
  margin-bottom: var(--space-4);
}

.login-title {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  margin: 0 0 var(--space-2) 0;
  color: #fff;
}

.login-desc {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--space-6) 0;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-label {
  font-size: var(--font-size-sm);
  color: #fff;
  font-weight: 500;
}

.toggle-password-btn {
  background: none;
  border: none;
  color: var(--highlight);
  font-size: var(--font-size-xs);
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  text-decoration: underline;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}

.toggle-password-btn:hover:not(:disabled) {
  opacity: 0.8;
}

.toggle-password-btn:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.form-input {
  background-color: var(--input-bg);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: #fff;
  font-family: var(--font-sans);
  font-size: var(--font-size-base);
  padding: var(--space-3) var(--space-4);
  transition: border-color 0.2s;
  outline: none;
  min-height: 44px;
  box-sizing: border-box;
}

.form-input:focus-visible {
  border-color: var(--highlight);
}

.form-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-message {
  color: var(--danger);
  font-size: var(--font-size-sm);
  margin: 0;
  line-height: var(--line-height-normal);
}

.submit-btn {
  background-color: var(--highlight);
  color: #14181c;
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-base);
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
  margin-top: var(--space-2);
  min-height: 44px;
  box-sizing: border-box;
}

.submit-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.submit-btn:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.links-container {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.auth-link {
  color: var(--highlight);
  font-size: var(--font-size-sm);
  text-decoration: underline;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}

.auth-link:hover {
  opacity: 0.8;
}

.auth-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.link-divider {
  color: var(--text-color);
  font-size: var(--font-size-xs);
}

@media (prefers-reduced-motion: reduce) {
  .form-input,
  .submit-btn {
    transition: none;
  }
}
</style>
