// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, nextTick, type Component } from 'vue'
import ReadingMap from '../../app/components/profile/ReadingMap.vue'
import { aggregateReadingMapData, getMapColorTier } from '../../app/utils/reading-map'
import type { ProfileLogItem } from '../../shared/schemas/profile'
import { formatCountryName } from '../../shared/schemas/profile'

function createSampleLog(overrides: {
  id?: string
  title?: string
  authors?: Array<{
    id?: string
    name: string
    country_code: string | null
    country_label?: string | null
  }>
  visibility?: 'publico' | 'privado'
}): ProfileLogItem {
  const authors = overrides.authors
    ? overrides.authors.map((a, idx) => ({
        id: a.id ?? `author-${idx}`,
        name: a.name,
        slug: `author-${idx}`,
        country_code: a.country_code,
        country_label: a.country_label ?? null,
      }))
    : [
        {
          id: 'author-1',
          name: 'Autor Padrão',
          slug: 'autor-padrao',
          country_code: 'BR',
          country_label: 'Brasil',
        },
      ]

  return {
    id: overrides.id ?? `log-${Math.random().toString(36).slice(2)}`,
    rating: 4,
    started_on: null,
    finished_on: '2024-01-01',
    finished_precision: 'dia',
    format: 'fisico',
    visibility: overrides.visibility ?? 'publico',
    created_at: new Date('2024-01-01T12:00:00Z'),
    work: {
      id: `work-${Math.random().toString(36).slice(2)}`,
      title: overrides.title ?? 'Livro de Teste',
      slug: 'livro-de-teste',
      first_published_year: 2020,
      cover_url: null,
      authors,
      genres: [{ id: 1, slug: 'ficcao', label_pt: 'Ficção' }],
    },
    edition: null,
  }
}

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
    findAll: <E extends Element = Element>(selector: string) =>
      Array.from(container.querySelectorAll<E>(selector)),
    unmount: () => {
      app.unmount()
      container.remove()
    },
  }
}

describe('aggregateReadingMapData (unit)', () => {
  it('returns empty counts when logs list is empty', () => {
    const result = aggregateReadingMapData([])
    expect(result.countryCounts).toEqual({})
    expect(result.totalMappedCountries).toBe(0)
    expect(result.unmappedCountries).toEqual([])
  })

  it('aggregates a book with a single author with ISO code (BR)', () => {
    const log = createSampleLog({
      authors: [{ name: 'Machado de Assis', country_code: 'BR', country_label: 'Brasil' }],
    })
    const result = aggregateReadingMapData([log])
    expect(result.countryCounts).toEqual({ BR: 1 })
    expect(result.totalMappedCountries).toBe(1)
    expect(result.unmappedCountries).toEqual([])
  })

  it('aggregates a book with two authors from different countries (BR and US)', () => {
    const log = createSampleLog({
      title: 'Obra em Parceria Internacional',
      authors: [
        { name: 'Autor Brasileiro', country_code: 'BR', country_label: 'Brasil' },
        { name: 'Autor Americano', country_code: 'US', country_label: 'Estados Unidos' },
      ],
    })
    const result = aggregateReadingMapData([log])
    expect(result.countryCounts['BR']).toBe(1)
    expect(result.countryCounts['US']).toBe(1)
    expect(result.totalMappedCountries).toBe(2)
    expect(result.unmappedCountries).toEqual([])
  })

  it('counts a single book once per country even if two authors share the same country', () => {
    const log = createSampleLog({
      title: 'Obra de Dois Autores Brasileiros',
      authors: [
        { name: 'Primeiro Autor', country_code: 'BR', country_label: 'Brasil' },
        { name: 'Segundo Autor', country_code: 'BR', country_label: 'Brasil' },
      ],
    })
    const result = aggregateReadingMapData([log])
    expect(result.countryCounts['BR']).toBe(1)
    expect(result.totalMappedCountries).toBe(1)
  })

  it('excludes authors without ISO code (Roma Antiga) from map counts but includes in unmappedCountries', () => {
    const log = createSampleLog({
      title: 'Meditações',
      authors: [{ name: 'Marco Aurélio', country_code: null, country_label: 'Roma Antiga' }],
    })
    const result = aggregateReadingMapData([log])
    expect(result.countryCounts).toEqual({})
    expect(result.totalMappedCountries).toBe(0)
    expect(result.unmappedCountries).toEqual(['Roma Antiga'])
  })

  it('handles a mix of mapped and unmapped authors across books', () => {
    const log1 = createSampleLog({
      authors: [{ name: 'Autor BR', country_code: 'BR' }],
    })
    const log2 = createSampleLog({
      authors: [{ name: 'Autor Histórico', country_code: null, country_label: 'Roma Antiga' }],
    })
    const log3 = createSampleLog({
      authors: [{ name: 'Autor UK', country_code: 'GB' }],
    })
    const result = aggregateReadingMapData([log1, log2, log3])
    expect(result.countryCounts).toEqual({ BR: 1, GB: 1 })
    expect(result.totalMappedCountries).toBe(2)
    expect(result.unmappedCountries).toEqual(['Roma Antiga'])
  })

  it('excludes authors whose country_code does not match /^[A-Z]{2}$/ from countryCounts and sends to unmappedCountries', () => {
    const log = createSampleLog({
      title: 'Obra com Códigos Não Padrão',
      authors: [
        { name: 'Autor Código Três Letras', country_code: 'BRA', country_label: 'Brasil' },
        { name: 'Autor Código Numérico', country_code: '12', country_label: 'Desconhecido' },
        { name: 'Autor Código Vazio', country_code: '   ', country_label: 'Vazio' },
      ],
    })
    const result = aggregateReadingMapData([log])
    expect(result.countryCounts).toEqual({})
    expect(result.totalMappedCountries).toBe(0)
    expect(result.unmappedCountries).toEqual(['Brasil', 'Desconhecido', 'Vazio'])
  })
})

describe('getMapColorTier (unit)', () => {
  it('returns 0 when book count is 0', () => {
    expect(getMapColorTier(0, 10)).toBe(0)
    expect(getMapColorTier(0, 0)).toBe(0)
  })

  it('returns 4 for single-country profile (maxCount <= 1)', () => {
    expect(getMapColorTier(1, 1)).toBe(4)
  })

  it('returns tiers 1 to 4 according to ratio against maxCount', () => {
    // maxCount = 100
    expect(getMapColorTier(15, 100)).toBe(1) // <= 25%
    expect(getMapColorTier(25, 100)).toBe(1) // = 25%
    expect(getMapColorTier(35, 100)).toBe(2) // 26-50%
    expect(getMapColorTier(50, 100)).toBe(2) // = 50%
    expect(getMapColorTier(65, 100)).toBe(3) // 51-75%
    expect(getMapColorTier(75, 100)).toBe(3) // = 75%
    expect(getMapColorTier(90, 100)).toBe(4) // > 75%
  })
})

describe('ReadingMap.vue (component unit)', () => {
  it('renders country names in Portuguese (Requirement 2 & 3)', () => {
    expect(formatCountryName('BR')).toBe('Brasil')
    expect(formatCountryName('US')).toBe('Estados Unidos')
    expect(formatCountryName('GB')).toBe('Reino Unido')
    expect(formatCountryName('FR')).toBe('França')
    expect(formatCountryName('DE')).toBe('Alemanha')
    expect(formatCountryName('JP')).toBe('Japão')
  })

  it('renders SVG map with role="img", accessible label in pt-BR and correct summary', () => {
    const wrapper = mount(ReadingMap, {
      countryCounts: { BR: 5, US: 3 },
      selectedCountry: '',
      unmappedCountries: [],
    })

    const svg = wrapper.find('svg.world-map-svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('role')).toBe('img')
    expect(svg?.getAttribute('aria-label')).toContain('2 países com livros registrados')

    expect(wrapper.text()).toContain('Mapa de leituras')
    expect(wrapper.text()).toContain('2 países registrados')

    wrapper.unmount()
  })

  it('displays the unmapped countries note when provided', () => {
    const wrapper = mount(ReadingMap, {
      countryCounts: { BR: 5 },
      selectedCountry: '',
      unmappedCountries: ['Roma Antiga'],
    })

    expect(wrapper.text()).toContain('Roma Antiga')
    expect(wrapper.text()).toContain('sem representação geográfica no mapa')

    wrapper.unmount()
  })

  it('emits "select" with Portuguese country name when country with books is clicked', async () => {
    let selectedCountryEmitted: string | null = null
    const wrapper = mount(ReadingMap, {
      countryCounts: { BR: 5, US: 2 },
      selectedCountry: '',
      unmappedCountries: [],
      onSelect: (c: string) => {
        selectedCountryEmitted = c
      },
    })

    // Find the group for Brazil (BR)
    const groups = wrapper.findAll('g.country-group')
    // Look for group that has .has-books and contains BR
    const brGroup = groups.find((g) => g.classList.contains('has-books'))
    expect(brGroup).not.toBeNull()

    // Trigger click on Brazil
    brGroup?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(selectedCountryEmitted).toBe('Brasil')

    wrapper.unmount()
  })

  it('emits "select" with empty string to clear when clicked on already-selected country', async () => {
    let emittedValue: string | null = null
    const wrapper = mount(ReadingMap, {
      countryCounts: { BR: 5 },
      selectedCountry: 'Brasil',
      unmappedCountries: [],
      onSelect: (c: string) => {
        emittedValue = c
      },
    })

    const brGroup = wrapper.find('g.country-group.is-selected')
    expect(brGroup).not.toBeNull()

    brGroup?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(emittedValue).toBe('')

    wrapper.unmount()
  })

  it('clicking the clear button in the header emits "select" with empty string', async () => {
    let emittedValue: string | null = null
    const wrapper = mount(ReadingMap, {
      countryCounts: { BR: 5 },
      selectedCountry: 'Brasil',
      unmappedCountries: [],
      onSelect: (c: string) => {
        emittedValue = c
      },
    })

    const clearBtn = wrapper.find<HTMLButtonElement>('button.clear-filter-btn')
    expect(clearBtn).not.toBeNull()
    expect(clearBtn?.textContent).toContain('Limpar')

    clearBtn?.click()
    await nextTick()

    expect(emittedValue).toBe('')

    wrapper.unmount()
  })
})
