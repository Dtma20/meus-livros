<template>
  <div class="login-container">
    <div class="login-card">
      <h1 class="login-title">
        Entrar
      </h1>

      <!-- Step 1: Request OTP -->
      <form v-if="step === 'email'" class="login-form" @submit.prevent="handleRequestOtp">
        <p class="login-desc">
          Digite seu e-mail para receber um código de acesso de uso único.
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
          >
        </div>

        <p v-if="errorMessage" class="error-message" role="alert">
          {{ errorMessage }}
        </p>

        <button type="submit" class="submit-btn" :disabled="loading">
          {{ loading ? 'Enviando...' : 'Enviar código' }}
        </button>
      </form>

      <!-- Step 2: Verify OTP -->
      <form v-else class="login-form" @submit.prevent="handleVerifyOtp">
        <p class="login-desc">
          Enviamos um código de 6 dígitos para:
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
          >
        </div>

        <p v-if="errorMessage" class="error-message" role="alert">
          {{ errorMessage }}
        </p>

        <button type="submit" class="submit-btn" :disabled="loading || otp.length !== 6">
          {{ loading ? 'Verificando...' : 'Confirmar código' }}
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
import { ref, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AuthSessionState } from '~/middleware/auth'
import { authClient } from '~/utils/auth-client'
import { emailSchema, otpSchema } from '~~/shared/schemas/auth'

const route = useRoute()
const router = useRouter()

const step = ref<'email' | 'otp'>('email')
const email = ref('')
const otp = ref('')
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
  return '/'
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
      } else {
        // Any other error from allowlist or network behaves identically to success
        step.value = 'otp'
        startCountdown()
        await nextTick()
        otpInputRef.value?.focus()
      }
      return
    }

    step.value = 'otp'
    startCountdown()
    await nextTick()
    otpInputRef.value?.focus()
  } catch {
    // Network or other issue: still transition to step 2 to avoid enumeration
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

async function handleVerifyOtp() {
  errorMessage.value = ''
  const parsedOtp = otpSchema.safeParse(otp.value)
  if (!parsedOtp.success) {
    errorMessage.value = parsedOtp.error.issues[0]?.message ?? 'Código inválido.'
    await nextTick()
    otpInputRef.value?.focus()
    return
  }

  loading.value = true
  try {
    const { error } = await authClient.signIn.emailOtp({
      email: email.value.trim().toLowerCase(),
      otp: parsedOtp.data,
    })

    if (error) {
      errorMessage.value = 'Código inválido ou expirado.'
      await nextTick()
      otpInputRef.value?.focus()
      return
    }

    const redirectPath = getSafeRedirectUrl(route.query.next)

    // Invalidate cached auth session so middleware fetches fresh profile
    const session = useState<AuthSessionState>('auth:session')
    session.value = { user: null, fetched: false }

    if (redirectPath === '/') {
      await router.push('/app/bem-vindo')
    } else {
      await router.push(redirectPath)
    }
  } catch {
    errorMessage.value = 'Código inválido ou expirado.'
    await nextTick()
    otpInputRef.value?.focus()
  } finally {
    loading.value = false
  }
}

function changeEmail() {
  step.value = 'email'
  otp.value = ''
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

.form-label {
  font-size: var(--font-size-sm);
  color: #fff;
  font-weight: 500;
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
}

.form-input:focus {
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
}

.change-email-btn:hover:not(:disabled) {
  opacity: 0.8;
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
}

.submit-btn:hover:not(:disabled) {
  opacity: 0.9;
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
}

.resend-btn:hover:not(:disabled) {
  color: #fff;
}

.resend-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
