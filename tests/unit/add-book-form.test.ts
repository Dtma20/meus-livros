// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Component, createApp, nextTick, ref } from 'vue'
import { createFormDraftKey } from '../../app/composables/useFormDraft'

const DRAFT_KEY = createFormDraftKey('add-book', 'user-1', 'create', '/app/novo|')!

let navigatedTo: string | null = null

vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.useId = () => 'test-add-book-id'
  globalScope.__draftTestUserId = 'user-1'
  globalScope.navigateTo = (dest: string) => {
    navigatedTo = dest
  }
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

let AddBookForm: Component | undefined
const activeWrappers: Array<{ unmount: () => void }> = []

async function mountForm(props: Record<string, unknown> = {}) {
  if (!AddBookForm) {
    AddBookForm = (await import('../../app/components/search/AddBookForm.vue')).default as Component
  }
  const host = document.createElement('div')
  document.body.appendChild(host)

  const app = createApp(AddBookForm, { ...props })
  app.mount(host)
  await nextTick()
  await nextTick()

  const wrapper = {
    host,
    titleInput: () => host.querySelector<HTMLInputElement>('#book-title'),
    authorInput: () => host.querySelector<HTMLInputElement>('#author-input'),
    addAuthorBtn: () => host.querySelector<HTMLButtonElement>('.btn-add-author'),
    submitBtn: () => host.querySelector<HTMLButtonElement>('.btn-submit'),
    form: () => host.querySelector<HTMLFormElement>('form'),
    text: () => host.textContent ?? '',
    unmount: () => {
      app.unmount()
      host.remove()
    },
  }
  activeWrappers.push(wrapper)
  return wrapper
}

describe('AddBookForm component', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    navigatedTo = null
    vi.restoreAllMocks()
    globalScope.navigateTo = (dest: string) => {
      navigatedTo = dest
    }
    setDraftTestUserId('user-1')
    globalScope.__draftTestUserId = 'user-1'

    mockFetch = vi.fn(async () => ({ id: 'work-new-1', slug: 'obra-nova' }))
    globalScope.$fetch = mockFetch
  })

  afterEach(() => {
    while (activeWrappers.length > 0) {
      try {
        activeWrappers.pop()?.unmount()
      } catch {}
    }
    localStorage.clear()
    document.body.innerHTML = ''
    vi.useRealTimers()
    globalScope.navigateTo = (dest: string) => {
      navigatedTo = dest
    }
  })

  async function inputIsbn(form: Awaited<ReturnType<typeof mountForm>>, value = '978-85-359-0277-8') {
    const input = form.host.querySelector<HTMLInputElement>('#edition-isbn')!
    expect(input).toBeTruthy()
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    return input
  }

  const lookupData = { title: 'Livro importado', authors: ['Autora', 'autora'], publisher: 'Editora', page_count: 256, year: 2019, cover_url: 'https://example.com/cover.jpg' }
  const lookupButton = (form: Awaited<ReturnType<typeof mountForm>>) => form.host.querySelector<HTMLButtonElement>('.isbn-lookup-button')!
  async function settleLookup() { await Promise.resolve(); await nextTick(); await nextTick() }

  it('places one optional ISBN first, validates locally and supports Enter without saving', async () => {
    const form = await mountForm()
    expect(form.host.querySelectorAll('#edition-isbn')).toHaveLength(1)
    expect(form.host.querySelector('input')?.id).toBe('edition-isbn')
    expect(lookupButton(form).disabled).toBe(true)
    await inputIsbn(form, '9788535902779')
    lookupButton(form).click()
    await nextTick()
    expect(form.text()).toContain('Informe um ISBN-10 ou ISBN-13 válido.')
    expect(mockFetch).not.toHaveBeenCalled()
    mockFetch.mockResolvedValue({ status: 'found', data: lookupData })
    const input = await inputIsbn(form, '85-325-1166-X')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await settleLookup()
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith('/api/isbn', expect.objectContaining({ query: { isbn: '9788532511669' }, retry: 0 }))
    expect(form.titleInput()?.value).toBe('Livro importado')
    expect(form.host.querySelectorAll('.author-tag')).toHaveLength(1)
    expect(form.host.querySelector<HTMLInputElement>('#edition-year')?.value).toBe('2019')
    expect(form.text()).toContain('Dados encontrados. Confira as informações antes de salvar.')
    form.submitBtn()!.click()
    await settleLookup()
    expect(mockFetch).toHaveBeenLastCalledWith('/api/works', expect.objectContaining({ body: expect.objectContaining({ authors: [{ name: 'Autora', country_code: null, country_label: null }], edition: expect.objectContaining({ isbn: '85-325-1166-X', published_year: 2019 }) }) }))
  })

  it('preserves fields typed then erased during a lookup, including pending author text', async () => {
    let resolve!: (value: unknown) => void
    mockFetch.mockImplementation(() => new Promise(r => { resolve = r }))
    const form = await mountForm()
    await inputIsbn(form)
    lookupButton(form).click()
    await nextTick()
    expect(lookupButton(form).textContent).toContain('Buscando…')
    expect(form.text()).toContain('Preenchendo informações…')
    expect(form.titleInput()?.disabled).toBe(false)
    for (const input of [form.titleInput()!, form.authorInput()!]) {
      input.value = 'Manual'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.value = ''
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    resolve({ status: 'found', data: lookupData })
    await settleLookup()
    expect(form.titleInput()?.value).toBe('')
    expect(form.host.querySelectorAll('.author-tag')).toHaveLength(0)
    expect(form.host.querySelector<HTMLInputElement>('#edition-publisher')?.value).toBe('Editora')
  })

  it.each(['isbn', 'cancel', 'unmount', 'submit'])('ignores late responses after %s', async (action) => {
    let resolve!: (value: unknown) => void
    let signal: AbortSignal | undefined
    mockFetch.mockImplementation((_url, options) => new Promise(r => { resolve = r; signal = options.signal }))
    const form = await mountForm()
    await inputIsbn(form)
    lookupButton(form).click()
    await nextTick()
    if (action === 'isbn') {
      await inputIsbn(form, '853251166X')
      await inputIsbn(form)
    } else if (action === 'cancel') {
      Array.from(form.host.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === 'Cancelar')!.click()
    } else if (action === 'unmount') form.unmount()
    else form.form()!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(signal?.aborted).toBe(true)
    resolve({ status: 'found', data: lookupData })
    await settleLookup()
    expect(form.text()).not.toContain('Dados encontrados.')
    expect(form.text()).not.toContain('Preenchendo informações…')
    if (action !== 'unmount') expect(form.titleInput()?.value).toBe('')
  })

  it('preserves edition fields edited then erased and an author list changed during lookup', async () => {
    let resolve!: (value: unknown) => void
    mockFetch.mockImplementation(() => new Promise(r => { resolve = r }))
    const form = await mountForm()
    form.host.querySelectorAll<HTMLButtonElement>('.disclosure-toggle').forEach(button => button.click())
    await nextTick()
    await inputIsbn(form)
    lookupButton(form).click()
    await nextTick()
    for (const id of ['edition-publisher', 'edition-pages', 'edition-year', 'edition-cover-url']) {
      const input = form.host.querySelector<HTMLInputElement>(`#${id}`)!
      input.value = input.type === 'number' ? '2020' : 'Manual'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.value = ''
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const author = form.authorInput()!
    author.value = 'Autor temporário'
    author.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    form.addAuthorBtn()!.click()
    await nextTick()
    form.host.querySelector<HTMLButtonElement>('.author-tag-remove')!.click()
    resolve({ status: 'found', data: lookupData })
    await settleLookup()
    expect(form.titleInput()?.value).toBe('Livro importado')
    expect(form.host.querySelectorAll('.author-tag')).toHaveLength(0)
    for (const id of ['edition-publisher', 'edition-pages', 'edition-year', 'edition-cover-url']) {
      expect(form.host.querySelector<HTMLInputElement>(`#${id}`)?.value).toBe('')
    }
  })

  it('reports no changes when every destination already contains manual data', async () => {
    mockFetch.mockResolvedValue({ status: 'found', data: lookupData })
    const form = await mountForm({ initialTitle: 'Manual' })
    form.host.querySelectorAll<HTMLButtonElement>('.disclosure-toggle').forEach(button => button.click())
    await nextTick()
    for (const [id, value] of [['edition-publisher', 'Minha editora'], ['edition-pages', '123'], ['edition-year', '2021'], ['edition-cover-url', 'https://example.com/manual.jpg'], ['work-year', '1900']]) {
      const input = form.host.querySelector<HTMLInputElement>(`#${id}`)!
      input.value = value!
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const author = form.authorInput()!
    author.value = 'Meu autor'
    author.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    form.addAuthorBtn()!.click()
    await inputIsbn(form)
    lookupButton(form).click()
    await settleLookup()
    expect(form.text()).toContain('Dados encontrados. Os campos já preenchidos foram mantidos.')
    expect(form.titleInput()?.value).toBe('Manual')
    expect(form.host.querySelector<HTMLInputElement>('#work-year')?.value).toBe('1900')
    expect(form.host.querySelector<HTMLInputElement>('#edition-year')?.value).toBe('2021')
    expect(form.host.querySelector<HTMLInputElement>('#edition-publisher')?.value).toBe('Minha editora')
    expect(form.text()).toContain('Meu autor')
  })

  it('keeps the newest lookup active when an older request resolves first', async () => {
    const pending: Array<(value: unknown) => void> = []
    mockFetch.mockImplementation(() => new Promise(resolve => pending.push(resolve)))
    const form = await mountForm()
    await inputIsbn(form)
    lookupButton(form).click()
    await inputIsbn(form, '853251166X')
    lookupButton(form).click()
    pending[0]!({ status: 'found', data: { title: 'Obsoleto' } })
    await settleLookup()
    expect(form.titleInput()?.value).toBe('')
    expect(lookupButton(form).disabled).toBe(true)
    pending[1]!({ status: 'found', data: { title: 'Atual' } })
    await settleLookup()
    expect(form.titleInput()?.value).toBe('Atual')
  })

  it('persists an imported year zero accepted by the existing year schema', async () => {
    mockFetch.mockResolvedValueOnce({ status: 'found', data: { title: 'Livro', authors: ['Autor'], year: 0 } })
    const form = await mountForm()
    await inputIsbn(form)
    lookupButton(form).click()
    await settleLookup()
    form.submitBtn()!.click()
    await settleLookup()
    expect(mockFetch).toHaveBeenLastCalledWith('/api/works', expect.objectContaining({ body: expect.objectContaining({ edition: expect.objectContaining({ published_year: 0 }) }) }))
  })

  it.each([
    [{ status: 'not_found' }, 'Não encontramos esse ISBN. Você pode preencher os dados manualmente.'],
    [{ status: 'found', data: {} }, 'Dados encontrados. Os campos já preenchidos foram mantidos.'],
  ])('shows recoverable lookup outcomes without losing ISBN', async (response, message) => {
    mockFetch.mockResolvedValue(response)
    const form = await mountForm()
    await inputIsbn(form)
    lookupButton(form).click()
    await settleLookup()
    expect(form.text()).toContain(message)
    expect(form.host.querySelector<HTMLInputElement>('#edition-isbn')?.value).toBe('978-85-359-0277-8')
    expect(lookupButton(form).disabled).toBe(false)
  })

  it('allows retry after operational errors and preserves manual and excluded fields', async () => {
    mockFetch.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({ status: 'found', data: lookupData })
    const form = await mountForm({ initialTitle: 'Título manual' })
    await inputIsbn(form)
    lookupButton(form).click()
    await settleLookup()
    expect(form.text()).toContain('Não foi possível consultar agora.')
    const author = form.authorInput()!
    author.value = 'Autora manual'
    author.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    form.addAuthorBtn()!.click()
    await nextTick()
    lookupButton(form).click()
    await settleLookup()
    expect(form.titleInput()?.value).toBe('Título manual')
    expect(form.text()).toContain('Autora manual')
    expect(form.host.querySelectorAll('.author-tag')).toHaveLength(1)
    form.host.querySelector<HTMLButtonElement>('.disclosure-toggle')!.click()
    await nextTick()
    expect(form.host.querySelector<HTMLInputElement>('#work-year')?.value).toBe('')
    expect(form.host.querySelector<HTMLSelectElement>('#edition-language')?.value).toBe('')
  })

  it('pre-fills title from initialTitle prop (e.g. from search zero-state)', async () => {
    const form = await mountForm({ initialTitle: 'Grande Sertão: Veredas' })
    expect(form.titleInput()?.value).toBe('Grande Sertão: Veredas')
    form.unmount()
  })

  it('submitting only title + author succeeds and redirects to returnTo with work_id', async () => {
    const form = await mountForm()

    const titleEl = form.titleInput()!
    titleEl.value = 'Memórias Póstumas de Brás Cubas'
    titleEl.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    const authorEl = form.authorInput()!
    authorEl.value = 'Machado de Assis'
    authorEl.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    form.addAuthorBtn()!.click()
    await nextTick()
    await nextTick()

    expect(form.text()).toContain('Machado de Assis')

    form.submitBtn()!.click()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/works',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          title: 'Memórias Póstumas de Brás Cubas',
          authors: [{ name: 'Machado de Assis', country_code: null, country_label: null }],
        }),
      }),
    )

    expect(navigatedTo).toBe('/app/novo?work_id=work-new-1')

    form.unmount()
  })

  it('shows duplicate prompt on 409 and allows forcing creation with ?forcar=1', async () => {

    mockFetch.mockRejectedValueOnce({
      status: 409,
      data: {
        error: 'conflito',
        message: 'Já existe uma obra com este título e autor.',
        work: {
          id: 'dup-123',
          slug: 'dom-casmurro-original',
          title: 'Dom Casmurro',
          cover_url: null,
        },
      },
    })
    mockFetch.mockResolvedValueOnce({ id: 'work-forced-2', slug: 'dom-casmurro-2' })

    const form = await mountForm()

    const titleEl = form.titleInput()!
    titleEl.value = 'Dom Casmurro'
    titleEl.dispatchEvent(new Event('input', { bubbles: true }))

    const authorEl = form.authorInput()!
    authorEl.value = 'Machado de Assis'
    authorEl.dispatchEvent(new Event('input', { bubbles: true }))
    form.addAuthorBtn()!.click()
    await nextTick()

    form.submitBtn()!.click()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(form.text()).toContain('Obra encontrada no catálogo')
    expect(form.text()).toContain('É este o livro que você procura?')

    const forceBtn = Array.from(form.host.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Não, criar assim mesmo'),
    )
    expect(forceBtn).toBeTruthy()
    forceBtn!.click()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch).toHaveBeenLastCalledWith(
      '/api/works?forcar=1',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          title: 'Dom Casmurro',
        }),
      }),
    )

    expect(navigatedTo).toBe('/app/novo?work_id=work-forced-2')

    form.unmount()
  })

  it('duplicate prompt allows choosing existing book with "É este livro"', async () => {
    mockFetch.mockRejectedValueOnce({
      status: 409,
      data: {
        error: 'conflito',
        message: 'Já existe uma obra...',
        work: {
          id: 'existing-dup-999',
          slug: 'livro-existente',
          title: 'Livro Existente',
          cover_url: null,
        },
      },
    })

    const form = await mountForm()

    const titleEl = form.titleInput()!
    titleEl.value = 'Livro Existente'
    titleEl.dispatchEvent(new Event('input', { bubbles: true }))

    const authorEl = form.authorInput()!
    authorEl.value = 'Autor Tal'
    authorEl.dispatchEvent(new Event('input', { bubbles: true }))
    form.addAuthorBtn()!.click()
    await nextTick()

    form.submitBtn()!.click()
    await nextTick()
    await nextTick()

    const chooseBtn = Array.from(form.host.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('É este livro'),
    )
    expect(chooseBtn).toBeTruthy()
    chooseBtn!.click()
    await nextTick()

    expect(navigatedTo).toBe('/app/novo?work_id=existing-dup-999')

    form.unmount()
  })

  it('navigates to returnTo with work_id after choosing "É este livro" with explicit returnTo="/app/novo"', async () => {
    mockFetch.mockRejectedValueOnce({
      status: 409,
      data: {
        error: 'conflito',
        message: 'Já existe uma obra...',
        work: {
          id: 'existing-dup-456',
          slug: 'outro-livro',
          title: 'Outro Livro',
          cover_url: null,
        },
      },
    })

    const form = await mountForm({ returnTo: '/app/novo' })

    const titleEl = form.titleInput()!
    titleEl.value = 'Outro Livro'
    titleEl.dispatchEvent(new Event('input', { bubbles: true }))

    const authorEl = form.authorInput()!
    authorEl.value = 'Outro Autor'
    authorEl.dispatchEvent(new Event('input', { bubbles: true }))
    form.addAuthorBtn()!.click()
    await nextTick()

    form.submitBtn()!.click()
    await nextTick()
    await nextTick()

    const chooseBtn = Array.from(form.host.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('É este livro'),
    )
    expect(chooseBtn).toBeTruthy()
    chooseBtn!.click()
    await nextTick()

    expect(navigatedTo).toBe('/app/novo?work_id=existing-dup-456')

    form.unmount()
  })

  it('rejects a cover URL of javascript:alert(1) with an inline error', async () => {
    const form = await mountForm()

    const disclosureBtn = Array.from(form.host.querySelectorAll<HTMLButtonElement>('.disclosure-toggle')).find(
      (b) => b.textContent?.includes('detalhes desta edição'),
    )
    expect(disclosureBtn).toBeTruthy()
    disclosureBtn!.click()
    await nextTick()

    const titleEl = form.titleInput()!
    titleEl.value = 'Livro Teste'
    titleEl.dispatchEvent(new Event('input', { bubbles: true }))

    const authorEl = form.authorInput()!
    authorEl.value = 'Autor Teste'
    authorEl.dispatchEvent(new Event('input', { bubbles: true }))
    form.addAuthorBtn()!.click()
    await nextTick()

    const coverEl = form.host.querySelector<HTMLInputElement>('#edition-cover-url')!
    expect(coverEl).toBeTruthy()
    coverEl.value = 'javascript:alert(1)'
    coverEl.dispatchEvent(new Event('input', { bubbles: true }))
    coverEl.dispatchEvent(new Event('blur', { bubbles: true }))
    await nextTick()

    form.submitBtn()!.click()
    await nextTick()
    await nextTick()

    expect(form.text()).toContain('A URL da capa precisa começar com https://')
    expect(mockFetch).not.toHaveBeenCalled()

    form.unmount()
  })

  it('restores draft from localStorage on refresh', async () => {
    vi.useFakeTimers()
    const first = await mountForm()

    const titleEl = first.titleInput()!
    titleEl.value = 'Título em Andamento'
    titleEl.dispatchEvent(new Event('input', { bubbles: true }))

    const authorEl = first.authorInput()!
    authorEl.value = 'Autor do Rascunho'
    authorEl.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    first.addAuthorBtn()!.click()
    await nextTick()
    await vi.advanceTimersByTimeAsync(250)

    const raw = localStorage.getItem(DRAFT_KEY)
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).title).toBe('Título em Andamento')

    first.unmount()

    const second = await mountForm()
    expect(second.titleInput()?.value).toBe('Título em Andamento')
    expect(second.text()).toContain('Autor do Rascunho')

    second.unmount()
  })

  it('sends author country and edition language in the payload', async () => {
    const form = await mountForm()

    const titleEl = form.titleInput()!
    titleEl.value = 'A Hora da Estrela'
    titleEl.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    const authorEl = form.authorInput()!
    authorEl.value = 'Clarice Lispector'
    authorEl.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    form.addAuthorBtn()!.click()
    await nextTick()
    await nextTick()

    const disclosures = form.host.querySelectorAll<HTMLButtonElement>('.disclosure-toggle')
    disclosures.forEach((d) => d.click())
    await nextTick()

    const countryEl = form.host.querySelector<HTMLInputElement>('#author-country')!
    expect(countryEl).toBeTruthy()
    countryEl.value = 'Brasil'
    countryEl.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    const langEl = form.host.querySelector<HTMLSelectElement>('#edition-language')!
    expect(langEl).toBeTruthy()
    langEl.value = 'pt'
    langEl.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()

    form.submitBtn()!.click()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/works',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          title: 'A Hora da Estrela',
          authors: [{ name: 'Clarice Lispector', country_code: 'BR', country_label: 'Brasil' }],
          edition: expect.objectContaining({ language: 'pt' }),
        }),
      }),
    )

    form.unmount()
  })

  it('keeps an unknown country label with a null code (e.g. Roma Antiga)', async () => {
    const form = await mountForm()

    const titleEl = form.titleInput()!
    titleEl.value = 'Meditações'
    titleEl.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    const authorEl = form.authorInput()!
    authorEl.value = 'Marco Aurélio'
    authorEl.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    form.addAuthorBtn()!.click()
    await nextTick()
    await nextTick()

    const disclosures = form.host.querySelectorAll<HTMLButtonElement>('.disclosure-toggle')
    disclosures.forEach((d) => d.click())
    await nextTick()

    const countryEl = form.host.querySelector<HTMLInputElement>('#author-country')!
    countryEl.value = 'Roma Antiga'
    countryEl.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    form.submitBtn()!.click()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/works',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          authors: [{ name: 'Marco Aurélio', country_code: null, country_label: 'Roma Antiga' }],
        }),
      }),
    )

    form.unmount()
  })

  it('restores author country and edition language from the draft', async () => {
    const first = await mountForm()

    const titleEl = first.titleInput()!
    titleEl.value = 'Ensaio Sobre a Cegueira'
    titleEl.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    const authorEl = first.authorInput()!
    authorEl.value = 'José Saramago'
    authorEl.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    first.addAuthorBtn()!.click()
    await nextTick()

    const disclosures = first.host.querySelectorAll<HTMLButtonElement>('.disclosure-toggle')
    disclosures.forEach((d) => d.click())
    await nextTick()

    const countryEl = first.host.querySelector<HTMLInputElement>('#author-country')!
    countryEl.value = 'Portugal'
    countryEl.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    const langEl = first.host.querySelector<HTMLSelectElement>('#edition-language')!
    langEl.value = 'pt'
    langEl.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()

    first.unmount()

    const second = await mountForm()

    expect(second.host.querySelector<HTMLInputElement>('#author-country')?.value).toBe('Portugal')
    expect(second.host.querySelector<HTMLSelectElement>('#edition-language')?.value).toBe('pt')

    second.unmount()
  })

  it('shows the cover preview only after blur, not while typing', async () => {
    const form = await mountForm()

    const disclosures = form.host.querySelectorAll<HTMLButtonElement>('.disclosure-toggle')
    disclosures.forEach((d) => d.click())
    await nextTick()

    const coverEl = form.host.querySelector<HTMLInputElement>('#edition-cover-url')!
    coverEl.value = 'https://exemplo.com/capa.jpg'
    coverEl.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    expect(form.host.querySelector('.cover-preview')).toBeNull()

    coverEl.dispatchEvent(new Event('blur', { bubbles: true }))
    await nextTick()

    expect(form.host.querySelector('.cover-preview')).toBeTruthy()

    form.unmount()
  })

  it('every input in the form has an associated label', async () => {
    const form = await mountForm()

    const disclosures = form.host.querySelectorAll<HTMLButtonElement>('.disclosure-toggle')
    disclosures.forEach((d) => d.click())
    await nextTick()

    const inputs = form.host.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea',
    )
    expect(inputs.length).toBeGreaterThan(0)

    for (const input of Array.from(inputs)) {
      const id = input.id
      expect(id).toBeTruthy()
      const label = form.host.querySelector(`label[for="${id}"]`)
      expect(label, `Input #${id} deve ter um <label for="${id}">`).toBeTruthy()
    }

    form.unmount()
  })

  it('restores a partially typed author only for the same user and add-book context', async () => {
    const first = await mountForm({ initialTitle: 'Livro A', returnTo: '/app/novo' })
    const authorInput = first.authorInput()!
    authorInput.value = 'Autor ainda não adicionado'
    authorInput.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    first.unmount()

    const restored = await mountForm({ initialTitle: 'Livro A', returnTo: '/app/novo' })
    expect(restored.authorInput()?.value).toBe('Autor ainda não adicionado')
    restored.unmount()

    const otherContext = await mountForm({ initialTitle: 'Livro B', returnTo: '/app/novo' })
    expect(otherContext.authorInput()?.value).toBe('')
    otherContext.unmount()

    setDraftTestUserId('user-2')
    globalScope.__draftTestUserId = 'user-2'
    const otherUser = await mountForm({ initialTitle: 'Livro A', returnTo: '/app/novo' })
    expect(otherUser.authorInput()?.value).toBe('')
    otherUser.unmount()
  })

  it('cancels pending draft writes when the authenticated user changes while mounted', async () => {
    vi.useFakeTimers()
    const form = await mountForm()
    const input = form.authorInput()!
    input.value = 'a'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    setDraftTestUserId('user-2')
    globalScope.__draftTestUserId = 'user-2'
    input.value = 'b'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    await vi.advanceTimersByTimeAsync(250)

    expect(input.value).toBe('b')
    form.unmount()
    expect(localStorage.length).toBe(0)
    expect(createFormDraftKey('add-book', 'user-2', 'create', '/app/novo|')).toBeTruthy()
    vi.useRealTimers()
  })

  it('exposes author suggestions as a keyboard-operable combobox', async () => {
    vi.useFakeTimers()
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.$fetch = vi.fn(async (url: string) => url.startsWith('/api/search')
      ? {
          works: [{
            id: '11111111-1111-4111-8111-111111111111',
            slug: 'obra-amado',
            title: 'Obra de Jorge Amado',
            authors: [{ name: 'Jorge Amado', slug: 'jorge-amado' }],
            first_published_year: 1931,
            cover_url: null,
            log_count: 0,
          }],
        }
      : { id: 'work-new-1', slug: 'obra-nova' })

    const form = await mountForm()
    const input = form.authorInput()!
    expect(input.getAttribute('role')).toBe('combobox')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')
    expect(input.getAttribute('aria-required')).toBe('true')

    input.value = 'Jorge'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    await vi.advanceTimersByTimeAsync(250)
    await nextTick()
    await nextTick()

    const option = form.host.querySelector<HTMLElement>('[role="option"]')
    expect(option?.textContent).toContain('Jorge Amado')
    expect(input.getAttribute('aria-expanded')).toBe('true')
    input.dispatchEvent(new Event('blur'))
    input.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(180)
    await nextTick()
    expect(input.getAttribute('aria-expanded')).toBe('true')

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await nextTick()
    expect(input.getAttribute('aria-activedescendant')).toBe(option?.id)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await nextTick()
    await nextTick()
    expect(form.text()).toContain('Jorge Amado')
    expect(input.value).toBe('')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.getAttribute('aria-required')).toBe('false')
    expect(form.host.querySelector('.author-sr-only')?.textContent).toContain('Jorge Amado adicionado')

    form.unmount()
    vi.useRealTimers()
  })

  it('aborts an obsolete author search and ignores its late response', async () => {
    vi.useFakeTimers()
    const pending: Array<{
      signal: AbortSignal | undefined
      resolve: (result: { works: Array<{ authors: Array<{ name: string }> }> }) => void
    }> = []
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.$fetch = vi.fn((_url: string, options?: { signal?: AbortSignal }) => new Promise((resolve) => {
      pending.push({
        signal: options?.signal,
        resolve: resolve as (result: { works: Array<{ authors: Array<{ name: string }> }> }) => void,
      })
    }))

    const form = await mountForm()
    const input = form.authorInput()!
    input.value = 'Jo'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    await vi.advanceTimersByTimeAsync(250)
    expect(pending).toHaveLength(1)

    input.value = 'A'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(pending[0]?.signal?.aborted).toBe(true)
    pending[0]?.resolve({ works: [{ authors: [{ name: 'Jorge Amado' }] }] })
    await Promise.resolve()
    await nextTick()

    expect(form.host.querySelector('[role="option"]')).toBeNull()
    form.unmount()
    vi.useRealTimers()
  })

  it('aborts the active author request when the form unmounts', async () => {
    vi.useFakeTimers()
    let requestSignal: AbortSignal | undefined
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.$fetch = vi.fn((_url: string, options?: { signal?: AbortSignal }) => {
      requestSignal = options?.signal
      return new Promise(() => {})
    })

    const form = await mountForm()
    const input = form.authorInput()!
    input.value = 'Ana'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    await vi.advanceTimersByTimeAsync(250)
    expect(requestSignal?.aborted).toBe(false)

    form.unmount()
    expect(requestSignal?.aborted).toBe(true)
    vi.useRealTimers()
  })

  it('keeps one create request in flight until navigation finishes', async () => {
    let finishNavigation: (() => void) | null = null
    const globalScope = globalThis as unknown as Record<string, unknown>
    const fetchMock = vi.fn(async () => ({ id: 'work-once', slug: 'obra-unica' }))
    globalScope.$fetch = fetchMock
    globalScope.navigateTo = vi.fn(() => new Promise<void>((resolve) => {
      finishNavigation = resolve
    }))

    try {
      const form = await mountForm()
      const title = form.titleInput()!
      title.value = 'Uma obra'
      title.dispatchEvent(new Event('input', { bubbles: true }))
      const author = form.authorInput()!
      author.value = 'Uma autora'
      author.dispatchEvent(new Event('input', { bubbles: true }))
      form.addAuthorBtn()!.click()
      await nextTick()

      const formElement = form.form()!
      formElement.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await nextTick()
      await nextTick()
      formElement.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await nextTick()

      const lateAuthor = form.authorInput()!
      expect(lateAuthor.disabled).toBe(true)
      lateAuthor.value = 'Autora adicionada tarde'
      lateAuthor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await nextTick()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(form.text()).not.toContain('Autora adicionada tarde')
      expect(finishNavigation).toBeTruthy()
      finishNavigation!()
      await nextTick()
      form.unmount()
    } finally {
      if (typeof finishNavigation === 'function') {
        (finishNavigation as () => void)()
      }
      globalScope.navigateTo = (dest: string) => {
        navigatedTo = dest
      }
    }
  })
})

describe('GenrePicker component', () => {
  let GenrePicker: Component | undefined

  async function mountGenrePicker(props: Record<string, unknown> = {}) {
    if (!GenrePicker) {
      GenrePicker = (await import('../../app/components/search/GenrePicker.vue')).default as Component
    }
    const host = document.createElement('div')
    document.body.appendChild(host)

    const app = createApp(GenrePicker, { ...props })
    app.mount(host)
    await nextTick()

    return {
      host,
      pills: () => host.querySelectorAll<HTMLButtonElement>('.genre-pill'),
      text: () => host.textContent ?? '',
      unmount: () => {
        app.unmount()
        host.remove()
      },
    }
  }

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders all 26 seeded genres', async () => {
    const picker = await mountGenrePicker()
    expect(picker.pills().length).toBe(26)
    expect(picker.text()).toContain('Ficção')
    expect(picker.text()).toContain('Não Ficção')
    expect(picker.text()).toContain('Poesia')
    picker.unmount()
  })

  it('highlights selected genres from modelValue', async () => {
    const picker = await mountGenrePicker({ modelValue: [1, 3] })
    const selectedPills = picker.host.querySelectorAll('.genre-pill.is-selected')
    expect(selectedPills.length).toBe(2)
    picker.unmount()
  })

  it('emits update:modelValue when toggling a genre', async () => {
    let emitted: number[] | null = null
    const picker = await mountGenrePicker({
      modelValue: [1],
      'onUpdate:modelValue': (val: number[]) => {
        emitted = val
      },
    })

    const romancePill = Array.from(picker.pills()).find((p) => p.textContent?.includes('Romance'))
    expect(romancePill).toBeTruthy()
    romancePill!.click()
    await nextTick()

    expect(emitted).toEqual([1, 3])
    picker.unmount()
  })

  it('disables remaining genres when max (4) is reached', async () => {
    const picker = await mountGenrePicker({ modelValue: [1, 2, 3, 4], max: 4 })
    expect(picker.text()).toContain('(limite atingido)')

    const unselectedPills = picker.host.querySelectorAll('.genre-pill:not(.is-selected)')
    expect(unselectedPills.length).toBe(22)
    for (const pill of Array.from(unselectedPills)) {
      expect((pill as HTMLButtonElement).disabled).toBe(true)
    }
    picker.unmount()
  })
})
