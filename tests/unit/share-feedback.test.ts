import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { useShareFeedback } from '../../app/composables/useShareFeedback'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function mount() {
  let state: ReturnType<typeof useShareFeedback> | null = null
  const app = createApp(defineComponent({
    setup() {
      state = useShareFeedback()
      return () => h('div')
    },
  }))
  const container = document.createElement('div')
  document.body.appendChild(container)
  app.mount(container)
  return {
    get state() {
      if (!state) throw new Error('share feedback not initialized')
      return state
    },
    unmount() {
      app.unmount()
      container.remove()
    },
  }
}

function installNavigator(options: { share?: (data: { title?: string; text?: string; url: string }) => Promise<void>; writeText?: (text: string) => Promise<void> }): void {
  const fakeNavigator = Object.create(navigator) as Navigator & {
    share?: (data: { title?: string; text?: string; url: string }) => Promise<void>
    clipboard?: Clipboard
  }
  if (options.share) Object.defineProperty(fakeNavigator, 'share', { value: options.share, configurable: true })
  if (options.writeText) {
    Object.defineProperty(fakeNavigator, 'clipboard', {
      value: { writeText: options.writeText } as Clipboard,
      configurable: true,
    })
  }
  vi.stubGlobal('navigator', fakeNavigator)
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  vi.useRealTimers()
})

const shareData = {
  title: 'Dom Casmurro',
  text: 'Uma leitura.',
  url: 'https://meus-livros.app/entrada/log-1',
}

describe('useShareFeedback', () => {
  it('treats native share cancellation as a normal cancellation', async () => {
    const share = vi.fn(async () => {
      throw Object.assign(new Error('cancelado'), { name: 'AbortError' })
    })
    const writeText = vi.fn(async () => undefined)
    const wrapper = mount()
    installNavigator({ share, writeText })

    await wrapper.state.share(shareData)

    expect(share).toHaveBeenCalledWith(shareData)
    expect(writeText).not.toHaveBeenCalled()
    expect(wrapper.state.copied.value).toBe(false)
    expect(wrapper.state.fallbackVisible.value).toBe(false)
    expect(wrapper.state.isSharing.value).toBe(false)
    wrapper.unmount()
  })

  it('provides a selectable URL when clipboard is unavailable or rejects', async () => {
    const wrapper = mount()
    installNavigator({ writeText: vi.fn(async () => { throw new Error('clipboard blocked') }) })

    await wrapper.state.share(shareData)

    expect(wrapper.state.fallbackVisible.value).toBe(true)
    expect(wrapper.state.shareUrl.value).toBe(shareData.url)
    expect(wrapper.state.feedbackMessage.value).toContain('Selecione e copie o link')
    wrapper.unmount()
  })

  it('clears copied feedback after 2.5 seconds and cleans its timer on unmount', async () => {
    const wrapper = mount()
    installNavigator({ writeText: vi.fn(async () => undefined) })

    await wrapper.state.share(shareData)
    expect(wrapper.state.copied.value).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(2500)
    await nextTick()
    expect(wrapper.state.copied.value).toBe(false)
    expect(wrapper.state.feedbackMessage.value).toBe('')

    await wrapper.state.share(shareData)
    expect(vi.getTimerCount()).toBe(1)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('guards concurrent share actions until the first request settles', async () => {
    const request = deferred<undefined>()
    const share = vi.fn(() => request.promise)
    const wrapper = mount()
    installNavigator({ share })

    const first = wrapper.state.share(shareData)
    await nextTick()
    const second = wrapper.state.share(shareData)

    expect(share).toHaveBeenCalledTimes(1)
    expect(wrapper.state.isSharing.value).toBe(true)
    request.resolve(undefined)
    await Promise.all([first, second])
    expect(wrapper.state.isSharing.value).toBe(false)
    wrapper.unmount()
  })

  it('does not start clipboard feedback when a pending native share rejects after unmount', async () => {
    const request = deferred<undefined>()
    const share = vi.fn(() => request.promise)
    const writeText = vi.fn(async () => undefined)
    const wrapper = mount()
    installNavigator({ share, writeText })

    const pending = wrapper.state.share(shareData)
    wrapper.unmount()
    request.reject(new Error('share failed'))
    await pending

    expect(writeText).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
