// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { flushPendingDeletes, useDelayedDelete } from '../../app/composables/useDelayedDelete'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
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

describe('flushPendingDeletes', () => {
  it('sends a pending delete as an ordinary request and resolves after it succeeds', async () => {
    const remove = vi.fn(async () => undefined)
    const onSuccess = vi.fn()
    const wrapper = mount({ remove, onSuccess })
    wrapper.state.start('entry-1')

    await flushPendingDeletes()

    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('entry-1', { reason: 'leave', keepalive: false })
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(wrapper.state.pendingItem.value).toBeNull()
    expect(wrapper.state.secondsRemaining.value).toBe(0)

    // The countdown was cancelled by the flush: nothing else is sent when it would have expired.
    await vi.advanceTimersByTimeAsync(7000)
    expect(remove).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('waits for a countdown request that is already in flight', async () => {
    const request = deferred<undefined>()
    const remove = vi.fn(() => request.promise)
    const wrapper = mount({ remove })
    wrapper.state.start('entry-1')
    await vi.advanceTimersByTimeAsync(6000)
    expect(remove).toHaveBeenCalledWith('entry-1', { reason: 'countdown', keepalive: false })

    let settled = false
    const flushed = flushPendingDeletes().then(() => {
      settled = true
    })
    await flush()
    expect(settled).toBe(false)

    request.resolve(undefined)
    await flushed
    expect(settled).toBe(true)
    wrapper.unmount()
  })

  it('resolves, without throwing, when the delete fails, and reports the failure', async () => {
    const failure = new Error('server rejected delete')
    const remove = vi.fn(async () => {
      throw failure
    })
    const onFailure = vi.fn()
    const wrapper = mount({ remove, onFailure })
    wrapper.state.start('entry-1')

    await expect(flushPendingDeletes()).resolves.toBeUndefined()
    expect(onFailure).toHaveBeenCalledWith('entry-1', failure, { reason: 'leave', keepalive: false })
    wrapper.unmount()
  })

  it('resolves immediately when nothing is pending', async () => {
    const remove = vi.fn(async () => undefined)
    const wrapper = mount({ remove })

    await expect(flushPendingDeletes()).resolves.toBeUndefined()
    expect(remove).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('no longer flushes an instance after it unmounts', async () => {
    const remove = vi.fn(async () => undefined)
    const wrapper = mount({ remove })
    wrapper.state.start('entry-1')
    wrapper.unmount()
    await flush()
    expect(remove).toHaveBeenCalledTimes(1)

    await flushPendingDeletes()
    expect(remove).toHaveBeenCalledTimes(1)
  })
})
