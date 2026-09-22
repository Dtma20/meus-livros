<template>
  <div class="profile-container">
    <div class="profile-card">
      <h1 class="profile-title">
        Editar perfil
      </h1>

      <p class="profile-desc">
        Atualize suas informações públicas e configurações de privacidade.
      </p>

      <form class="profile-form" @submit.prevent="handleSave">
        <!-- Handle (Immutable) -->
        <div class="form-group">
          <label for="profile-handle" class="form-label">Nome de usuário</label>
          <div class="handle-input-wrapper">
            <span class="handle-prefix">@</span>
            <input
              id="profile-handle"
              :value="handle"
              type="text"
              disabled
              readonly
              class="form-input handle-input handle-disabled"
              aria-describedby="profile-handle-hint"
            >
          </div>
          <span id="profile-handle-hint" class="field-hint immutable-hint">
            O nome de usuário é definitivo e não pode ser alterado no MVP.
          </span>
        </div>

        <!-- Display Name -->
        <div class="form-group">
          <label for="profile-name" class="form-label">Nome de exibição</label>
          <input
            id="profile-name"
            v-model="displayName"
            type="text"
            required
            maxlength="100"
            placeholder="Seu nome"
            class="form-input"
            :disabled="loading"
            aria-describedby="profile-name-hint"
          >
          <span id="profile-name-hint" class="field-hint">Como seu nome aparecerá nas leituras e no perfil.</span>
        </div>

        <!-- Bio -->
        <div class="form-group">
          <div class="label-row">
            <label for="profile-bio" class="form-label">Biografia</label>
            <span class="char-count" :class="{ 'char-count-limit': bio.length > 500 }">
              {{ bio.length }} / 500
            </span>
          </div>
          <textarea
            id="profile-bio"
            v-model="bio"
            maxlength="500"
            rows="4"
            placeholder="Conte um pouco sobre suas leituras e interesses..."
            class="form-input form-textarea"
            :disabled="loading"
            aria-describedby="profile-bio-hint"
          />
          <span id="profile-bio-hint" class="field-hint">Apresentação curta no seu perfil público. Máximo 500 caracteres.</span>
        </div>

        <!-- Profile Visibility -->
        <fieldset class="form-group visibility-fieldset">
          <legend class="form-label">
            Visibilidade do perfil
          </legend>

          <div class="visibility-options">
            <label class="radio-card" :class="{ selected: visibility === 'publico' }">
              <input
                v-model="visibility"
                type="radio"
                name="visibility"
                value="publico"
                :disabled="loading"
                class="radio-input"
              >
              <div class="radio-text">
                <span class="radio-title">Público</span>
                <span class="radio-desc">Qualquer pessoa com o link pode ver seu perfil e leituras públicas.</span>
              </div>
            </label>

            <label class="radio-card" :class="{ selected: visibility === 'privado' }">
              <input
                v-model="visibility"
                type="radio"
                name="visibility"
                value="privado"
                :disabled="loading"
                class="radio-input"
              >
              <div class="radio-text">
                <span class="radio-title">Privado</span>
                <span class="radio-desc">Só você pode ver suas leituras e perfil.</span>
              </div>
            </label>
          </div>
        </fieldset>

        <!-- Messages -->
        <p v-if="successMessage" class="success-message" role="status">
          {{ successMessage }}
        </p>

        <p v-if="errorMessage" class="error-message" role="alert">
          {{ errorMessage }}
        </p>

        <!-- Submit Button -->
        <button
          type="submit"
          class="submit-btn"
          :disabled="loading || !displayName || bio.length > 500"
        >
          {{ loading ? 'Salvando...' : 'Salvar alterações' }}
        </button>
      </form>
    </div>

    <!-- Alterar senha -->
    <div class="profile-card password-card">
      <h2 class="profile-title section-title">
        Alterar senha
      </h2>

      <p class="profile-desc">
        Informe sua senha atual e a nova senha para atualizar suas credenciais.
      </p>

      <form class="profile-form" @submit.prevent="handleChangePassword">
        <div class="form-group">
          <label for="current-password" class="form-label">Senha atual</label>
          <input
            id="current-password"
            v-model="currentPassword"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
            required
            class="form-input"
            :disabled="loadingPassword"
            :aria-invalid="passwordErrorMessage ? 'true' : undefined"
            :aria-describedby="passwordErrorMessage ? 'password-error' : undefined"
          >
        </div>

        <div class="form-group">
          <div class="label-row">
            <label for="new-password" class="form-label">Nova senha</label>
            <button
              type="button"
              class="toggle-password-btn"
              :disabled="loadingPassword"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? 'Ocultar' : 'Mostrar' }}
            </button>
          </div>
          <input
            id="new-password"
            v-model="newPassword"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            required
            minlength="8"
            maxlength="128"
            placeholder="Mínimo 8 caracteres"
            class="form-input"
            :disabled="loadingPassword"
            :aria-invalid="passwordErrorMessage ? 'true' : undefined"
            :aria-describedby="passwordErrorMessage ? 'password-error' : undefined"
          >
        </div>

        <div class="form-group">
          <label for="confirm-password" class="form-label">Confirmar nova senha</label>
          <input
            id="confirm-password"
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            required
            minlength="8"
            maxlength="128"
            placeholder="Digite a nova senha novamente"
            class="form-input"
            :disabled="loadingPassword"
            :aria-invalid="passwordErrorMessage ? 'true' : undefined"
            :aria-describedby="passwordErrorMessage ? 'password-error' : undefined"
          >
        </div>

        <p v-if="passwordSuccessMessage" class="success-message" role="status">
          {{ passwordSuccessMessage }}
        </p>

        <p v-if="passwordErrorMessage" id="password-error" class="error-message" role="alert">
          {{ passwordErrorMessage }}
        </p>

        <button
          type="submit"
          class="submit-btn"
          :disabled="loadingPassword || !currentPassword || !newPassword || !confirmPassword"
        >
          {{ loadingPassword ? 'Alterando...' : 'Alterar senha' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { isTimeoutOrAbort, TIMEOUT_MESSAGE } from '~/utils/fetch-error'
import { onMounted, ref } from 'vue'
import type { AuthSessionState, AuthSessionUser } from '~/middleware/auth'
import { authClient } from '~/utils/auth-client'
import { isForbiddenPassword, senhaSchema } from '~~/shared/schemas/auth'

definePageMeta({
  layout: 'app',
  middleware: 'auth',
})

useSeoMeta({
  title: 'Editar perfil',
})

const session = useState<AuthSessionState>('auth:session')

const handle = ref(session.value?.user?.handle ?? '')
const displayName = ref(String(session.value?.user?.display_name ?? ''))
const bio = ref(String(session.value?.user?.bio ?? ''))
const visibility = ref<'publico' | 'privado'>(
  (session.value?.user?.profile_visibility as 'publico' | 'privado') || 'publico',
)

const loading = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

// Password change state
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const loadingPassword = ref(false)
const passwordSuccessMessage = ref('')
const passwordErrorMessage = ref('')

function syncProfile(user: AuthSessionUser) {
  if (user.handle) handle.value = user.handle
  if (user.display_name !== undefined) displayName.value = user.display_name ?? ''
  if (user.bio !== undefined) bio.value = user.bio ?? ''
  if (user.profile_visibility === 'publico' || user.profile_visibility === 'privado') {
    visibility.value = user.profile_visibility
  }
}

if (session.value?.user) {
  syncProfile(session.value.user)
}

onMounted(async () => {
  try {
    const me = await $fetch<AuthSessionUser | null>('/api/users/me', {
      timeout: 15_000,
      retry: 0,
    })
    if (me) {
      session.value = {
        user: { ...me, hasProfile: true },
        hasProfile: true,
        fetched: true,
      }
      syncProfile(me)
    }
  } catch (err: unknown) {
    if (isTimeoutOrAbort(err)) {
      errorMessage.value = TIMEOUT_MESSAGE
      return
    }
    // Handled by middleware
  }
})

async function handleSave() {
  successMessage.value = ''
  errorMessage.value = ''

  if (bio.value.length > 500) {
    errorMessage.value = 'A biografia deve ter no máximo 500 caracteres.'
    return
  }

  loading.value = true

  try {
    const updated = await $fetch<{
      id: string
      handle: string
      display_name: string
      bio: string | null
      profile_visibility: 'publico' | 'privado'
    }>('/api/users/me', {
      method: 'PATCH',
      // Without a timeout this promise can never settle: a request lost
      // without the server answering or closing leaves `finally` unreached,
      // `loading` stuck true, and the button reading "Salvando..." forever
      // with no error and no way out but a reload. Observed in the wild.
      timeout: 15_000,
      body: {
        display_name: displayName.value,
        bio: bio.value || null,
        profile_visibility: visibility.value,
      },
    })

    if (session.value?.user) {
      session.value.user.display_name = updated.display_name
      session.value.user.bio = updated.bio
      session.value.user.profile_visibility = updated.profile_visibility
    }

    successMessage.value = 'Perfil atualizado com sucesso!'
  } catch (err: unknown) {
    if (isTimeoutOrAbort(err)) {
      errorMessage.value = TIMEOUT_MESSAGE
      return
    }
    const fetchErr = err as { data?: { message?: string } }
    errorMessage.value = fetchErr.data?.message ?? 'Não foi possível atualizar o perfil.'
  } finally {
    loading.value = false
  }
}

async function handleChangePassword() {
  passwordSuccessMessage.value = ''
  passwordErrorMessage.value = ''

  if (!currentPassword.value) {
    passwordErrorMessage.value = 'Informe a senha atual.'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    passwordErrorMessage.value = 'As senhas não coincidem.'
    return
  }

  const parsed = senhaSchema.safeParse(newPassword.value)
  if (!parsed.success) {
    passwordErrorMessage.value = parsed.error.issues[0]?.message ?? 'Nova senha inválida.'
    return
  }

  if (
    isForbiddenPassword(newPassword.value, {
      handle: handle.value,
      email: session.value?.user?.email,
    })
  ) {
    passwordErrorMessage.value = 'Senha muito fraca ou comum.'
    return
  }

  loadingPassword.value = true

  try {
    const { error } = await authClient.changePassword({
      currentPassword: currentPassword.value,
      newPassword: parsed.data,
      revokeOtherSessions: true,
    })

    if (error) {
      if (error.status === 429) {
        passwordErrorMessage.value = 'Muitas tentativas. Aguarde uma hora e tente novamente.'
      } else {
        passwordErrorMessage.value = 'Senha atual incorreta.'
      }
      return
    }

    passwordSuccessMessage.value = 'Senha alterada com sucesso!'
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch {
    passwordErrorMessage.value = 'Senha atual incorreta.'
  } finally {
    loadingPassword.value = false
  }
}
</script>

<style scoped>
.profile-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-4) 0;
}

.profile-card {
  background-color: var(--card-bg);
  border-radius: var(--radius-md);
  padding: var(--space-8);
  width: 100%;
  max-width: 540px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.password-card {
  margin-top: 0;
}

.section-title {
  font-size: var(--font-size-xl);
}

.profile-title {
  font-size: var(--font-size-2xl);
  margin-top: 0;
  margin-bottom: var(--space-2);
  color: #fff;
}

.profile-desc {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  margin-top: 0;
  margin-bottom: var(--space-6);
}

.profile-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: #fff;
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

.char-count {
  font-size: var(--font-size-xs);
  color: var(--text-color);
}

.char-count-limit {
  color: var(--danger);
  font-weight: bold;
}

.field-hint {
  font-size: var(--font-size-xs);
  color: var(--text-color);
}

.immutable-hint {
  color: var(--text-color);
  font-style: italic;
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

.form-textarea {
  resize: vertical;
  min-height: 90px;
  line-height: var(--line-height-normal);
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

.handle-disabled {
  opacity: 0.7;
  cursor: not-allowed;
  background-color: rgba(0, 0, 0, 0.25);
  border: 1px dashed var(--input-bg);
}

.visibility-fieldset {
  border: none;
  padding: 0;
  margin: 0;
}

.visibility-options {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.radio-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  background-color: var(--input-bg);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  min-height: 44px;
  box-sizing: border-box;
  transition: border-color 0.2s, background-color 0.2s;
}

.radio-card:has(.radio-input:focus-visible) {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.radio-card.selected {
  border-color: var(--highlight);
  background-color: rgba(64, 188, 244, 0.08);
}

.radio-input {
  margin-top: 3px;
  accent-color: var(--highlight);
  width: 18px;
  height: 18px;
}

.radio-input:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.radio-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.radio-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: #fff;
}

.radio-desc {
  font-size: var(--font-size-xs);
  color: var(--text-color);
  line-height: var(--line-height-tight);
}

.success-message {
  color: #34d399;
  font-size: var(--font-size-sm);
  margin: 0;
}

.error-message {
  color: var(--danger);
  font-size: var(--font-size-sm);
  margin: 0;
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
  transition: opacity 0.2s;
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
  .radio-card {
    transition: none;
  }
}
</style>
