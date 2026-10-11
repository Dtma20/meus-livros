// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import SenhaPage from '../../app/pages/entrar/senha.vue'
import { TIMEOUT_MESSAGE } from '../../app/utils/fetch-error'

const mocks = vi.hoisted(() => ({
  forgetPasswordEmailOtp: vi.fn(),
  resetPassword: vi.fn(),
}))

vi.mock('~/utils/auth-client', () => ({
  authClient: {
    forgetPassword: { emailOtp: mocks.forgetPasswordEmailOtp },
    emailOtp: { resetPassword: mocks.resetPassword },
  },
}))

vi.mock('~/components/ui/AppLogo.vue', () => ({
  default: { render: () => null },
}))

vi.hoisted(() => {
  const scope = globalThis as unknown as Record<string, unknown>
  scope.useSeoMeta = () => {}
})

const PASSWORD = 'Cafeteira-Azul-2026'

const NuxtLink = defineComponent({
  name: 'NuxtLink',
  props: { to: { type: String, required: true } },
  setup(props, { slots }) {
    return () => h('a', { href: props.to }, slots.default?.())
  },
})

async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

function mountPage() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(SenhaPage)
  app.component('NuxtLink', NuxtLink)
  app.mount(host)
  return {
    host,
    submitButton: () => host.querySelector<HTMLButtonElement>('button[type="submit"]'),
    error: () => host.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
    unmount: () => {
      app.unmount()
      host.remove()
    },
  }
}

async function fill(host: HTMLElement, id: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`#${id}`)
  if (!input) throw new Error(`Campo #${id} não encontrado.`)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}

async function submit(host: HTMLElement) {
  const form = host.querySelector('form')
  if (!form) throw new Error('Formulário não encontrado.')
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
}

function timeoutError() {
  return Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' })
}

describe('/entrar/senha - timeouts', () => {
  beforeEach(() => {
    mocks.forgetPasswordEmailOtp.mockReset().mockResolvedValue({ error: null })
    mocks.resetPassword.mockReset().mockResolvedValue({ error: null })
  })

  it('stays on the email step with a timeout message when the code request times out', async () => {
    mocks.forgetPasswordEmailOtp.mockRejectedValueOnce(timeoutError())

    const page = mountPage()
    await fill(page.host, 'email', 'ana@exemplo.com')
    await submit(page.host)

    expect(page.error()).toBe(TIMEOUT_MESSAGE)
    expect(page.host.querySelector('#otp-code')).toBeNull()
    expect(page.submitButton()?.disabled).toBe(false)

    page.unmount()
  })

  it('shows the timeout message and frees the button when the password reset times out', async () => {
    mocks.resetPassword.mockRejectedValueOnce(timeoutError())

    const page = mountPage()
    await fill(page.host, 'email', 'ana@exemplo.com')
    await submit(page.host)
    await fill(page.host, 'otp-code', '123456')
    await fill(page.host, 'new-password', PASSWORD)
    await fill(page.host, 'confirm-password', PASSWORD)
    await submit(page.host)

    expect(page.error()).toBe('Não foi possível concluir agora. Verifique sua conexão e tente novamente.')
    expect(page.submitButton()?.disabled).toBe(false)

    page.unmount()
  })
})

describe('/entrar/senha - motivo do erro ao redefinir', () => {
  beforeEach(() => {
    mocks.forgetPasswordEmailOtp.mockReset().mockResolvedValue({ error: null })
    mocks.resetPassword.mockReset().mockResolvedValue({ error: null })
  })

  // Gets the page to the reset step with a valid code and password, then submits.
  async function resetWithAnswer(answer: { error: unknown }) {
    mocks.resetPassword.mockResolvedValueOnce(answer)

    const page = mountPage()
    await fill(page.host, 'email', 'ana@exemplo.com')
    await submit(page.host)
    await fill(page.host, 'otp-code', '123456')
    await fill(page.host, 'new-password', PASSWORD)
    await fill(page.host, 'confirm-password', PASSWORD)
    await submit(page.host)

    return page
  }

  it('shows the server password-rule message for a 400', async () => {
    const page = await resetWithAnswer({
      error: { status: 400, message: 'Senha inválida ou muito fraca.' },
    })

    expect(page.error()).toBe('Senha inválida ou muito fraca.')
    expect(page.submitButton()?.disabled).toBe(false)

    page.unmount()
  })

  it('shows the server message when the attempts are used up (429)', async () => {
    const page = await resetWithAnswer({
      error: { status: 429, message: 'Muitas tentativas. Peça um novo código e tente mais tarde.' },
    })

    expect(page.error()).toBe('Muitas tentativas. Peça um novo código e tente mais tarde.')

    page.unmount()
  })

  it('shows the connection message for a server error', async () => {
    const page = await resetWithAnswer({
      error: { status: 500, statusText: 'Internal Server Error' },
    })

    expect(page.error()).toBe('Não foi possível concluir agora. Verifique sua conexão e tente novamente.')

    page.unmount()
  })

  it('keeps the generic code message for an unauthorized response', async () => {
    const page = await resetWithAnswer({
      error: { status: 401, message: 'Unauthorized' },
    })

    expect(page.error()).toBe('Código inválido ou expirado.')

    page.unmount()
  })

  it('shows the connection message when password reset rejects with a server error', async () => {
    mocks.resetPassword.mockRejectedValueOnce({ status: 500 })

    const page = mountPage()
    await fill(page.host, 'email', 'ana@exemplo.com')
    await submit(page.host)
    await fill(page.host, 'otp-code', '123456')
    await fill(page.host, 'new-password', PASSWORD)
    await fill(page.host, 'confirm-password', PASSWORD)
    await submit(page.host)

    expect(page.error()).toBe('Não foi possível concluir agora. Verifique sua conexão e tente novamente.')
    expect(page.host.querySelector<HTMLInputElement>('#otp-code')?.value).toBe('123456')
    expect(page.host.querySelector<HTMLInputElement>('#new-password')?.value).toBe(PASSWORD)

    page.unmount()
  })

  it('keeps the generic code message when password reset rejects as unauthorized', async () => {
    mocks.resetPassword.mockRejectedValueOnce({ status: 401 })

    const page = mountPage()
    await fill(page.host, 'email', 'ana@exemplo.com')
    await submit(page.host)
    await fill(page.host, 'otp-code', '123456')
    await fill(page.host, 'new-password', PASSWORD)
    await fill(page.host, 'confirm-password', PASSWORD)
    await submit(page.host)

    expect(page.error()).toBe('Código inválido ou expirado.')

    page.unmount()
  })
})
