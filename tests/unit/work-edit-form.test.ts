// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import WorkEditForm from '../../app/components/book/WorkEditForm.vue'
import type { WorkWithDetails } from '../../shared/schemas/work'

const work: WorkWithDetails = {
  id: 'work-1',
  slug: 'livro-de-teste',
  title: 'Livro de Teste',
  original_language: null,
  first_published_year: null,
  series_name: null,
  series_number: null,
  cover_url: null,
  authors: [
    { id: 'author-1', name: 'Ana', slug: 'ana', country_code: 'BR', country_label: 'Brasil' },
    { id: 'author-2', name: 'Beto', slug: 'beto', country_code: 'PT', country_label: 'Portugal' },
    { id: 'author-3', name: 'Caio', slug: 'caio', country_code: 'BR', country_label: 'Brasil' },
  ],
  genres: [],
  editions: [],
  logs: [],
  log_count: 0,
  average_rating: null,
}

function mountForm(formWork: WorkWithDetails = work) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(WorkEditForm, { work: formWork, onSaved: vi.fn() })
  app.mount(container)

  return {
    container,
    unmount() {
      app.unmount()
      container.remove()
    },
  }
}

describe('WorkEditForm author row identity', () => {
  it('keeps another author input, focus, selection, and value when a preceding row is removed', async () => {
    const wrapper = mountForm()
    const rows = wrapper.container.querySelectorAll<HTMLElement>('.author-row')
    const betoName = rows[1]?.querySelector<HTMLInputElement>('.author-name-group input')
    const removeAna = rows[0]?.querySelector<HTMLButtonElement>('.author-remove')

    expect(betoName).not.toBeNull()
    expect(removeAna).not.toBeNull()
    if (!betoName || !removeAna) throw new Error('Expected author fields to be rendered')

    betoName.focus()
    betoName.setSelectionRange(1, 2)
    removeAna.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(betoName.isConnected).toBe(true)
    expect(document.activeElement).toBe(betoName)
    expect([betoName.selectionStart, betoName.selectionEnd]).toEqual([1, 2])
    expect(betoName.value).toBe('Beto')

    wrapper.unmount()
  })

  it('moves focus into the next author when the focused remove control is deleted', async () => {
    const wrapper = mountForm()
    const firstRow = wrapper.container.querySelector<HTMLElement>('.author-row')
    const removeAna = firstRow?.querySelector<HTMLButtonElement>('.author-remove')

    expect(removeAna).not.toBeNull()
    if (!removeAna) throw new Error('Expected the remove button to be rendered')

    removeAna.focus()
    removeAna.click()
    await nextTick()

    const nextAuthorName = wrapper.container.querySelector<HTMLInputElement>('.author-name-group input')
    expect(nextAuthorName?.value).toBe('Beto')
    expect(document.activeElement).toBe(nextAuthorName)

    wrapper.unmount()
  })
})

describe('WorkEditForm author country', () => {
  const lockedHint = 'O país deste autor já está definido e não pode ser alterado aqui.'

  it('shows the country of an author that already has one as read-only, explained by aria-describedby', () => {
    const wrapper = mountForm()
    const countryInput = wrapper.container.querySelector<HTMLInputElement>('.author-row .author-country-group input')

    expect(countryInput).not.toBeNull()
    if (!countryInput) throw new Error('Expected the country field to be rendered')

    expect(countryInput.readOnly).toBe(true)
    expect(countryInput.value).toBe('Brasil')
    expect(countryInput.hasAttribute('list')).toBe(false)

    const describedBy = countryInput.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy ?? '')?.textContent?.trim()).toBe(lockedHint)

    wrapper.unmount()
  })

  it('keeps the country of an author without one editable', () => {
    const wrapper = mountForm({
      ...work,
      authors: [{ id: 'author-9', name: 'Dora', slug: 'dora', country_code: null, country_label: null }],
    })
    const countryInput = wrapper.container.querySelector<HTMLInputElement>('.author-row .author-country-group input')

    expect(countryInput).not.toBeNull()
    if (!countryInput) throw new Error('Expected the country field to be rendered')

    expect(countryInput.readOnly).toBe(false)
    expect(countryInput.getAttribute('list')).toBe('country-options')
    expect(countryInput.hasAttribute('aria-describedby')).toBe(false)
    expect(wrapper.container.textContent).not.toContain(lockedHint)

    wrapper.unmount()
  })

  it('keeps the country of a newly added author editable', async () => {
    const wrapper = mountForm()
    const addAuthor = wrapper.container.querySelector<HTMLButtonElement>('.add-author-btn')
    expect(addAuthor).not.toBeNull()
    if (!addAuthor) throw new Error('Expected the add author button to be rendered')

    addAuthor.click()
    await nextTick()

    const rows = wrapper.container.querySelectorAll<HTMLElement>('.author-row')
    const newCountry = rows[rows.length - 1]?.querySelector<HTMLInputElement>('.author-country-group input')

    expect(newCountry?.readOnly).toBe(false)
    expect(newCountry?.hasAttribute('aria-describedby')).toBe(false)

    wrapper.unmount()
  })
})

describe('WorkEditForm country after the author name changes', () => {
  interface SentAuthor {
    name: string
    country_code: string | null
    country_label: string | null
  }

  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({}))
    vi.stubGlobal('$fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function firstNameInput(container: HTMLElement): HTMLInputElement {
    const input = container.querySelector<HTMLInputElement>('.author-row .author-name-group input')
    if (!input) throw new Error('Expected the first author name field to be rendered')
    return input
  }

  function firstCountryInput(container: HTMLElement): HTMLInputElement {
    const input = container.querySelector<HTMLInputElement>('.author-row .author-country-group input')
    if (!input) throw new Error('Expected the first author country field to be rendered')
    return input
  }

  function typeInto(input: HTMLInputElement, value: string): void {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  // Submits the form and returns the authors sent in the PATCH body.
  async function submitAuthors(container: HTMLElement): Promise<SentAuthor[]> {
    container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()

    const request = fetchMock.mock.calls[0]?.[1] as { body: { authors: SentAuthor[] } } | undefined
    if (!request) throw new Error('Expected the form to send a PATCH request')
    return request.body.authors
  }

  it('unlocks and clears the country when the name becomes another author, and never sends the old country', async () => {
    const wrapper = mountForm()
    typeInto(firstNameInput(wrapper.container), 'Fiódor Dostoiévski')
    await nextTick()

    const country = firstCountryInput(wrapper.container)
    expect(country.readOnly).toBe(false)
    expect(country.value).toBe('')
    expect(country.hasAttribute('list')).toBe(true)
    expect(country.hasAttribute('aria-describedby')).toBe(false)

    const authors = await submitAuthors(wrapper.container)
    expect(authors[0]).toEqual({ name: 'Fiódor Dostoiévski', country_code: null, country_label: null })

    wrapper.unmount()
  })

  it('sends the country the user types for the new name, not the original one', async () => {
    const wrapper = mountForm()
    typeInto(firstNameInput(wrapper.container), 'Fiódor Dostoiévski')
    await nextTick()
    typeInto(firstCountryInput(wrapper.container), 'Rússia')

    const authors = await submitAuthors(wrapper.container)
    expect(authors[0]?.name).toBe('Fiódor Dostoiévski')
    expect(authors[0]?.country_label).toBe('Rússia')
    expect(authors[0]?.country_code).toBe('RU')

    wrapper.unmount()
  })

  it('locks the original country again when the original name comes back, ignoring case and spaces', async () => {
    const wrapper = mountForm()
    const name = firstNameInput(wrapper.container)
    typeInto(name, 'Fiódor Dostoiévski')
    await nextTick()
    typeInto(name, '  ana  ')
    await nextTick()

    const country = firstCountryInput(wrapper.container)
    expect(country.readOnly).toBe(true)
    expect(country.value).toBe('Brasil')

    const authors = await submitAuthors(wrapper.container)
    expect(authors[0]).toEqual({ name: 'ana', country_code: 'BR', country_label: 'Brasil' })

    wrapper.unmount()
  })
})
