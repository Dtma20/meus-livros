// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import EditionEditor from '../../app/components/book/EditionEditor.vue'
import type { WorkEditionView } from '../../shared/schemas/work'

const INVALID_ISBN_MESSAGE = 'ISBN inválido. Confira os dígitos.'

// The check digit of this ISBN-13 is wrong; the valid one ends in 9.
const MISTYPED_ISBN = '9788535914848'
const VALID_ISBN = '9788535914849'

const savedEdition: WorkEditionView = {
  id: 'edition-1',
  isbn13: VALID_ISBN,
  publisher: 'Editora Original',
  page_count: null,
  published_year: null,
  language: null,
  cover_url: null,
  ol_cover_id: null,
}

function mountEditor(edition: WorkEditionView | null) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(EditionEditor, {
    workId: 'work-1',
    workTitle: 'Livro de Teste',
    edition,
    onSaved: vi.fn(),
  })
  app.mount(container)

  return {
    container,
    unmount() {
      app.unmount()
      container.remove()
    },
  }
}

function isbnInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[id$="-isbn"]')
  if (!input) throw new Error('Expected the ISBN field to be rendered')
  return input
}

function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function submit(container: HTMLElement): void {
  container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

describe('EditionEditor ISBN', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({}))
    vi.stubGlobal('$fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refuses a mistyped ISBN on create, shows it on the field and sends no request', async () => {
    const wrapper = mountEditor(null)
    typeInto(isbnInput(wrapper.container), MISTYPED_ISBN)
    submit(wrapper.container)
    await nextTick()

    expect(fetchMock).not.toHaveBeenCalled()
    const input = isbnInput(wrapper.container)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy ?? '')?.textContent?.trim()).toBe(INVALID_ISBN_MESSAGE)

    wrapper.unmount()
  })

  it('refuses a mistyped ISBN on edit and does not report the edition as saved', async () => {
    const wrapper = mountEditor(savedEdition)
    typeInto(isbnInput(wrapper.container), MISTYPED_ISBN)
    submit(wrapper.container)
    await nextTick()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper.container.textContent).toContain(INVALID_ISBN_MESSAGE)
    expect(wrapper.container.textContent).not.toContain('Edição salva.')

    wrapper.unmount()
  })

  it('accepts an ISBN written with hyphens', async () => {
    const wrapper = mountEditor(null)
    typeInto(isbnInput(wrapper.container), '978-85-359-1484-9')
    submit(wrapper.container)
    await nextTick()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/works/work-1/editions')
    expect(wrapper.container.textContent).not.toContain(INVALID_ISBN_MESSAGE)

    wrapper.unmount()
  })

  it('allows an empty ISBN, which means the edition has none', async () => {
    const wrapper = mountEditor(null)
    submit(wrapper.container)
    await nextTick()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = fetchMock.mock.calls[0]?.[1] as { body: { isbn: string | null } } | undefined
    expect(request?.body.isbn).toBeNull()

    wrapper.unmount()
  })
})

describe('EditionEditor busy state during submit', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({}))
    vi.stubGlobal('$fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('disables fields while POST is pending, ignores a second submit, and re-enables fields after failure', async () => {
    let rejectPromise!: (reason?: unknown) => void
    const pendingPromise = new Promise((_resolve, reject) => {
      rejectPromise = reject
    })
    fetchMock.mockImplementationOnce(() => pendingPromise)

    const wrapper = mountEditor(null)
    const input = isbnInput(wrapper.container)
    const fieldset = wrapper.container.querySelector('fieldset')
    expect(fieldset?.disabled).toBe(false)
    expect(input.disabled).toBe(false)

    submit(wrapper.container)
    await nextTick()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fieldset?.disabled).toBe(true)
    expect(input.disabled).toBe(true)

    // A second submit while busy does not trigger another fetch
    submit(wrapper.container)
    await nextTick()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // After failure, fields become editable again
    rejectPromise(new Error('Network error'))
    await nextTick()
    await nextTick()

    expect(fieldset?.disabled).toBe(false)
    expect(input.disabled).toBe(false)

    wrapper.unmount()
  })
})
