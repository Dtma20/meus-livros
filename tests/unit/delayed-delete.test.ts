import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { useDelayedDelete } from '../../app/composables/useDelayedDelete'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function mount(options: Parameters<typeof useDelayedDelete<string>>[0]) {
  let state: ReturnType<typeof useDelayedDelete<string>> | null = null
  const app = createApp(defineComponent({
    setup() {
      state = useDelayedDelete(options)
      return () => h('div')
    },
  }))
  const container = document.createElement('div')
  document.body.appendChild(container)
  app.mount(container)
  return {
    get state() {
      if (!state) throw new Error('undo state not initialized')
      return state
    },
    unmount() {
      app.unmount()
      container.remove()
    },
  }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  document.body.replaceChildren()
  vi.useRealTimers()
})

describe('useDelayedDelete', () => {
  it('keeps the six-second undo window and commits once when it expires', async () => {
    const remove = vi.fn(async () => undefined)
    const onSuccess = vi.fn()
    const wrapper = mount({ remove, onSuccess })
    wrapper.state.start('entry-1')

    expect(wrapper.state.pendingItem.value).toBe('entry-1')
    expect(wrapper.state.secondsRemaining.value).toBe(6)
    await vi.advanceTimersByTimeAsync(5999)
    expect(remove).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('entry-1', { reason: 'countdown', keepalive: false })
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(wrapper.state.pendingItem.value).toBeNull()
    wrapper.unmount()
  })

  it('cancels without sending a request', async () => {
    const remove = vi.fn(async () => undefined)
    const wrapper = mount({ remove })
    wrapper.state.start('entry-1')

    expect(wrapper.state.cancel()).toBe('entry-1')
    await vi.advanceTimersByTimeAsync(7000)
    expect(remove).not.toHaveBeenCalled()
    expect(wrapper.state.secondsRemaining.value).toBe(0)
    wrapper.unmount()
  })

  it('commits the previous snapshot before starting another undo window', async () => {
    const remove = vi.fn(async () => undefined)
    const wrapper = mount({ remove })
    wrapper.state.start('block-1')
    await vi.advanceTimersByTimeAsync(2000)

    wrapper.state.start('block-2')
    await flush()

    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('block-1', { reason: 'replacement', keepalive: false })
    expect(wrapper.state.pendingItem.value).toBe('block-2')
    expect(wrapper.state.secondsRemaining.value).toBe(6)
    wrapper.unmount()
  })

  it('commits a pending item on unmount without a second request after pagehide', async () => {
    const remove = vi.fn(async () => undefined)
    const wrapper = mount({ remove })
    wrapper.state.start('entry-1')

    window.dispatchEvent(new Event('pagehide'))
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('entry-1', { reason: 'pagehide', keepalive: true })
    wrapper.unmount()
    await flush()
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('only reports a pagehide result after a persisted page is restored and the delete is confirmed', async () => {
    const request = deferred<undefined>()
    const remove = vi.fn(() => request.promise)
    const onSuccess = vi.fn()
    const onFailure = vi.fn()
    const onPageHideResult = vi.fn()
    const wrapper = mount({ remove, onSuccess, onFailure, onPageHideResult })
    wrapper.state.start('entry-1')

    window.dispatchEvent(new Event('pagehide'))
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
    await flush()
    expect(onPageHideResult).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()

    const failure = new Error('server rejected delete')
    request.reject(failure)
    await flush()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onFailure).not.toHaveBeenCalled()
    expect(onPageHideResult).toHaveBeenCalledWith('entry-1', { success: false, error: failure })
    wrapper.unmount()
  })
})
