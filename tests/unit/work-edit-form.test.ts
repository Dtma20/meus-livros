// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
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
