<template>
  <div class="convites-page">
    <div v-if="pending" class="loading-state">
      <LoadingSkeleton :count="4" />
    </div>

    <div v-else-if="error && is404" class="not-found-state">
      <EmptyState
        heading-tag="h1"
        title="Não encontramos essa página."
        action-label="Ir para o início"
        action-href="/"
      />
    </div>

    <div v-else-if="error" class="error-state">
      <ErrorState
        heading-tag="h1"
        @retry="refresh"
      />
    </div>

    <div v-else class="convites-container">
      <header class="convites-header">
        <h1 class="convites-title">
          Convites
        </h1>
        <p class="helper-text">
          Quem estiver nesta lista pode ativar a conta em /entrar/ativar. O código chega por e-mail em até um minuto; peça para conferir o spam.
        </p>
      </header>

      <section class="invite-form-card" aria-labelledby="form-heading">
        <h2 id="form-heading" class="section-title">
          Novo convite
        </h2>

        <form class="invite-form" @submit.prevent="handleAddInvite">
          <div class="form-group">
            <label for="invite-email" class="form-label">E-mail</label>
            <input
              id="invite-email"
              v-model="email"
              type="email"
              required
              maxlength="254"
              placeholder="exemplo@dominio.com"
              class="form-input"
              :class="{ 'input-error': Boolean(fieldError) }"
              :disabled="submitting"
              :aria-invalid="fieldError ? 'true' : undefined"
              :aria-describedby="fieldError ? 'email-error' : undefined"
            >
            <p v-if="fieldError" id="email-error" class="field-error-message" role="alert">
              {{ fieldError }}
            </p>
          </div>

          <div class="form-group">
            <label for="invite-note" class="form-label">Observação (opcional)</label>
            <input
              id="invite-note"
              v-model="note"
              type="text"
              maxlength="200"
              placeholder="Ex.: indicação de Fulano"
              class="form-input"
              :disabled="submitting"
            >
          </div>

          <p v-if="formSuccess" class="form-success-message" role="status">
            {{ formSuccess }}
          </p>

          <p v-if="formError" class="form-error-message" role="alert">
            {{ formError }}
          </p>

          <button
            type="submit"
            class="btn btn-primary submit-btn"
            :disabled="submitting || !email.trim()"
          >
            {{ submitting ? 'Convidando...' : 'Convidar' }}
          </button>
        </form>
      </section>

      <section class="invites-list-section" aria-labelledby="list-heading">
        <h2 id="list-heading" class="section-title">
          Convites cadastrados ({{ invites.length }})
        </h2>

        <p v-if="listError" class="list-error-message" role="alert">
          {{ listError }}
        </p>

        <EmptyState
          v-if="invites.length === 0"
          title="Nenhum convite cadastrado."
          message="Adicione um e-mail acima para convidar alguém."
        />

        <div v-else class="invites-list">
          <div
            v-for="item in invites"
            :key="item.email"
            class="invite-item-card"
          >
            <div class="invite-item-main">
              <div class="invite-item-top">
                <span class="invite-email">{{ item.email }}</span>
                <span
                  class="status-badge"
                  :class="item.status === 'ativado' ? 'status-ativado' : 'status-pendente'"
                >
                  {{ item.status === 'ativado' ? 'Ativado' : 'Pendente' }}
                </span>
              </div>

              <p v-if="item.note" class="invite-note">
                {{ item.note }}
              </p>

              <div class="invite-meta">
                <span v-if="item.invited_by_handle" class="meta-invited-by">
                  Convidado por @{{ item.invited_by_handle }}
                </span>
                <span class="meta-date">
                  {{ formatFullDate(item.created_at) }}
                </span>
              </div>
            </div>

            <div v-if="item.email.toLowerCase() !== currentAdminEmail" class="invite-item-actions">
              <button
                type="button"
                class="btn btn-danger btn-sm remove-btn"
                :disabled="removingEmail === item.email"
                @click="handleRemoveInvite(item)"
              >
                {{ removingEmail === item.email ? 'Removendo...' : 'Remover' }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import EmptyState from '~/components/ui/EmptyState.vue'
import ErrorState from '~/components/ui/ErrorState.vue'
import LoadingSkeleton from '~/components/ui/LoadingSkeleton.vue'
import type { InviteView } from '~~/shared/schemas/invites'
import type { AuthSessionState } from '~/middleware/auth'
import { formatFullDate } from '~/utils/date'
import { isTimeoutOrAbort, TIMEOUT_MESSAGE } from '~/utils/fetch-error'

definePageMeta({
  layout: 'app',
  middleware: 'auth',
})

useSeoMeta({
  title: 'Convites',
})

const requestFetch = useRequestFetch()
const session = useState<AuthSessionState>('auth:session')
const currentAdminEmail = computed(() => session.value?.user?.email?.trim().toLowerCase() ?? '')

const { data, pending, error, refresh } = await useAsyncData(
  'admin-invites',
  () =>
    requestFetch<{ invites: InviteView[] }>('/api/admin/convites', {
      timeout: 15_000,
      retry: 0,
    }),
)

const invites = ref<InviteView[]>(data.value?.invites ? [...data.value.invites] : [])

watch(
  () => data.value?.invites,
  (newInvites) => {
    if (newInvites) {
      invites.value = [...newInvites]
    }
  },
)

const is404 = computed(() => {
  const err = error.value as { statusCode?: number; data?: { error?: string } } | null
  return err?.statusCode === 404 || err?.data?.error === 'nao_encontrado'
})

const email = ref('')
const note = ref('')
const submitting = ref(false)
const fieldError = ref('')
const formSuccess = ref('')
const formError = ref('')

const removingEmail = ref<string | null>(null)
const listError = ref('')

async function handleAddInvite() {
  fieldError.value = ''
  formSuccess.value = ''
  formError.value = ''

  const trimmedEmail = email.value.trim().toLowerCase()
  if (!trimmedEmail) {
    fieldError.value = 'Informe um e-mail válido.'
    return
  }

  submitting.value = true

  try {
    const res = await $fetch<{ invite: InviteView }>('/api/admin/convites', {
      method: 'POST',
      body: {
        email: trimmedEmail,
        note: note.value.trim() || null,
      },
      timeout: 15_000,
    })

    if (res?.invite) {
      invites.value.unshift(res.invite)
      email.value = ''
      note.value = ''
      formSuccess.value = 'Convite adicionado com sucesso!'
    }
  } catch (err: unknown) {
    if (isTimeoutOrAbort(err)) {
      formError.value = TIMEOUT_MESSAGE
      return
    }
    const fetchErr = err as { statusCode?: number; data?: { error?: string; message?: string } }
    if (fetchErr.statusCode === 409 || fetchErr.data?.error === 'convite_existente') {
      fieldError.value = fetchErr.data?.message || 'Este e-mail já está na lista de convites.'
    } else {
      fieldError.value = fetchErr.data?.message || 'Não foi possível adicionar o convite.'
    }
  } finally {
    submitting.value = false
  }
}

async function handleRemoveInvite(invite: InviteView) {
  const confirmMessage = invite.status === 'ativado'
    ? `Remover o convite de ${invite.email}? A pessoa perde o acesso: as sessões abertas são encerradas e a senha deixa de valer.`
    : `Remover o convite de ${invite.email}?`
  const confirmed = window.confirm(confirmMessage)
  if (!confirmed) return

  listError.value = ''
  removingEmail.value = invite.email

  try {
    await $fetch('/api/admin/convites', {
      method: 'DELETE',
      body: {
        email: invite.email,
      },
      timeout: 15_000,
    })

    invites.value = invites.value.filter(
      (item) => item.email.toLowerCase() !== invite.email.toLowerCase(),
    )
  } catch (err: unknown) {
    if (isTimeoutOrAbort(err)) {
      listError.value = TIMEOUT_MESSAGE
      return
    }
    const fetchErr = err as { data?: { message?: string } }
    listError.value = fetchErr.data?.message || 'Não foi possível remover o convite.'
  } finally {
    removingEmail.value = null
  }
}
</script>

<style scoped>
.convites-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-4) 0;
  width: 100%;
}

.loading-state,
.not-found-state,
.error-state {
  width: 100%;
  max-width: 640px;
}

.convites-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  width: 100%;
  max-width: 640px;
}

.convites-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.convites-title {
  font-size: var(--font-size-2xl);
  color: #fff;
  margin: 0;
}

.helper-text {
  color: var(--text-color);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  margin: 0;
}

.section-title {
  font-size: var(--font-size-lg);
  color: #fff;
  margin: 0 0 var(--space-4) 0;
}

.invite-form-card {
  background-color: var(--card-bg);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.invite-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
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
  min-height: var(--target-min-size);
}

.form-input:focus {
  outline: none;
  border-color: var(--highlight);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
}

.form-input:focus-visible {
  border-color: var(--highlight);
  box-shadow: none;
}

.input-error {
  border-color: var(--danger);
}

.field-error-message {
  color: var(--danger);
  font-size: var(--font-size-xs);
  margin: var(--space-1) 0 0 0;
}

.form-error-message {
  color: var(--danger);
  font-size: var(--font-size-sm);
  margin: 0;
}

.form-success-message {
  color: var(--success);
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
  min-height: var(--target-min-size);
  box-sizing: border-box;
  transition: opacity 0.2s;
  margin-top: var(--space-1);
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

.invites-list-section {
  display: flex;
  flex-direction: column;
}

.list-error-message {
  color: var(--danger);
  font-size: var(--font-size-sm);
  margin: 0 0 var(--space-3) 0;
}

.invites-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.invite-item-card {
  background-color: var(--card-bg);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.invite-item-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.invite-item-top {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.invite-email {
  color: #fff;
  font-weight: 600;
  font-size: var(--font-size-base);
  word-break: break-all;
}

.status-badge {
  font-size: var(--font-size-xs);
  font-weight: 600;
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  text-transform: capitalize;
}

.status-pendente {
  color: var(--highlight);
  background-color: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.status-ativado {
  color: var(--success);
  background-color: color-mix(in srgb, var(--success) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
}

.invite-note {
  color: #fff;
  font-size: var(--font-size-sm);
  margin: var(--space-1) 0 0 0;
}

.invite-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--font-size-xs);
  color: var(--text-color);
  flex-wrap: wrap;
  margin-top: var(--space-1);
}

.meta-invited-by {
  color: var(--text-color);
}

.meta-date {
  color: var(--text-color);
}

.invite-item-actions {
  flex-shrink: 0;
}



@media (prefers-reduced-motion: reduce) {
  .form-input,
  .submit-btn,
  .remove-btn {
    transition: none;
  }
}
</style>
