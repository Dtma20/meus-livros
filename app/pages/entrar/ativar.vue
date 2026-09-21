<template>
  <div class="login-container">
    <div class="login-card">
      <h1 class="login-title">
        Primeiro acesso
      </h1>

      <!-- Step 1: Request OTP -->
      <form v-if="step === 'email'" class="login-form" @submit.prevent="handleRequestOtp">
        <p class="login-desc">
          Digite seu e-mail cadastrado para receber um código de ativação e criar sua senha.
        </p>

        <div class="form-group">
          <label for="email" class="form-label">E-mail</label>
          <input
            id="email"
            v-model="email"
            type="email"
            inputmode="email"
            autocomplete="email"
            required
            placeholder="seu-email@exemplo.com"
            class="form-input"
            :disabled="loading"
            :aria-invalid="errorMessage ? 'true' : undefined"
            :aria-describedby="errorMessage ? 'email-error' : undefined"
          >
        </div>

        <p v-if="errorMessage" id="email-error" class="error-message" role="alert">
          {{ errorMessage }}
        </p>

        <button type="submit" class="submit-btn" :disabled="loading || !email">
          {{ loading ? 'Enviando...' : 'Enviar código' }}
        </button>

        <div class="links-container">
          <NuxtLink to="/entrar" class="auth-link">
            Já tem uma senha? Entrar
          </NuxtLink>
        </div>
      </form>

      <!-- Step 2: Verify OTP + Choose Password -->
      <form v-else class="login-form" @submit.prevent="handleActivate">
        <p class="login-desc">
          Enviamos um código de 6 dígitos para seu e-mail. Digite o código e escolha sua nova senha.
        </p>

        <div class="email-summary">
          <span class="email-badge">{{ email }}</span>
          <button type="button" class="change-email-btn" :disabled="loading" @click="changeEmail">
            Alterar
          </button>
        </div>

        <div class="form-group">
          <label for="otp-code" class="form-label">Código de acesso</label>
          <input
            id="otp-code"
            ref="otpInputRef"
            v-model="otp"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            pattern="[0-9]*"
            required
            placeholder="000000"
            class="form-input otp-input"
            :disabled="loading"
            :aria-invalid="errorMessage ? 'true' : undefined"
            :aria-describedby="errorMessage ? 'activation-error' : undefined"
          >
        </div>

        <div class="form-group">
          <div class="label-row">
            <label for="new-password" class="form-label">Criar senha</label>
            <button
              type="button"
              class="toggle-password-btn"
              :disabled="loading"
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
            :disabled="loading"
            :aria-invalid="errorMessage ? 'true' : undefined"
            :aria-describedby="errorMessage ? 'activation-error' : undefined"
          >
        </div>

        <div class="form-group">
          <label for="confirm-password" class="form-label">Confirmar senha</label>
          <input
            id="confirm-password"
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            required
            minlength="8"
            maxlength="128"
            placeholder="Digite a senha novamente"
            class="form-input"
            :disabled="loading"
            :aria-invalid="errorMessage ? 'true' : undefined"
            :aria-describedby="errorMessage ? 'activation-error' : undefined"
          >
        </div>

        <p v-if="errorMessage" id="activation-error" class="error-message" role="alert">
          {{ errorMessage }}
        </p>

        <button
          type="submit"
          class="submit-btn"
          :disabled="loading || otp.length !== 6 || !newPassword || !confirmPassword"
        >
          {{ loading ? 'Ativando...' : 'Ativar conta' }}
        </button>

        <div class="resend-container">
          <button
            type="button"
            class="resend-btn"
            :disabled="resendCountdown > 0 || loading"
            @click="handleResendOtp"
          >
            {{ resendCountdown > 0 ? `Reenviar código em ${resendCountdown}s` : 'Reenviar código' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AuthSessionState } from '~/middleware/auth'
import { authClient } from '~/utils/auth-client'
import { emailSchema, isForbiddenPassword, otpSchema, senhaSchema } from '~~/shared/schemas/auth'

const route = useRoute()
const router = useRouter()

const step = ref<'email' | 'otp'>('email')
const email = ref('')
const otp = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const errorMessage = ref('')
const loading = ref(false)
const resendCountdown = ref(0)
const otpInputRef = ref<HTMLInputElement | null>(null)

let timer: ReturnType<typeof setInterval> | null = null

function startCountdown() {
  resendCountdown.value = 60
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    if (resendCountdown.value > 0) {
      resendCountdown.value--
    } else {
      if (timer) clearInterval(timer)
      timer = null
    }
  }, 1000)
}

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

function getSafeRedirectUrl(nextParam: unknown): string {
  if (typeof nextParam === 'string' && nextParam.startsWith('/') && !nextParam.startsWith('//')) {
    return nextParam
  }
  return '/app/bem-vindo'
}

async function handleRequestOtp() {
  errorMessage.value = ''
  const parsed = emailSchema.safeParse(email.value)
  if (!parsed.success) {
    errorMessage.value = parsed.error.issues[0]?.message ?? 'E-mail inválido.'
    return
  }

  loading.value = true
  try {
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: parsed.data,
      type: 'sign-in',
    })

    if (error) {
      if (error.status === 429) {
        errorMessage.value = 'Muitas tentativas. Aguarde uma hora e tente novamente.'
        return
      }
    }

    step.value = 'otp'
    startCountdown()
    await nextTick()
    otpInputRef.value?.focus()
  } catch {
    step.value = 'otp'
    startCountdown()
    await nextTick()
    otpInputRef.value?.focus()
  } finally {
    loading.value = false
  }
}

async function handleResendOtp() {
  if (resendCountdown.value > 0 || loading.value) return
  errorMessage.value = ''
  loading.value = true

  try {
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: email.value.trim().toLowerCase(),
      type: 'sign-in',
    })

    if (error && error.status === 429) {
      errorMessage.value = 'Muitas tentativas. Aguarde uma hora e tente novamente.'
    } else {
      startCountdown()
    }
  } catch {
    startCountdown()
  } finally {
    loading.value = false
  }
}

async function handleActivate() {
  errorMessage.value = ''

  const parsedOtp = otpSchema.safeParse(otp.value)
  if (!parsedOtp.success) {
    errorMessage.value = parsedOtp.error.issues[0]?.message ?? 'Código inválido.'
    await nextTick()
    otpInputRef.value?.focus()
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = 'As senhas não coincidem.'
    return
  }

  const parsedPassword = senhaSchema.safeParse(newPassword.value)
  if (!parsedPassword.success) {
    errorMessage.value = parsedPassword.error.issues[0]?.message ?? 'Senha inválida.'
    return
  }

  if (isForbiddenPassword(newPassword.value, { email: email.value })) {
    errorMessage.value = 'Senha muito fraca ou comum.'
    return
  }

  loading.value = true
  try {
    // 1. Verify OTP and obtain session
    const { error: signInError } = await authClient.signIn.emailOtp({
      email: email.value.trim().toLowerCase(),
      otp: parsedOtp.data,
    })

    if (signInError) {
      errorMessage.value = 'Código inválido ou expirado.'
      await nextTick()
      otpInputRef.value?.focus()
      return
    }

    // 2. Set the first password. better-auth marks setPassword server-only, so
    // it is absent from the client; our own route calls auth.api.setPassword
    // behind the session the step above just issued.
    try {
      await $fetch('/api/auth/set-password', {
        method: 'POST',
        body: { newPassword: parsedPassword.data },
      })
    } catch {
      errorMessage.value = 'Não foi possível definir a senha. Tente novamente.'
      return
    }

    // Invalidate cached auth session so middleware fetches fresh profile
    const session = useState<AuthSessionState>('auth:session')
    session.value = { user: null, fetched: false }

    const redirectPath = getSafeRedirectUrl(route.query.next)
    await router.push(redirectPath)
  } catch {
    errorMessage.value = 'Não foi possível ativar sua conta. Tente novamente.'
  } finally {
    loading.value = false
  }
}

function changeEmail() {
  step.value = 'email'
  otp.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  errorMessage.value = ''
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
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-color: var(--highlight);
}

.form-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.otp-input {
  font-size: var(--font-size-2xl);
  letter-spacing: 0.3em;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.email-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--input-bg);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-2);
}

.email-badge {
  font-size: var(--font-size-sm);
  color: #fff;
  word-break: break-all;
}

.change-email-btn {
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

.change-email-btn:hover:not(:disabled) {
  opacity: 0.8;
}

.change-email-btn:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
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

.resend-container {
  display: flex;
  justify-content: center;
  margin-top: var(--space-2);
}

.resend-btn {
  background: none;
  border: none;
  color: var(--text-color);
  font-size: var(--font-size-sm);
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  transition: color 0.2s;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}

.resend-btn:hover:not(:disabled) {
  color: #fff;
}

.resend-btn:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

.resend-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.links-container {
  display: flex;
  justify-content: center;
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

@media (prefers-reduced-motion: reduce) {
  .form-input,
  .submit-btn,
  .resend-btn {
    transition: none;
  }
}
</style>
