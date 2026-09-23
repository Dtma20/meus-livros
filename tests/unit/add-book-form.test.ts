// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

const DRAFT_KEY = 'meus-livros:add-book-draft'

let navigatedTo: string | null = null

vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.useId = () => 'test-add-book-id'
  globalScope.navigateTo = (dest: string) => {
    navigatedTo = dest
  }
})

let AddBookForm: unknown

async function mountForm(props: Record<string, unknown> = {}) {
  if (!AddBookForm) {
    AddBookForm = (await import('../../app/components/search/AddBookForm.vue')).default
  }
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
    form: () => host.querySelector<HTMLFormElement>('form'),
    text: () => host.textContent ?? '',
    unmount: () => {
      app.unmount()
      host.remove()
    },
  }
}

describe('AddBookForm component', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    navigatedTo = null
    vi.restoreAllMocks()

    mockFetch = vi.fn(async () => ({ id: 'work-new-1', slug: 'obra-nova' }))
    const globalScope = globalThis as unknown as Record<string, unknown>
    globalScope.$fetch = mockFetch
  })

  afterEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('pre-fills title from initialTitle prop (e.g. from search zero-state)', async () => {
    const form = await mountForm({ initialTitle: 'Grande Sertão: Veredas' })
    expect(form.titleInput()?.value).toBe('Grande Sertão: Veredas')
    form.unmount()
  })

  it('submitting only title + author succeeds and redirects to returnTo with work_id', async () => {
    const form = await mountForm()

    // 1. Enter title
    const titleEl = form.titleInput()!
    titleEl.value = 'Memórias Póstumas de Brás Cubas'
    titleEl.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    // 2. Add an author
    const authorEl = form.authorInput()!
    authorEl.value = 'Machado de Assis'
    authorEl.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    form.addAuthorBtn()!.click()
    await nextTick()
    await nextTick()

    // Author should now be listed in tags
    expect(form.text()).toContain('Machado de Assis')

    // 3. Submit
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

    // Should navigate to returnTo carrying work_id
    expect(navigatedTo).toBe('/app/novo?work_id=work-new-1')

    form.unmount()
  })

  it('shows duplicate prompt on 409 and allows forcing creation with ?forcar=1', async () => {
    // Mock 409 on first call, success on second call
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

    // Enter title & author
    const titleEl = form.titleInput()!
    titleEl.value = 'Dom Casmurro'
    titleEl.dispatchEvent(new Event('input', { bubbles: true }))

    const authorEl = form.authorInput()!
    authorEl.value = 'Machado de Assis'
    authorEl.dispatchEvent(new Event('input', { bubbles: true }))
    form.addAuthorBtn()!.click()
    await nextTick()

    // Submit -> triggers 409
    form.submitBtn()!.click()
    await nextTick()
    await nextTick()
    await nextTick()

    // Duplicate prompt is visible
    expect(form.text()).toContain('Obra encontrada no catálogo')
    expect(form.text()).toContain('É este o livro que você procura?')

    // Click "Não, criar assim mesmo"
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

    // Click "✓ É este livro"
    const chooseBtn = Array.from(form.host.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('É este livro'),
    )
    expect(chooseBtn).toBeTruthy()
    chooseBtn!.click()
    await nextTick()

    // Redirects carrying existing work_id
    expect(navigatedTo).toBe('/app/novo?work_id=existing-dup-999')

    form.unmount()
  })

  it('rejects a cover URL of javascript:alert(1) with an inline error', async () => {
    const form = await mountForm()

    // Expand edition disclosure
    const disclosureBtn = Array.from(form.host.querySelectorAll<HTMLButtonElement>('.disclosure-toggle')).find(
      (b) => b.textContent?.includes('detalhes desta edição'),
    )
    expect(disclosureBtn).toBeTruthy()
    disclosureBtn!.click()
    await nextTick()

    // Set title and author
    const titleEl = form.titleInput()!
    titleEl.value = 'Livro Teste'
    titleEl.dispatchEvent(new Event('input', { bubbles: true }))

    const authorEl = form.authorInput()!
    authorEl.value = 'Autor Teste'
    authorEl.dispatchEvent(new Event('input', { bubbles: true }))
    form.addAuthorBtn()!.click()
    await nextTick()

    // Set invalid cover_url
    const coverEl = form.host.querySelector<HTMLInputElement>('#edition-cover-url')!
    expect(coverEl).toBeTruthy()
    coverEl.value = 'javascript:alert(1)'
    coverEl.dispatchEvent(new Event('input', { bubbles: true }))
    coverEl.dispatchEvent(new Event('blur', { bubbles: true }))
    await nextTick()

    // Submit
    form.submitBtn()!.click()
    await nextTick()
    await nextTick()

    expect(form.text()).toContain('A URL da capa precisa começar com https://')
    expect(mockFetch).not.toHaveBeenCalled()

    form.unmount()
  })

  it('restores draft from localStorage on refresh', async () => {
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

    // Verify localStorage has draft
    const raw = localStorage.getItem(DRAFT_KEY)
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).title).toBe('Título em Andamento')

    first.unmount()

    // Second mount restores draft
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

    // Expand both disclosures
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

  it('every input in the form has an associated label', async () => {
    const form = await mountForm()

    // Expand both disclosures so all optional inputs are rendered
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
})

describe('GenrePicker component', () => {
  let GenrePicker: unknown

  async function mountGenrePicker(props: Record<string, unknown> = {}) {
    if (!GenrePicker) {
      GenrePicker = (await import('../../app/components/search/GenrePicker.vue')).default
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = createApp(GenrePicker as any, { ...props })
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

    // Click another genre (e.g. Romance, id: 3)
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

