// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import PerfilPage from '../../app/pages/app/perfil.vue'

const mocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
}))

vi.mock('~/utils/auth-client', () => ({
  authClient: { changePassword: mocks.changePassword },
}))

vi.hoisted(() => {
  const scope = globalThis as unknown as Record<string, unknown>
  scope.definePageMeta = () => {}
  scope.useSeoMeta = () => {}
})

const globalScope = globalThis as unknown as Record<string, unknown>

const seedUser = {
  id: 'user-1',
  email: 'ana@exemplo.com',
  handle: 'ana',
  display_name: 'Nome antigo',
  bio: 'Bio antiga',
  profile_visibility: 'publico',
}

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
  const app = createApp(PerfilPage)
  app.component('NuxtLink', NuxtLink)
  app.mount(host)
  return {
    host,
    unmount: () => {
      app.unmount()
      host.remove()
    },
  }
}

async function typeInto(host: HTMLElement, selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)
  if (!input) throw new Error(`Campo ${selector} não encontrado.`)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}

async function submitPasswordChange(host: HTMLElement) {
  await typeInto(host, '#current-password', 'senha-atual')
  await typeInto(host, '#new-password', 'Cafeteira-Azul-2026')
  await typeInto(host, '#confirm-password', 'Cafeteira-Azul-2026')
  const form = host.querySelector<HTMLFormElement>('.password-card form')
  if (!form) throw new Error('Formulário de senha não encontrado.')
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
}

describe('/app/perfil - slow profile load', () => {
  beforeEach(() => {
    globalScope.useState = () => ({
      value: {
        user: structuredClone(seedUser),
        hasProfile: true,
        fetched: true,
      },
    })
    mocks.changePassword.mockReset()
  })

  it('does not overwrite a field the user already edited when the GET arrives late', async () => {
    let resolveMe: (value: unknown) => void = () => {}
    globalScope.$fetch = vi.fn(() => new Promise((resolve) => {
      resolveMe = resolve
    }))

    const page = mountPage()
    await typeInto(page.host, '#profile-name', 'Nome digitado')
    resolveMe({ ...seedUser, display_name: 'Nome do servidor', bio: 'Bio do servidor' })
    await flush()

    const name = page.host.querySelector<HTMLInputElement>('#profile-name')
    const bio = page.host.querySelector<HTMLTextAreaElement>('#profile-bio')
    expect(name?.value).toBe('Nome digitado')
    // The bio was not touched, so the server value still fills it in.
    expect(bio?.value).toBe('Bio do servidor')

    page.unmount()
    delete globalScope.$fetch
  })

  it('does not overwrite the visibility choice the user already made', async () => {
    let resolveMe: (value: unknown) => void = () => {}
    globalScope.$fetch = vi.fn(() => new Promise((resolve) => {
      resolveMe = resolve
    }))

    const page = mountPage()
    const privado = page.host.querySelector<HTMLInputElement>('input[name="visibility"][value="privado"]')
    if (!privado) throw new Error('Opção "privado" não encontrada.')
    privado.checked = true
    privado.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()

    resolveMe({ ...seedUser, profile_visibility: 'publico' })
    await flush()

    expect(page.host.querySelector<HTMLInputElement>('input[name="visibility"][value="privado"]')?.checked).toBe(true)

    page.unmount()
    delete globalScope.$fetch
  })
})

describe('/app/perfil - change password errors', () => {
  beforeEach(() => {
    globalScope.useState = () => ({
      value: {
        user: structuredClone(seedUser),
        hasProfile: true,
        fetched: true,
      },
    })
    globalScope.$fetch = vi.fn(async () => ({ ...seedUser }))
    mocks.changePassword.mockReset()
  })

  afterEach(() => {
    delete globalScope.$fetch
  })

  it('shows the connection message for a returned server error and keeps the fields filled', async () => {
    mocks.changePassword.mockResolvedValueOnce({ error: { status: 500 } })

    const page = mountPage()
    await submitPasswordChange(page.host)

    expect(page.host.querySelector('#password-error')?.textContent?.trim())
      .toBe('Não foi possível concluir agora. Verifique sua conexão e tente novamente.')
    expect(page.host.querySelector<HTMLInputElement>('#current-password')?.value).toBe('senha-atual')
    expect(page.host.querySelector<HTMLInputElement>('#new-password')?.value).toBe('Cafeteira-Azul-2026')

    page.unmount()
  })

  it('keeps the credential message for a returned unauthorized response', async () => {
    mocks.changePassword.mockResolvedValueOnce({ error: { status: 401 } })

    const page = mountPage()
    await submitPasswordChange(page.host)

    expect(page.host.querySelector('#password-error')?.textContent?.trim()).toBe('Senha atual incorreta.')

    page.unmount()
  })

  it('shows the connection message when password change rejects with a server error', async () => {
    mocks.changePassword.mockRejectedValueOnce({ status: 500 })

    const page = mountPage()
    await submitPasswordChange(page.host)

    expect(page.host.querySelector('#password-error')?.textContent?.trim())
      .toBe('Não foi possível concluir agora. Verifique sua conexão e tente novamente.')

    page.unmount()
  })

  it('keeps the credential message when password change rejects as unauthorized', async () => {
    mocks.changePassword.mockRejectedValueOnce({ status: 401 })

    const page = mountPage()
    await submitPasswordChange(page.host)

    expect(page.host.querySelector('#password-error')?.textContent?.trim()).toBe('Senha atual incorreta.')

    page.unmount()
  })
})
