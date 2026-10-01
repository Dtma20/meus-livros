// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'

import LoginPage from '../../app/pages/entrar/index.vue'

vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.useSeoMeta = () => {}
  globalScope.useState = (_key: string, init?: () => unknown) => ({
    value: init ? init() : null,
  })
  globalScope.navigateTo = (to: string) => ({ path: to })
  globalScope.useId = () => 'test-sign-in-id'
})

const NuxtLink = defineComponent({
  name: 'NuxtLink',
  props: { to: { type: String, required: true } },
  setup(props, { slots }) {
    return () => h('a', { href: props.to }, slots.default?.())
  },
})

async function flush() {
  for (let i = 0; i < 3; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

function mountPage() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(LoginPage)
  app.component('NuxtLink', NuxtLink)
  app.mount(host)
  return {
    host,
    submitButton: () => host.querySelector<HTMLButtonElement>('button[type="submit"]'),
    error: () => host.querySelector('#login-error')?.textContent?.trim() ?? null,
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

describe('/entrar - submit with empty fields', () => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({}))
    globalScope.$fetch = fetchMock
  })

  afterEach(() => {
    delete globalScope.$fetch
  })

  it('renders the submit enabled on load', () => {
    const page = mountPage()
    expect(page.submitButton()?.disabled).toBe(false)
    page.unmount()
  })

  it('uses the short identifier placeholder', () => {
    const page = mountPage()
    expect(page.host.querySelector('#identificador')?.getAttribute('placeholder')).toBe('e-mail ou usuário')
    page.unmount()
  })

  it('shows the fill-in message and makes no request when both fields are empty', async () => {
    const page = mountPage()
    await submit(page.host)
    expect(page.error()).toBe('Preencha e-mail ou usuário e senha.')
    expect(fetchMock).not.toHaveBeenCalled()
    page.unmount()
  })

  it('shows the fill-in message and makes no request when only the password is missing', async () => {
    const page = mountPage()
    await fill(page.host, 'identificador', 'dtma23')
    await submit(page.host)
    expect(page.error()).toBe('Preencha e-mail ou usuário e senha.')
    expect(fetchMock).not.toHaveBeenCalled()
    page.unmount()
  })

  it('shows the fill-in message and makes no request when the identifier is only spaces', async () => {
    const page = mountPage()
    await fill(page.host, 'identificador', '   ')
    await fill(page.host, 'senha', 'uma-senha')
    await submit(page.host)
    expect(page.error()).toBe('Preencha e-mail ou usuário e senha.')
    expect(fetchMock).not.toHaveBeenCalled()
    page.unmount()
  })
})
