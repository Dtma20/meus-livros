import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Component, createApp, nextTick } from 'vue'
import type { LogWithDetails } from '../../shared/schemas/log'
import type { SearchResult } from '../../shared/schemas/search'

vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.useId = () => 'test-log-form-id'
  globalScope.navigateTo = () => {}
  globalScope.useState = (_key: string, init?: () => unknown) => ({ value: init ? init() : null })
})

const DRAFT_KEY = 'meus-livros:log-draft'

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
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.$fetch = vi.fn(async () => ({ id: 'log-1' }))
  })

  afterEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('writes the typed review to localStorage', async () => {
    const form = await mountForm()
    await typeReview(form, 'Uma resenha que levou tempo para escrever.')

    const raw = localStorage.getItem(DRAFT_KEY)
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).review).toBe('Uma resenha que levou tempo para escrever.')
    form.unmount()
  })

  it('restores the draft after a reload', async () => {
    const first = await mountForm()
    await typeReview(first, 'Metade de um parágrafo, interrompido.')
    first.unmount()

    const second = await mountForm()
    expect(second.textarea()?.value).toBe('Metade de um parágrafo, interrompido.')
    second.unmount()
  })

  it('keeps the typed review in the textarea when saving fails', async () => {
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.$fetch = vi.fn(async () => {
      throw new Error('network down')
    })

    const form = await mountForm()
    const typed = 'Novecentos caracteres de opinião sobre um livro.'
    await typeReview(form, typed)

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
    const form = await mountForm()
    await typeReview(form, 'Resenha que vai ser salva.')
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
})

function browserToday(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function editLog(finishedOn: string): LogWithDetails {
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
    const globalScope = globalThis as unknown as Record<string, unknown>
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
})

describe('LogForm - edit mode leave guard', () => {
  beforeEach(() => {
    localStorage.clear()
    const globalScope = globalThis as unknown as Record<string, unknown>
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
})
