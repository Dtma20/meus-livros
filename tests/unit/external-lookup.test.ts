// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import ExternalLookup from '../../app/components/search/ExternalLookup.vue'
import AddBookForm from '../../app/components/search/AddBookForm.vue'
import type { ExternalBookResult } from '../../shared/schemas/search'

vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.useId = () => 'test-external-lookup-id'
  globalScope.navigateTo = vi.fn()
})

async function mountExternalLookup(props: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  let emittedBook: ExternalBookResult | null = null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = createApp(ExternalLookup as any, {
    ...props,
    onSelect: (book: ExternalBookResult) => {
      emittedBook = book
    },
  })
  app.mount(host)
  await nextTick()

  return {
    host,
    input: () => host.querySelector<HTMLInputElement>('.lookup-input'),
    button: () => host.querySelector<HTMLButtonElement>('.btn-lookup'),
    status: () => host.querySelector<HTMLElement>('.lookup-status'),
    emptyMessage: () => host.querySelector<HTMLElement>('.lookup-empty'),
    resultsList: () => host.querySelector<HTMLElement>('.results-list'),
    resultItems: () => host.querySelectorAll<HTMLElement>('.result-item'),
    selectButtons: () => host.querySelectorAll<HTMLButtonElement>('.btn-select-result'),
    getEmittedBook: () => emittedBook,
    text: () => host.textContent ?? '',
    unmount: () => {
      app.unmount()
      host.remove()
    },
  }
}

async function mountAddBookForm(props: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = createApp(AddBookForm as any, { ...props })
  app.mount(host)
  await nextTick()
  await nextTick()

  return {
    host,
    titleInput: () => host.querySelector<HTMLInputElement>('#book-title'),
    authorInput: () => host.querySelector<HTMLInputElement>('#author-input'),
    addAuthorBtn: () => host.querySelector<HTMLButtonElement>('.btn-add-author'),
    submitBtn: () => host.querySelector<HTMLButtonElement>('.btn-submit'),
    lookupBtn: () => host.querySelector<HTMLButtonElement>('.btn-lookup'),
    lookupInput: () => host.querySelector<HTMLInputElement>('.lookup-input'),
    changesPrompt: () => host.querySelector<HTMLElement>('.external-changes-prompt'),
    replaceBtn: () =>
      host.querySelector<HTMLButtonElement>('.external-changes-prompt .btn-primary'),
    keepBtn: () =>
      host.querySelector<HTMLButtonElement>('.external-changes-prompt .btn-secondary'),
    selectResultBtn: () =>
      host.querySelector<HTMLButtonElement>('.btn-select-result'),
    text: () => host.textContent ?? '',
    unmount: () => {
      app.unmount()
      host.remove()
    },
  }
}

describe('ExternalLookup component', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    mockFetch = vi.fn()
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.$fetch = mockFetch
  })

  afterEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('renders button labelled "Buscar dados online" and does not search automatically', async () => {
    const component = await mountExternalLookup({ query: 'Dom Casmurro' })

    expect(component.button()?.textContent).toContain('Buscar dados online')
    expect(mockFetch).not.toHaveBeenCalled()
    component.unmount()
  })

  it('shows loading state "Consultando o Open Library…" during lookup', async () => {
    let resolvePromise: (value: unknown) => void = () => {}
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve
        }),
    )

    const component = await mountExternalLookup({ query: 'Dom Casmurro' })

    // Click button to trigger search
    component.button()?.click()
    await nextTick()

    expect(component.button()?.disabled).toBe(true)
    expect(component.button()?.textContent).toContain('Consultando o Open Library…')
    expect(component.status()?.textContent).toContain('Consultando o Open Library…')

    // Finish fetch
    resolvePromise({ results: [] })
    await nextTick()
    await nextTick()

    component.unmount()
  })

  it('shows graceful fallback when service is unavailable', async () => {
    mockFetch.mockResolvedValueOnce({ results: [], indisponivel: true })

    const component = await mountExternalLookup({ query: 'Livro Raro' })
    component.button()?.click()
    await nextTick()
    await nextTick()

    expect(component.emptyMessage()?.textContent).toContain(
      'Não conseguimos buscar online agora. Você pode preencher à mão.',
    )
    component.unmount()
  })

  it('shows clear message when zero results are found', async () => {
    mockFetch.mockResolvedValueOnce({ results: [] })

    const component = await mountExternalLookup({ query: 'Histórias da meia-noite' })
    component.button()?.click()
    await nextTick()
    await nextTick()

    expect(component.emptyMessage()?.textContent).toContain(
      'Nenhum resultado encontrado no Open Library. Você pode preencher os dados à mão.',
    )
    component.unmount()
  })

  it('displays results with cover, title, author, and year, and emits select when chosen', async () => {
    const sampleResult: ExternalBookResult = {
      ol_work_key: 'OL45883W',
      title: 'Dom Casmurro',
      authors: ['Machado de Assis'],
      first_publish_year: 1899,
      cover_url: 'https://covers.openlibrary.org/b/id/8225261-M.jpg',
      ol_cover_id: 8225261,
      language: 'pt',
      page_count: 256,
    }

    mockFetch.mockResolvedValueOnce({ results: [sampleResult] })

    const component = await mountExternalLookup({ query: 'Dom Casmurro' })
    component.button()?.click()
    await nextTick()
    await nextTick()

    expect(component.resultItems()).toHaveLength(1)
    expect(component.text()).toContain('Dom Casmurro')
    expect(component.text()).toContain('Machado de Assis')
    expect(component.text()).toContain('1899')

    // Click select button
    component.selectButtons()[0]?.click()
    await nextTick()

    expect(component.getEmittedBook()).toEqual(sampleResult)
    component.unmount()
  })
})

describe('AddBookForm with ExternalLookup integration', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    mockFetch = vi.fn()
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.$fetch = mockFetch
  })

  afterEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('pre-fills empty form fields when selecting Open Library result without silent overwrite', async () => {
    const sampleResult: ExternalBookResult = {
      ol_work_key: 'OL45883W',
      title: 'Dom Casmurro',
      authors: ['Machado de Assis'],
      first_publish_year: 1899,
      cover_url: 'https://covers.openlibrary.org/b/id/8225261-M.jpg',
      ol_cover_id: 8225261,
      language: 'pt',
      page_count: 256,
    }

    mockFetch.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/search/externo')) {
        return { results: [sampleResult] }
      }
      if (url === '/api/works') {
        return { id: 'work-new-1', slug: 'dom-casmurro' }
      }
      return {}
    })

    const form = await mountAddBookForm()

    // Type in lookup input and search
    form.lookupInput()!.value = 'Dom Casmurro'
    form.lookupInput()!.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    form.lookupBtn()!.click()
    await nextTick()
    await nextTick()

    // Select the book
    form.selectResultBtn()!.click()
    await nextTick()
    await nextTick()

    // Form fields are now filled
    expect(form.titleInput()?.value).toBe('Dom Casmurro')
    expect(form.text()).toContain('Machado de Assis')
    // Changes prompt should NOT appear because there were no conflicts with already typed data
    expect(form.changesPrompt()).toBeNull()

    // Submit form to verify payload includes ol_work_key and ol_cover_id
    form.submitBtn()!.click()
    await nextTick()
    await nextTick()

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/works',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          title: 'Dom Casmurro',
          ol_work_key: 'OL45883W',
          first_published_year: 1899,
          original_language: 'pt',
          genre_ids: [], // GENRES ARE NEVER IMPORTED
          edition: expect.objectContaining({
            cover_url: 'https://covers.openlibrary.org/b/id/8225261-M.jpg',
            ol_cover_id: 8225261,
          }),
        }),
      }),
    )

    form.unmount()
  })

  it('does NOT silently overwrite already-typed values and displays changes prompt', async () => {
    const sampleResult: ExternalBookResult = {
      ol_work_key: 'OL45883W',
      title: 'Dom Casmurro (Edição Crítica)',
      authors: ['Joaquim Maria Machado de Assis'],
      first_publish_year: 1899,
      cover_url: 'https://covers.openlibrary.org/b/id/8225261-M.jpg',
      ol_cover_id: 8225261,
      language: 'pt',
      page_count: 256,
    }

    mockFetch.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/search/externo')) {
        return { results: [sampleResult] }
      }
      return {}
    })

    const form = await mountAddBookForm()

    // 1. Manually type title and author
    form.titleInput()!.value = 'Meu Titulo Digitado'
    form.titleInput()!.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    form.authorInput()!.value = 'Autor Digitado'
    form.authorInput()!.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    form.addAuthorBtn()!.click()
    await nextTick()

    // 2. Perform external search
    form.lookupInput()!.value = 'Dom Casmurro'
    form.lookupInput()!.dispatchEvent(new Event('input', { bubbles: true }))
    form.lookupBtn()!.click()
    await nextTick()
    await nextTick()

    // 3. Select result
    form.selectResultBtn()!.click()
    await nextTick()
    await nextTick()

    // 4. Verification: already-typed values are NOT silently overwritten!
    expect(form.titleInput()?.value).toBe('Meu Titulo Digitado')
    expect(form.text()).toContain('Autor Digitado')

    // 5. Conflict prompt IS displayed showing what will change
    expect(form.changesPrompt()).not.toBeNull()
    expect(form.changesPrompt()?.textContent).toContain('Meu Titulo Digitado')
    expect(form.changesPrompt()?.textContent).toContain('Dom Casmurro (Edição Crítica)')

    // 6. User chooses "Substituir com dados online"
    form.replaceBtn()!.click()
    await nextTick()

    expect(form.titleInput()?.value).toBe('Dom Casmurro (Edição Crítica)')
    expect(form.text()).toContain('Joaquim Maria Machado de Assis')
    expect(form.changesPrompt()).toBeNull()

    form.unmount()
  })
})
