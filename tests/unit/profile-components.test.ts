// @vitest-environment happy-dom
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

    // Selected option text must be "Todos os Países"
    const selectedOption = countrySelect?.options[countrySelect.selectedIndex]
    expect(selectedOption?.textContent?.trim()).toBe('Todos os Países')

    // Reset button must not be rendered when hasActiveFilters is false
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
})
