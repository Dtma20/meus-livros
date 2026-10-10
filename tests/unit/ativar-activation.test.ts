// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import AtivarPage from '../../app/pages/entrar/ativar.vue'
import { TIMEOUT_MESSAGE } from '../../app/utils/fetch-error'

const mocks = vi.hoisted(() => ({
  sendVerificationOtp: vi.fn(),
  signInEmailOtp: vi.fn(),
  push: vi.fn(),
}))

vi.mock('~/utils/auth-client', () => ({
  authClient: {
    emailOtp: { sendVerificationOtp: mocks.sendVerificationOtp },
    signIn: { emailOtp: mocks.signInEmailOtp },
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('~/components/ui/AppLogo.vue', () => ({
  default: { render: () => null },
}))

const globalScope = globalThis as unknown as Record<string, unknown>
const PASSWORD = 'Cafeteira-Azul-2026'

vi.hoisted(() => {
  const scope = globalThis as unknown as Record<string, unknown>
  scope.useSeoMeta = () => {}
  scope.useState = (_key: string, init?: () => unknown) => ({
    value: init ? init() : null,
  })
})

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
  const app = createApp(AtivarPage)
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

// Gets the page to the OTP step with every field filled in.
async function reachActivationStep(host: HTMLElement) {
  await fill(host, 'email', 'ana@exemplo.com')
  await submit(host)
  await fill(host, 'otp-code', '123456')
  await fill(host, 'new-password', PASSWORD)
  await fill(host, 'confirm-password', PASSWORD)
}

describe('/entrar/ativar - retry after set-password fails', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mocks.sendVerificationOtp.mockReset().mockResolvedValue({ error: null })
    mocks.signInEmailOtp.mockReset().mockResolvedValue({ error: null })
    mocks.push.mockReset().mockResolvedValue(undefined)
    fetchMock = vi.fn()
    globalScope.$fetch = fetchMock
  })

  afterEach(() => {
    delete globalScope.$fetch
  })

  it('consumes the OTP once: a retry after a failed set-password only repeats set-password', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('servidor caiu'))
      .mockResolvedValueOnce({})

    const page = mountPage()
    await reachActivationStep(page.host)

    await submit(page.host)
    expect(page.error()).toBe('Não foi possível definir a senha. Tente novamente.')

    await submit(page.host)

    expect(mocks.signInEmailOtp).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mocks.push).toHaveBeenCalledWith('/')

    page.unmount()
  })

  it('sends the set-password request with a 15 second timeout', async () => {
    fetchMock.mockResolvedValueOnce({})

    const page = mountPage()
    await reachActivationStep(page.host)
    await submit(page.host)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/set-password',
      expect.objectContaining({ method: 'POST', timeout: 15_000 }),
    )

    page.unmount()
  })

  it('shows the timeout message and frees the button when set-password times out', async () => {
    const timeout = Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' })
    fetchMock.mockRejectedValueOnce(timeout)

    const page = mountPage()
    await reachActivationStep(page.host)
    await submit(page.host)

    expect(page.error()).toBe(TIMEOUT_MESSAGE)
    expect(page.submitButton()?.disabled).toBe(false)

    page.unmount()
  })
})

describe('/entrar/ativar - motivo do erro ao validar o código', () => {
  beforeEach(() => {
    mocks.sendVerificationOtp.mockReset().mockResolvedValue({ error: null })
    mocks.signInEmailOtp.mockReset().mockResolvedValue({ error: null })
    mocks.push.mockReset().mockResolvedValue(undefined)
    globalScope.$fetch = vi.fn()
  })

  afterEach(() => {
    delete globalScope.$fetch
  })

  it('shows the server message when the attempts are used up (429)', async () => {
    mocks.signInEmailOtp.mockResolvedValueOnce({
      error: { status: 429, message: 'Muitas tentativas. Peça um novo código e tente mais tarde.' },
    })

    const page = mountPage()
    await reachActivationStep(page.host)
    await submit(page.host)

    expect(page.error()).toBe('Muitas tentativas. Peça um novo código e tente mais tarde.')
    expect(page.submitButton()?.disabled).toBe(false)

    page.unmount()
  })

  it('keeps the generic code message for a 400 that is only a bad or expired code', async () => {
    mocks.signInEmailOtp.mockResolvedValueOnce({
      error: { status: 400, message: 'Código inválido ou expirado.' },
    })

    const page = mountPage()
    await reachActivationStep(page.host)
    await submit(page.host)

    expect(page.error()).toBe('Código inválido ou expirado.')

    page.unmount()
  })

  it('keeps the generic code message for any other failure', async () => {
    mocks.signInEmailOtp.mockResolvedValueOnce({
      error: { status: 500, statusText: 'Internal Server Error' },
    })

    const page = mountPage()
    await reachActivationStep(page.host)
    await submit(page.host)

    expect(page.error()).toBe('Código inválido ou expirado.')

    page.unmount()
  })
})
