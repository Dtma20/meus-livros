<template>
  <div class="welcome-container">
    <div class="welcome-card">
      <h1 class="welcome-title">
        Bem-vindo
      </h1>

      <p class="welcome-desc">
        Escolha seu nome de exibição e seu nome de usuário para criar seu perfil.
      </p>

      <div class="notice-box">
        <strong>Importante:</strong> O nome de usuário será seu endereço público permanente (ex: <code>meulivros.app/@usuario</code>) e <strong>não poderá ser alterado depois</strong>.
      </div>

      <form class="welcome-form" @submit.prevent="handleSubmit">
        <!-- Display Name -->
        <div class="form-group">
          <label for="display_name" class="form-label">Nome de exibição</label>
          <input
            id="display_name"
            v-model="displayName"
            type="text"
            required
            maxlength="100"
            placeholder="Ex: João Silva"
            class="form-input"
            :disabled="loading"
            aria-describedby="display-name-hint"
            @input="onDisplayNameInput"
          >
          <span id="display-name-hint" class="field-hint">Como você quer ser chamado nas resenhas e no perfil.</span>
        </div>

        <!-- Handle -->
        <div class="form-group">
          <label for="handle" class="form-label">Nome de usuário (handle)</label>
          <div class="handle-input-wrapper">
            <span class="handle-prefix">@</span>
            <input
              id="handle"
              :value="handle"
              type="text"
              required
              minlength="3"
              maxlength="20"
              placeholder="joao_silva"
              class="form-input handle-input"
              :disabled="loading"
              :aria-invalid="errorMessage ? 'true' : undefined"
              :aria-describedby="errorMessage ? 'handle-hint bem-vindo-error' : 'handle-hint'"
              @input="onHandleInput"
            >
          </div>
          <span id="handle-hint" class="field-hint">Entre 3 e 20 caracteres: letras minúsculas, números e sublinhado (_).</span>
        </div>

        <!-- Live URL preview -->
        <div class="preview-box">
          <span class="preview-label">Seu endereço público:</span>
          <span class="preview-url">meulivros.app/@{{ previewHandle }}</span>
        </div>

        <!-- Inline error message -->
        <p v-if="errorMessage" id="bem-vindo-error" class="error-message" role="alert">
          {{ errorMessage }}
        </p>

        <!-- Collision suggestions -->
        <div v-if="suggestions.length > 0" class="suggestions-container">
          <span class="suggestions-label">Sugestões disponíveis:</span>
          <div class="suggestions-list">
            <button
              v-for="sug in suggestions"
              :key="sug"
              type="button"
              class="suggestion-chip"
              @click="applySuggestion(sug)"
            >
              @{{ sug }}
            </button>
          </div>
        </div>

        <!-- Submit button -->
        <button
          type="submit"
          class="submit-btn"
          :disabled="loading || !handle || handle.length < 3 || !displayName"
        >
          {{ loading ? 'Salvando...' : 'Criar meu perfil' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { AuthSessionState, AuthSessionUser } from '~/middleware/auth'
import { isReservedHandle, transliterateToHandle } from '~~/shared/schemas/user'

definePageMeta({
  layout: 'app',
  middleware: 'auth',
})

const displayName = ref('')
const handle = ref('')
const handleTouched = ref(false)
const suggestions = ref<string[]>([])
const loading = ref(false)
const errorMessage = ref('')

const session = useState<AuthSessionState>('auth:session')

const previewHandle = computed(() => handle.value || 'seu-usuario')

onMounted(async () => {
  if (session.value?.user?.hasProfile || session.value?.user?.handle) {
    await navigateTo('/app/novo')
    return
  }

  try {
    const me = await $fetch<AuthSessionUser | null>('/api/users/me')
    if (me?.handle) {
      session.value = {
        user: { ...me, hasProfile: true },
        hasProfile: true,
        fetched: true,
      }
      await navigateTo('/app/novo')
    }
  } catch {
    // Unauthenticated handled by middleware
  }
})

function onDisplayNameInput() {
  if (!handleTouched.value && displayName.value) {
    handle.value = transliterateToHandle(displayName.value)
    checkHandleDebounced()
  }
}

function onHandleInput(event: Event) {
  handleTouched.value = true
  const target = event.target as HTMLInputElement
  handle.value = transliterateToHandle(target.value)
  checkHandleDebounced()
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null

function checkHandleDebounced() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (!handle.value) {
      errorMessage.value = ''
      return
    }
    if (handle.value.length < 3) {
      errorMessage.value = 'O nome de usuário deve ter pelo menos 3 caracteres.'
    } else if (isReservedHandle(handle.value)) {
      errorMessage.value = 'Este nome de usuário é reservado.'
    } else {
      errorMessage.value = ''
    }
  }, 250)
}

function applySuggestion(sug: string) {
  handle.value = sug
  handleTouched.value = true
  suggestions.value = []
  errorMessage.value = ''
}

async function handleSubmit() {
  errorMessage.value = ''
  suggestions.value = []

  if (handle.value.length < 3) {
    errorMessage.value = 'O nome de usuário deve ter pelo menos 3 caracteres.'
    return
  }

  loading.value = true

  try {
    const res = await $fetch<{ id: string; handle: string; display_name: string }>('/api/users', {
      method: 'POST',
      body: {
        handle: handle.value,
        display_name: displayName.value,
      },
    })

    session.value = {
      user: {
        ...(session.value?.user ?? {}),
        id: res.id,
        handle: res.handle,
        display_name: res.display_name,
        hasProfile: true,
      },
      hasProfile: true,
      fetched: true,
    }

    await navigateTo('/app/novo')
  } catch (err: unknown) {
    const fetchErr = err as { data?: { error?: string; message?: string; suggestions?: string[] }; statusCode?: number }
    if (fetchErr.data?.suggestions && Array.isArray(fetchErr.data.suggestions)) {
      suggestions.value = fetchErr.data.suggestions
    }
    errorMessage.value = fetchErr.data?.message ?? 'Não foi possível criar o perfil. Tente novamente.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.welcome-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(80vh - 120px);
  padding: var(--space-4);
}

.welcome-card {
  background-color: var(--card-bg);
  border-radius: var(--radius-md);
  padding: var(--space-8);
  width: 100%;
  max-width: 480px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.welcome-title {
  font-size: var(--font-size-2xl);
  margin-top: 0;
  margin-bottom: var(--space-2);
  color: #fff;
}

.welcome-desc {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  margin-top: 0;
  margin-bottom: var(--space-4);
  line-height: var(--line-height-normal);
}

.notice-box {
  background-color: var(--input-bg);
  border-left: 3px solid var(--highlight);
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-xs);
  color: var(--text-color);
  line-height: var(--line-height-normal);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  margin-bottom: var(--space-6);
}

.notice-box code {
  color: var(--highlight);
}

.notice-box strong {
  color: #fff;
}

.welcome-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.form-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: #fff;
}

.field-hint {
  font-size: var(--font-size-xs);
  color: var(--text-color);
}

.form-input {
  background-color: var(--input-bg);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  color: #fff;
  font-size: var(--font-size-base);
  font-family: inherit;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
}

.form-input:focus {
  outline: none;
  border-color: var(--highlight);
  box-shadow: 0 0 0 2px rgba(64, 188, 244, 0.2);
}

.form-input:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-color: var(--highlight);
  box-shadow: none;
}

.form-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.handle-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.handle-prefix {
  position: absolute;
  left: var(--space-3);
  color: var(--text-color);
  font-size: var(--font-size-base);
  pointer-events: none;
}

.handle-input {
  padding-left: calc(var(--space-3) + 14px);
}

.preview-box {
  background-color: rgba(0, 0, 0, 0.25);
  border: 1px dashed var(--input-bg);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.preview-label {
  font-size: var(--font-size-xs);
  color: var(--text-color);
}

.preview-url {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--highlight);
  word-break: break-all;
}

.error-message {
  color: var(--danger);
  font-size: var(--font-size-sm);
  margin: 0;
}

.suggestions-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.suggestions-label {
  font-size: var(--font-size-xs);
  color: var(--text-color);
}

.suggestions-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.suggestion-chip {
  background-color: var(--input-bg);
  border: 1px solid var(--highlight);
  color: var(--highlight);
  border-radius: var(--radius-full);
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-xs);
  font-weight: 600;
  cursor: pointer;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  transition: background-color 0.2s, color 0.2s;
}

.suggestion-chip:hover {
  background-color: var(--highlight);
  color: #14181c;
}

.suggestion-chip:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.submit-btn {
  background-color: var(--highlight);
  color: #14181c;
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  font-size: var(--font-size-base);
  font-weight: bold;
  cursor: pointer;
  min-height: 44px;
  box-sizing: border-box;
  transition: opacity 0.2s, background-color 0.2s;
  margin-top: var(--space-2);
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

@media (prefers-reduced-motion: reduce) {
  .form-input,
  .submit-btn,
  .suggestion-chip {
    transition: none;
  }
}
</style>
