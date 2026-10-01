import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Component, createApp, createSSRApp, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { LogWithDetails } from '../../shared/schemas/log'
import type { SearchResult } from '../../shared/schemas/search'

vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.useId = () => 'test-log-form-id'
  globalScope.navigateTo = () => {}
  globalScope.__draftTestUserId = 'user-1'
  globalScope.useState = (key: string, init?: () => unknown) => key === 'auth:session'
    ? (globalScope.__draftTestSession as { value: unknown } | undefined)
      ?? { value: { user: { id: globalScope.__draftTestUserId } } }
    : { value: init ? init() : null }
})

const draftAuthSession = ref<{ user: { id: string } | null }>({ user: { id: 'user-1' } })
const globalScope = globalThis as unknown as Record<string, unknown>
globalScope.__draftTestSession = draftAuthSession

function setDraftTestUserId(id: string): void {
  draftAuthSession.value = { user: id ? { id } : null }
}

const DRAFT_KEY = 'meus-livros:form-draft:v1:log:user-1:create:11111111-1111-4111-8111-111111111111'

const WORK: SearchResult = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'a-obra',
  title: 'A Obra',
  authors: [{ name: 'Autora', slug: 'autora' }],
  first_published_year: 1999,
  cover_url: null,
  log_count: 0,
}

let LogForm: Component | undefined

async function mountForm(props: Record<string, unknown> = {}) {
  if (!LogForm) {
    LogForm = (await import('../../app/components/log/LogForm.vue')).default as Component
  }
  const host = document.createElement('div')
  document.body.appendChild(host)

  const app = createApp(LogForm, { mode: 'create', initialWork: WORK, ...props })
  app.mount(host)
  await nextTick()
  await nextTick()
  return {
    host,
    text: () => host.textContent ?? '',
    textarea: () => host.querySelector('textarea'),
    unmount: () => {
      app.unmount()
      host.remove()
    },
  }
}

async function renderServerForm(props: Record<string, unknown> = {}): Promise<string> {
  if (!LogForm) {
    LogForm = (await import('../../app/components/log/LogForm.vue')).default as Component
  }
  const app = createSSRApp(LogForm, { mode: 'create', initialWork: WORK, ...props })
  app.component('NuxtLink', {
    props: ['to'],
    template: '<a :href="to"><slot /></a>',
  })
  return renderToString(app)
}

async function typeReview(
  form: { textarea: () => HTMLTextAreaElement | null },
  text: string,
) {
  const el = form.textarea()
  if (!el) throw new Error('A textarea da resenha não foi encontrada.')
  el.value = text
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  await nextTick()
  return el
}

describe('LogForm - draft persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    setDraftTestUserId('user-1')
    globalScope.__draftTestUserId = 'user-1'
    globalScope.$fetch = vi.fn(async () => ({ id: 'log-1' }))
  })

  afterEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('writes the typed review to localStorage', async () => {
    vi.useFakeTimers()
    const form = await mountForm()
    const typed = 'Uma resenha que levou tempo para escrever.'
    await typeReview(form, typed)
    await vi.advanceTimersByTimeAsync(250)

    const raw = localStorage.getItem(DRAFT_KEY)
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).review).toBe(typed)
    form.unmount()
  })

  it('restores the draft after a reload', async () => {
    const first = await mountForm()
    await typeReview(first, 'Metade de um parágrafo, interrompido.')
    const finishedOn = first.host.querySelector<HTMLInputElement>('#log-finished-on')!
    finishedOn.value = '2020-02-03'
    finishedOn.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    first.unmount()

    const second = await mountForm()
    expect(second.textarea()?.value).toBe('Metade de um parágrafo, interrompido.')
    expect(second.host.querySelector<HTMLInputElement>('#log-finished-on')?.value).toBe('2020-02-03')
    second.unmount()
  })

  it('keeps the typed review in the textarea when saving fails', async () => {
    vi.useFakeTimers()
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.$fetch = vi.fn(async () => {
      throw new Error('network down')
    })

    const form = await mountForm()
    const typed = 'Novecentos caracteres de opinião sobre um livro.'
    await typeReview(form, typed)
    await vi.advanceTimersByTimeAsync(250)

    const submit = form.host.querySelector('form')
    submit?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()
    await nextTick()
    await nextTick()

    expect(globalScope.$fetch).toHaveBeenCalledTimes(1)

    expect(form.textarea()?.value).toBe(typed)
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).review).toBe(typed)
    form.unmount()
  })

  it('clears the draft only after the save is confirmed', async () => {
    vi.useFakeTimers()
    const form = await mountForm()
    await typeReview(form, 'Resenha que vai ser salva.')
    await vi.advanceTimersByTimeAsync(250)
    expect(localStorage.getItem(DRAFT_KEY)).toBeTruthy()

    const submit = form.host.querySelector('form')
    submit?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()
    await nextTick()
    await nextTick()

    const globalScope = globalThis as unknown as Record<string, unknown>
    expect(globalScope.$fetch).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    form.unmount()
  })

  it('still works when localStorage throws', async () => {

    const throwing = () => {
      throw new Error('storage disabled')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(throwing)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(throwing)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(throwing)

    const form = await mountForm()
    const el = await typeReview(form, 'Digitado sem armazenamento disponível.')

    expect(el.value).toBe('Digitado sem armazenamento disponível.')
    expect(form.text()).toContain('A Obra')
    form.unmount()
  })

  it('debounces draft writes and flushes the latest text when the form unmounts', async () => {
    vi.useFakeTimers()
    const form = await mountForm()
    const typed = 'Uma resenha que deve sobreviver à navegação imediata.'
    await typeReview(form, typed)

    const storedValues = (): unknown[] => Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index)
      const raw = key ? localStorage.getItem(key) : null
      if (!raw) return null
      try {
        return JSON.parse(raw) as unknown
      } catch {
        return null
      }
    })
    const beforeUnmount = storedValues().filter((value): value is { review?: unknown } => (
      typeof value === 'object' && value !== null && 'review' in value
    ))
    expect(beforeUnmount.some((draft) => draft.review === typed)).toBe(false)

    form.unmount()
    const afterUnmount = storedValues().filter((value): value is { review?: unknown } => (
      typeof value === 'object' && value !== null && 'review' in value
    ))
    expect(afterUnmount.some((draft) => draft.review === typed)).toBe(true)
  })

  it('does not store a draft when the auth session has no application user id', async () => {
    const globalScope = globalThis as unknown as Record<string, unknown>
    setDraftTestUserId('')
    globalScope.__draftTestUserId = ''
    const form = await mountForm()
    await typeReview(form, 'Este texto precisa de uma identidade de usuário.')
    form.unmount()
    expect(localStorage.length).toBe(0)
  })

  it('cancels pending writes when the authenticated user changes while mounted', async () => {
    vi.useFakeTimers()
    const form = await mountForm()
    await typeReview(form, 'Texto da conta anterior.')
    setDraftTestUserId('user-2')
    globalScope.__draftTestUserId = 'user-2'
    await typeReview(form, 'Texto digitado depois da troca de conta.')
    await vi.advanceTimersByTimeAsync(250)
    expect(form.textarea()?.value).toBe('Texto digitado depois da troca de conta.')
    form.unmount()
    expect(localStorage.length).toBe(0)
  })

  it('restores the reading status and unfinished edition fields only for the same user and work', async () => {
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.$fetch = vi.fn(async (url: string) => url.includes('/editions')
      ? { editions: [] }
      : { id: 'log-1' })
    const form = await mountForm()
    const status = form.host.querySelector<HTMLInputElement>('.status-checkbox')!
    status.checked = true
    status.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()

    const editionToggle = Array.from(form.host.querySelectorAll<HTMLButtonElement>('.toggle-link-btn'))
      .find((button) => button.textContent?.includes('Li outra edição'))
    editionToggle!.click()
    await nextTick()
    const createEdition = Array.from(form.host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Cadastrar nova edição'))
    expect(createEdition).toBeTruthy()
    createEdition!.click()
    await nextTick()
    const isbn = form.host.querySelector<HTMLInputElement>('#log-new-edition-isbn')!
    isbn.value = '9788535902778'
    isbn.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    form.unmount()

    setDraftTestUserId('user-1')
    globalScope.__draftTestUserId = 'user-1'
    const restored = await mountForm()
    expect(restored.host.querySelector<HTMLInputElement>('.status-checkbox')?.checked).toBe(true)
    expect(restored.host.querySelector<HTMLInputElement>('#log-new-edition-isbn')?.value).toBe('9788535902778')
    restored.unmount()

    const otherWork = { ...WORK, id: '55555555-5555-4555-8555-555555555555' }
    const differentContext = await mountForm({ initialWork: otherWork })
    expect(differentContext.host.querySelector<HTMLInputElement>('.status-checkbox')?.checked).toBe(false)
    differentContext.unmount()

    setDraftTestUserId('user-2')
    globalScope.__draftTestUserId = 'user-2'
    const differentUser = await mountForm()
    expect(differentUser.host.querySelector<HTMLInputElement>('.status-checkbox')?.checked).toBe(false)
    differentUser.unmount()
  })
})

function browserToday(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function editLog(finishedOn: string | null): LogWithDetails {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: '33333333-3333-4333-8333-333333333333',
    work_id: '11111111-1111-4111-8111-111111111111',
    edition_id: null,
    rating: 4,
    review: null,
    started_on: null,
    finished_on: finishedOn,
    finished_precision: 'dia',
    format: null,
    visibility: 'publico',
    created_at: new Date('2024-01-02T12:00:00Z'),
    updated_at: new Date('2024-01-02T12:00:00Z'),
    user: {
      id: '33333333-3333-4333-8333-333333333333',
      handle: 'leitora',
      display_name: 'Leitora',
      profile_visibility: 'publico',
    },
    work: {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'A Obra',
      slug: 'a-obra',
      first_published_year: 1999,
      cover_url: null,
      authors: [{ id: '44444444-4444-4444-8444-444444444444', name: 'Autora', slug: 'autora' }],
    },
    edition: null,
  }
}

describe('LogForm - finished date hint', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    setDraftTestUserId('user-1')
    globalScope.__draftTestUserId = 'user-1'
    globalScope.$fetch = vi.fn(async () => ({ id: 'log-1' }))
  })

  afterEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  function dateInput(host: HTMLElement): HTMLInputElement {
    const el = host.querySelector<HTMLInputElement>('#log-finished-on')
    if (!el) throw new Error('O campo de data de término não foi encontrado.')
    return el
  }

  it('shows the hint while the create form still holds the date it filled in', async () => {
    const form = await mountForm()
    const input = dateInput(form.host)

    expect(input.value).toBe(browserToday())
    expect(form.host.querySelector('#log-finished-hint')).not.toBeNull()
    expect(input.getAttribute('aria-describedby')).toBe('log-finished-hint')
    form.unmount()
  })

  it('starts with matching empty SSR date markup and fills the browser-local date after mount', async () => {
    const html = await renderServerForm()
    expect(html).toContain('id="log-finished-on"')
    expect(html).not.toContain('log-finished-hint')
    const serverDom = new DOMParser().parseFromString(html, 'text/html')
    expect(serverDom.querySelector<HTMLInputElement>('#log-finished-on')?.value).toBe('')

    const form = await mountForm()
    expect(dateInput(form.host).value).toBe(browserToday())
    expect(form.host.querySelector('#log-finished-hint')).not.toBeNull()
    form.unmount()
  })

  it('drops the hint and aria-describedby once the date is changed', async () => {
    const form = await mountForm()
    const input = dateInput(form.host)

    input.value = '2024-01-01'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    await nextTick()

    expect(form.host.querySelector('#log-finished-hint')).toBeNull()
    expect(input.hasAttribute('aria-describedby')).toBe(false)
    form.unmount()
  })

  it('never renders the hint in edit mode with a stored date', async () => {
    const form = await mountForm({ mode: 'edit', initialLog: editLog('2024-01-01'), initialWork: null })
    const input = dateInput(form.host)

    expect(input.value).toBe('2024-01-01')
    expect(form.host.querySelector('#log-finished-hint')).toBeNull()
    expect(input.hasAttribute('aria-describedby')).toBe(false)
    form.unmount()
  })

  it('never renders the hint in edit mode even when the stored date is today', async () => {
    const today = browserToday()
    const form = await mountForm({ mode: 'edit', initialLog: editLog(today), initialWork: null })
    const input = dateInput(form.host)

    expect(input.value).toBe(today)
    expect(form.host.querySelector('#log-finished-hint')).toBeNull()
    expect(input.hasAttribute('aria-describedby')).toBe(false)
    form.unmount()
  })

  it('focuses the native rating range when edit mode starts', async () => {
    const focus = vi.spyOn(HTMLInputElement.prototype, 'focus')
    const form = await mountForm({
      mode: 'edit',
      finishing: true,
      initialLog: editLog(null),
      initialWork: null,
    })
    const rating = form.host.querySelector<HTMLInputElement>('#log-rating-group input[type="range"]')

    expect(rating).toBeTruthy()
    expect(focus).toHaveBeenCalled()
    expect(document.activeElement).toBe(rating)
    form.unmount()
  })
})

describe('LogForm - edit mode leave guard', () => {
  beforeEach(() => {
    localStorage.clear()
    setDraftTestUserId('user-1')
    globalScope.__draftTestUserId = 'user-1'
    globalScope.$fetch = vi.fn(async () => ({ id: 'log-1' }))
  })

  afterEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  function fireBeforeUnload(): Event {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event
  }

  it('labels the format button "E-book"', async () => {
    const form = await mountForm({ mode: 'edit', initialLog: editLog('2024-01-01'), initialWork: null })
    const labels = Array.from(form.host.querySelectorAll('.format-btn')).map((b) => b.textContent?.trim())
    expect(labels).toContain('E-book')
    expect(labels).not.toContain('Ebook')
    form.unmount()
  })

  it('does not warn on tab close while nothing changed', async () => {
    const form = await mountForm({ mode: 'edit', initialLog: editLog('2024-01-01'), initialWork: null })
    expect(fireBeforeUnload().defaultPrevented).toBe(false)
    form.unmount()
  })

  it('warns on tab close after the review changes', async () => {
    const form = await mountForm({ mode: 'edit', initialLog: editLog('2024-01-01'), initialWork: null })
    await typeReview(form, 'Mudei de ideia.')
    expect(fireBeforeUnload().defaultPrevented).toBe(true)
    form.unmount()
  })

  it('stops warning after a successful save', async () => {
    const form = await mountForm({ mode: 'edit', initialLog: editLog('2024-01-01'), initialWork: null })
    await typeReview(form, 'Mudei de ideia.')
    form.host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()
    await nextTick()
    await nextTick()
    expect(fireBeforeUnload().defaultPrevented).toBe(false)
    form.unmount()
  })

  it('offers a Cancelar link back to the entry in edit mode only', async () => {
    const edit = await mountForm({ mode: 'edit', initialLog: editLog('2024-01-01'), initialWork: null })
    expect(edit.text()).toContain('Cancelar')
    edit.unmount()
    const create = await mountForm()
    expect(create.host.querySelector('.cancel-link')).toBeNull()
    create.unmount()
  })

  it('sends null for cleared nullable fields in an edit PATCH', async () => {
    const sourceLog = editLog('2024-01-01')
    sourceLog.rating = 4
    sourceLog.review = 'Resenha antiga'
    sourceLog.started_on = '2023-01-01'
    const editionId = '66666666-6666-4666-8666-666666666666'
    sourceLog.edition_id = editionId
    sourceLog.edition = {
      id: editionId,
      isbn13: null,
      publisher: 'Editora antiga',
      cover_url: null,
      ol_cover_id: null,
      page_count: null,
      published_year: null,
    }
    sourceLog.format = 'ebook'
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.$fetch = vi.fn(async (url: string) => url.includes('/editions')
      ? { editions: [sourceLog.edition] }
      : {})

    const form = await mountForm({ mode: 'edit', initialLog: sourceLog, initialWork: null })
    const clearRating = form.host.querySelector<HTMLButtonElement>('.clear-rating-btn')!
    clearRating.click()

    const review = form.textarea()!
    review.value = ''
    review.dispatchEvent(new Event('input', { bubbles: true }))

    const startedOn = form.host.querySelector<HTMLInputElement>('#log-started-on')!
    expect(startedOn).toBeTruthy()
    startedOn.value = ''
    startedOn.dispatchEvent(new Event('input', { bubbles: true }))

    const editionToggle = Array.from(form.host.querySelectorAll<HTMLButtonElement>('.toggle-link-btn'))
      .find((button) => button.textContent?.includes('Li outra edição'))
    expect(editionToggle).toBeTruthy()
    editionToggle!.click()
    await Promise.resolve()
    await nextTick()
    await nextTick()
    const defaultEdition = form.host.querySelector<HTMLInputElement>('input[name="edition"]')
    expect(defaultEdition).toBeTruthy()
    defaultEdition!.click()

    const ebook = Array.from(form.host.querySelectorAll<HTMLButtonElement>('.format-btn'))
      .find((button) => button.textContent?.includes('E-book'))
    ebook!.click()

    form.host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()
    await nextTick()
    await nextTick()

    const fetchMock = globalScope.$fetch as ReturnType<typeof vi.fn>
    const patch = fetchMock.mock.calls.find((call) => call[1]?.method === 'PATCH')
    expect(patch?.[1]?.body).toMatchObject({
      edition_id: null,
      rating: null,
      review: null,
      started_on: null,
      format: null,
    })
    form.unmount()
  })

  it('holds the submit guard until save navigation settles', async () => {
    let finishNavigation: (() => void) | null = null
    const globalScope = globalThis as unknown as Record<string, unknown>
    const fetchMock = vi.fn(async () => ({ id: 'saved-log' }))
    globalScope.$fetch = fetchMock
    globalScope.navigateTo = vi.fn(() => new Promise<void>((resolve) => {
      finishNavigation = resolve
    }))

    const form = await mountForm()
    const submit = form.host.querySelector<HTMLFormElement>('form')!
    submit.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()
    await nextTick()
    submit.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(form.host.querySelector<HTMLButtonElement>('.submit-btn')?.disabled).toBe(true)
    expect(finishNavigation).toBeTruthy()
    finishNavigation!()
    await nextTick()
    form.unmount()
  })

  it('does not submit the reading while a new edition is being saved', async () => {
    let finishEditionSave: ((value: { id: string }) => void) | null = null
    const globalScope = globalThis as unknown as Record<string, unknown>
    const fetchMock = vi.fn((url: string, options?: { method?: string }) => {
      if (url.includes('/editions') && options?.method === 'POST') {
        return new Promise<{ id: string }>((resolve) => {
          finishEditionSave = resolve
        })
      }
      if (url.includes('/editions')) return Promise.resolve({ editions: [] })
      return Promise.resolve({ id: 'log-after-edition' })
    })
    globalScope.$fetch = fetchMock

    const form = await mountForm()
    const pickerToggle = Array.from(form.host.querySelectorAll<HTMLButtonElement>('.toggle-link-btn'))
      .find((button) => button.textContent?.includes('Li outra edição'))
    pickerToggle!.click()
    await nextTick()
    const newEditionToggle = Array.from(form.host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Cadastrar nova edição'))
    newEditionToggle!.click()
    await nextTick()

    const isbn = form.host.querySelector<HTMLInputElement>('#log-new-edition-isbn')!
    isbn.value = '9788535902778'
    isbn.dispatchEvent(new Event('input', { bubbles: true }))
    form.host.querySelector<HTMLButtonElement>('.edition-create-btn')!.click()
    await nextTick()
    form.host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()

    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/logs')).toBe(false)
    finishEditionSave!({ id: 'edition-saved' })
    await nextTick()
    await nextTick()
    form.unmount()
  })

  it('associates every new-edition field error with its input', async () => {
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.$fetch = vi.fn(async (url: string) => url.includes('/editions')
      ? { editions: [] }
      : {})
    const form = await mountForm()
    const editionToggle = Array.from(form.host.querySelectorAll<HTMLButtonElement>('.toggle-link-btn'))
      .find((button) => button.textContent?.includes('Li outra edição'))
    editionToggle!.click()
    await nextTick()
    const newEditionToggle = Array.from(form.host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Cadastrar nova edição'))
    newEditionToggle!.click()
    await nextTick()

    const values: Array<[string, string]> = [
      ['#log-new-edition-isbn', 'x'.repeat(41)],
      ['#log-new-edition-publisher', 'x'.repeat(201)],
      ['#log-new-edition-pages', '0'],
      ['#log-new-edition-year', '3000'],
    ]
    for (const [selector, value] of values) {
      const input = form.host.querySelector<HTMLInputElement>(selector)!
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    form.host.querySelector<HTMLButtonElement>('.edition-create-btn')!.click()
    await nextTick()

    for (const [selector] of values) {
      const input = form.host.querySelector<HTMLInputElement>(selector)!
      const descriptions = input.getAttribute('aria-describedby')?.split(/\s+/) ?? []
      expect(descriptions.some((id) => form.host.querySelector(`#${id}`)?.classList.contains('field-error'))).toBe(true)
    }
    form.unmount()
  })
})
