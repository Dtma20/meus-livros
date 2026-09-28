import { describe, expect, it } from 'vitest'
import { createApp, type Component } from 'vue'
import FilterBar from '../../app/components/profile/FilterBar.vue'
import StatBox from '../../app/components/profile/StatBox.vue'

function mount<T extends Component>(component: T, props: Record<string, unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(component, props)
  const vm = app.mount(container)

  return {
    container,
    vm,
    html: () => container.innerHTML,
    text: () => container.textContent?.trim() ?? '',
    find: <E extends Element = Element>(selector: string) => container.querySelector<E>(selector),
    findAll: <E extends Element = Element>(selector: string) => Array.from(container.querySelectorAll<E>(selector)),
    unmount: () => {
      app.unmount()
      container.remove()
    },
  }
}

describe('StatBox.vue', () => {
  it('renders numeric values formatted in pt-BR and label', () => {
    const wrapper = mount(StatBox, {
      value: 1250,
      label: 'Páginas',
    })
    expect(wrapper.text()).toContain('1.250')
    expect(wrapper.text()).toContain('Páginas')
    wrapper.unmount()
  })

  it('renders string values directly', () => {
    const wrapper = mount(StatBox, {
      value: '86',
      label: 'Livros',
    })
    expect(wrapper.text()).toContain('86')
    expect(wrapper.text()).toContain('Livros')
    wrapper.unmount()
  })
})

describe('FilterBar.vue', () => {
  it('Requirement 4 bugfix: renders "Todos os Países" on first paint, not blank', () => {
    const wrapper = mount(FilterBar, {
      genre: '',
      country: '',
      decade: '',
      sortBy: 'read_desc',
      availableGenres: ['Ficção', 'Romance'],
      availableCountries: ['Brasil', 'Reino Unido'],
      availableDecades: [2020, 2010],
      hasActiveFilters: false,
    })

    const countrySelect = wrapper.find<HTMLSelectElement>('select[aria-label="Filtrar por país"]')
    expect(countrySelect).not.toBeNull()
    expect(countrySelect?.value).toBe('')

    const selectedOption = countrySelect?.options[countrySelect.selectedIndex]
    expect(selectedOption?.textContent?.trim()).toBe('Todos os Países')

    const resetBtn = wrapper.find('button.reset-btn')
    expect(resetBtn).toBeNull()

    wrapper.unmount()
  })

  it('shows reset button when hasActiveFilters is true and emits reset on click', async () => {
    let resetEmitted = false
    const wrapper = mount(FilterBar, {
      genre: 'Ficção',
      country: '',
      decade: '',
      sortBy: 'read_desc',
      availableGenres: ['Ficção', 'Romance'],
      availableCountries: ['Brasil', 'Reino Unido'],
      availableDecades: [2020, 2010],
      hasActiveFilters: true,
      onReset: () => {
        resetEmitted = true
      },
    })

    const resetBtn = wrapper.find<HTMLButtonElement>('button.reset-btn')
    expect(resetBtn).not.toBeNull()
    expect(resetBtn?.textContent).toContain('Limpar')

    resetBtn?.click()
    expect(resetEmitted).toBe(true)

    wrapper.unmount()
  })

  it('emits update:* from each of the four selects with the chosen value', () => {
    const emitted: Record<string, unknown[]> = {
      genre: [],
      country: [],
      decade: [],
      sortBy: [],
    }
    const wrapper = mount(FilterBar, {
      genre: '',
      country: '',
      decade: '',
      sortBy: 'read_desc',
      availableGenres: ['Ficção', 'Romance'],
      availableCountries: ['Brasil', 'Reino Unido'],
      availableDecades: [2020, 2010],
      hasActiveFilters: false,
      'onUpdate:genre': (value: unknown) => emitted.genre?.push(value),
      'onUpdate:country': (value: unknown) => emitted.country?.push(value),
      'onUpdate:decade': (value: unknown) => emitted.decade?.push(value),
      'onUpdate:sortBy': (value: unknown) => emitted.sortBy?.push(value),
    })

    const choose = (label: string, value: string) => {
      const select = wrapper.find<HTMLSelectElement>(`select[aria-label="${label}"]`)
      expect(select).not.toBeNull()
      if (!select) return
      select.value = value
      select.dispatchEvent(new Event('change'))
    }

    choose('Filtrar por gênero', 'Romance')
    choose('Filtrar por país', 'Brasil')
    choose('Filtrar por década', '2010')
    choose('Ordenar por', 'alpha')

    expect(emitted.genre).toEqual(['Romance'])
    expect(emitted.country).toEqual(['Brasil'])
    expect(emitted.decade).toEqual(['2010'])
    expect(emitted.sortBy).toEqual(['alpha'])

    wrapper.unmount()
  })

  it('emits the empty string when a filter goes back to "Todos"', () => {
    const genres: unknown[] = []
    const wrapper = mount(FilterBar, {
      genre: 'Ficção',
      country: '',
      decade: '',
      sortBy: 'read_desc',
      availableGenres: ['Ficção', 'Romance'],
      availableCountries: ['Brasil'],
      availableDecades: [2020],
      hasActiveFilters: true,
      'onUpdate:genre': (value: unknown) => genres.push(value),
    })

    const select = wrapper.find<HTMLSelectElement>('select[aria-label="Filtrar por gênero"]')
    expect(select).not.toBeNull()
    if (select) {
      select.value = ''
      select.dispatchEvent(new Event('change'))
    }
    expect(genres).toEqual([''])

    wrapper.unmount()
  })

  it('keeps the sort select named when its visible label is hidden on phones', () => {
    const wrapper = mount(FilterBar, {
      genre: '',
      country: '',
      decade: '',
      sortBy: 'read_desc',
      availableGenres: [],
      availableCountries: [],
      availableDecades: [],
      hasActiveFilters: false,
    })

    expect(wrapper.findAll('select.filter-select')).toHaveLength(4)
    expect(wrapper.find('select.sort-select')?.getAttribute('aria-label')).toBe('Ordenar por')

    wrapper.unmount()
  })
})
