// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type Ref } from 'vue'
import AppLayout from '../../app/layouts/app.vue'

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn() }))

vi.mock('~/utils/auth-client', () => ({
  authClient: { signOut: signOutMock },
}))

vi.mock('~/composables/useDelayedDelete', () => ({
  flushPendingDeletes: vi.fn(async () => {}),
}))

const states = new Map<string, Ref<unknown>>()
const apps: ReturnType<typeof createApp>[] = []
let navigateMock: ReturnType<typeof vi.fn>

const NuxtLink = defineComponent({
  props: { to: { type: String, required: true } },
  setup(props, { attrs, slots }) {
    return () => h('a', { href: props.to, ...attrs }, slots.default?.())
  },
})

const NuxtLayout = defineComponent({
  props: { name: { type: String, default: 'default' } },
  setup(_props, { slots }) {
    return () => h('div', [slots.nav?.(), slots.default?.()])
  },
})

function mountLayout() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(AppLayout)
  app.component('NuxtLink', NuxtLink)
  app.component('NuxtLayout', NuxtLayout)
  app.mount(container)
  apps.push(app)
  return container
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

describe('authenticated layout sign-out', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    states.clear()
    states.set('auth:session', ref({ user: { id: 'user-1', handle: 'leitor' }, fetched: true }))
    signOutMock.mockReset()
    navigateMock = vi.fn()
    vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
      const state = states.get(key)
      if (state) return state
      const nextState = ref(init ? init() : undefined)
      states.set(key, nextState)
      return nextState
    })
    vi.stubGlobal('navigateTo', navigateMock)
  })

  afterEach(() => {
    for (const app of apps.splice(0)) app.unmount()
    document.body.replaceChildren()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('keeps the session and allows retry when sign-out returns an error', async () => {
    signOutMock
      .mockResolvedValueOnce({ data: null, error: { status: 500 } })
      .mockResolvedValueOnce({ data: { status: true }, error: null })
    const container = mountLayout()
    const button = container.querySelector<HTMLButtonElement>('.nav-btn')
    if (!button) throw new Error('Expected sign-out button to be rendered')

    button.click()
    await flushPromises()

    expect(states.get('auth:session')?.value).toEqual({
      user: { id: 'user-1', handle: 'leitor' },
      fetched: true,
    })
    expect(navigateMock).not.toHaveBeenCalled()
    expect(button.disabled).toBe(false)
    expect(container.querySelector('.flash-bar.is-error')?.textContent).toContain(
      'Não foi possível sair. Tente novamente.',
    )

    button.click()
    await flushPromises()

    expect(signOutMock).toHaveBeenCalledTimes(2)
    expect(states.get('auth:session')?.value).toEqual({ user: null, fetched: false })
    expect(navigateMock).toHaveBeenCalledWith('/', { external: true })
  })

  it('keeps the session and allows retry when the sign-out request rejects', async () => {
    signOutMock.mockRejectedValueOnce(new Error('network error'))
    const container = mountLayout()
    const button = container.querySelector<HTMLButtonElement>('.nav-btn')
    if (!button) throw new Error('Expected sign-out button to be rendered')

    button.click()
    await flushPromises()

    expect(states.get('auth:session')?.value).toEqual({
      user: { id: 'user-1', handle: 'leitor' },
      fetched: true,
    })
    expect(navigateMock).not.toHaveBeenCalled()
    expect(button.disabled).toBe(false)
    expect(container.querySelector('.flash-bar.is-error')?.textContent).toContain(
      'Não foi possível sair. Tente novamente.',
    )
  })

  it('keeps the session and releases the button when the sign-out request times out', async () => {
    signOutMock.mockReturnValueOnce(new Promise<never>(() => {}))
    const container = mountLayout()
    const button = container.querySelector<HTMLButtonElement>('.nav-btn')
    if (!button) throw new Error('Expected sign-out button to be rendered')

    button.click()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(10_000)
    await flushPromises()

    expect(states.get('auth:session')?.value).toEqual({
      user: { id: 'user-1', handle: 'leitor' },
      fetched: true,
    })
    expect(navigateMock).not.toHaveBeenCalled()
    expect(button.disabled).toBe(false)
    expect(container.querySelector('.flash-bar.is-error')?.textContent).toContain(
      'Não foi possível sair. Tente novamente.',
    )
  })
})
