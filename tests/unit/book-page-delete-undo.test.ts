// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref, Suspense, type Ref, type SetupContext } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import BookPage from '../../app/pages/livro/[slug].vue'
import type { WorkWithDetails } from '../../shared/schemas/work'

const CREATOR_ID = '99999999-9999-9999-9999-999999999999'

const mocks = vi.hoisted(() => {
  const store = new Map<string, unknown>()
  return {
    store,
    fetchMock: vi.fn(),
    navigateMock: vi.fn(() => Promise.resolve()),
  }
})

const mockWorkData = ref<WorkWithDetails | null>(null)

vi.hoisted(() => {
  const g = globalThis as unknown as Record<string, unknown>
  g.defineNuxtRouteMiddleware = (fn: unknown) => fn
  g.definePageMeta = () => {}
  g.useId = () => 'test-id'
  g.useRequestFetch = () => () => Promise.resolve(null)
  g.useRequestURL = () => new URL('http://localhost:3000/livro/teste')
  g.useSeoMeta = () => {}
  g.useHead = () => {}
  g.createError = (err: unknown) => err
})

beforeEach(() => {
  const g = globalThis as unknown as Record<string, unknown>
  mocks.store.clear()
  mocks.fetchMock.mockReset()
  mocks.navigateMock.mockClear()
  g.useAsyncData = () => ({ data: mockWorkData, pending: ref(false), error: ref(null) })
  g.useState = (key: string, init: () => unknown) => {
    if (!mocks.store.has(key)) mocks.store.set(key, ref(init()))
    return mocks.store.get(key)
  }
  g.$fetch = mocks.fetchMock
  g.navigateTo = mocks.navigateMock
  mocks.store.set('auth:session', ref({ user: { id: CREATOR_ID } }))
  vi.useFakeTimers()
})

let unmountCurrent: (() => void) | null = null

afterEach(() => {
  unmountCurrent?.()
  unmountCurrent = null
  vi.useRealTimers()
})

async function flushAsync() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

function buildWork(): WorkWithDetails {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'livro-teste',
    title: 'Livro Teste',
    original_language: 'en',
    first_published_year: 2020,
    series_name: null,
    series_number: null,
    cover_url: null,
    authors: [],
    genres: [],
    editions: [],
    logs: [],
    log_count: 0,
    average_rating: null,
    created_by: CREATOR_ID,
  } as WorkWithDetails
}

function mountPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/livro/:slug()', name: 'livro-slug', component: BookPage }],
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(BookPage) }) })
  app.component('NuxtLink', { props: ['to'], setup: (_p: Record<string, unknown>, { slots }: SetupContext) => () => h('a', slots.default?.()) })
  app.use(router)
  app.mount(container)
  unmountCurrent = () => {
    app.unmount()
    container.remove()
  }
  return container
}

function button(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)
}

function flash(): { text: string } | null {
  return (mocks.store.get('flash:message') as Ref<{ text: string } | null> | undefined)?.value ?? null
}

describe('BookPage editions line', () => {
  it('names the edition language in full, like the header', async () => {
    mockWorkData.value = {
      ...buildWork(),
      editions: [{ id: 'e1', publisher: 'Rocco', published_year: 2001, page_count: 300, isbn13: null, language: 'pt' }],
    } as WorkWithDetails
    const container = mountPage()
    await flushAsync()

    const details = container.querySelector('.edition-details')?.textContent ?? ''
    expect(details).toContain('Português')
    expect(details).not.toContain('PT')
  })
})

describe('BookPage delete with undo', () => {
  it('counts down with Desfazer and only sends DELETE when the timer ends', async () => {
    mockWorkData.value = buildWork()
    const container = mountPage()
    await flushAsync()

    const confirmSpy = vi.fn(() => true)
    window.confirm = confirmSpy
    button(container, 'Excluir livro do catálogo')!.click()
    await flushAsync()

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(container.querySelector('.work-creator-actions [role="status"]')?.textContent)
      .toBe('Este livro será removido do catálogo em 6 segundos. Desfazer.')
    expect(document.activeElement?.textContent?.trim()).toBe('Desfazer')

    mocks.fetchMock.mockResolvedValue(null)
    vi.advanceTimersByTime(5000)
    await flushAsync()
    expect(mocks.fetchMock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
    await flushAsync()
    expect(mocks.fetchMock).toHaveBeenCalledWith(
      '/api/works/11111111-1111-1111-1111-111111111111',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(mocks.navigateMock).toHaveBeenCalledWith('/')
    expect(flash()?.text).toBe('Livro removido do catálogo.')
  })

  it('Desfazer cancels without any request', async () => {
    mockWorkData.value = buildWork()
    const container = mountPage()
    await flushAsync()

    button(container, 'Excluir livro do catálogo')!.click()
    await flushAsync()
    button(container, 'Desfazer')!.click()
    vi.advanceTimersByTime(10_000)
    await flushAsync()

    expect(mocks.fetchMock).not.toHaveBeenCalled()
    expect(button(container, 'Excluir livro do catálogo')).toBeDefined()
  })

  it('shows the error with Tentar de novo when the DELETE fails', async () => {
    mockWorkData.value = buildWork()
    const container = mountPage()
    await flushAsync()

    mocks.fetchMock.mockRejectedValue({ data: { message: 'Falhou.' } })
    button(container, 'Excluir livro do catálogo')!.click()
    vi.advanceTimersByTime(6000)
    await flushAsync()

    expect(container.textContent).toContain('Falhou.')
    expect(button(container, 'Tentar de novo')).toBeDefined()
    expect(mocks.navigateMock).not.toHaveBeenCalled()
  })

  it('leaving the page during the countdown commits the delete', async () => {
    mockWorkData.value = buildWork()
    const container = mountPage()
    await flushAsync()

    mocks.fetchMock.mockResolvedValue(null)
    button(container, 'Excluir livro do catálogo')!.click()
    await flushAsync()
    unmountCurrent?.()
    unmountCurrent = null
    await flushAsync()

    expect(mocks.fetchMock).toHaveBeenCalledTimes(1)
    expect(flash()?.text).toBe('Livro removido do catálogo.')
  })
})
