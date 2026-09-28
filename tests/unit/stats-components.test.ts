// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, type Component } from 'vue'
import BarList from '../../app/components/stats/BarList.vue'
import YearColumns from '../../app/components/stats/YearColumns.vue'

const NuxtLink = defineComponent({
  name: 'NuxtLink',
  inheritAttrs: false,
  props: {
    to: {
      type: [String, Object],
      required: true,
    },
  },
  setup(props, { slots, attrs }) {
    return () =>
      h(
        'a',
        {
          ...attrs,
          href: typeof props.to === 'string' ? props.to : JSON.stringify(props.to),
        },
        slots.default?.(),
      )
  },
})

function mount<T extends Component>(component: T, props: Record<string, unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(component, props)
  app.component('NuxtLink', NuxtLink)
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

describe('BarList.vue', () => {
  it('renders three li with bar widths 100%, 50%, 25% for counts [4, 2, 1]', () => {
    const items = [
      { label: 'Tolkien', count: 4 },
      { label: 'Asimov', count: 2 },
      { label: 'Clarke', count: 1 },
    ]
    const wrapper = mount(BarList, { items, title: 'Autores mais lidos' })

    const listItems = wrapper.findAll('li')
    expect(listItems).toHaveLength(3)

    const bars = wrapper.findAll<HTMLElement>('.bar')
    expect(bars).toHaveLength(3)
    expect(bars[0]!.style.width).toBe('100%')
    expect(bars[1]!.style.width).toBe('50%')
    expect(bars[2]!.style.width).toBe('25%')

    wrapper.unmount()
  })

  it('renders text with singular and plural units (1 livro, 4 livros)', () => {
    const items = [
      { label: 'Tolkien', count: 4 },
      { label: 'Clarke', count: 1 },
    ]
    const wrapper = mount(BarList, { items, title: 'Autores' })
    const text = wrapper.text()
    expect(text).toContain('4 livros')
    expect(text).toContain('1 livro')

    wrapper.unmount()
  })

  it('renders no ol when items is empty or undefined', () => {
    const wrapperEmpty = mount(BarList, { items: [], title: 'Vazio' })
    expect(wrapperEmpty.find('ol')).toBeNull()
    expect(wrapperEmpty.html()).toBe('<!--v-if-->')
    wrapperEmpty.unmount()

    const wrapperUndefined = mount(BarList, { title: 'Vazio' })
    expect(wrapperUndefined.find('ol')).toBeNull()
    expect(wrapperUndefined.html()).toBe('<!--v-if-->')
    wrapperUndefined.unmount()
  })

  it('renders an a with href when to is present, and no a when to is absent', () => {
    const items = [
      { label: 'Ficção', count: 5, to: '/genero/ficcao' },
      { label: 'Terror', count: 2 },
    ]
    const wrapper = mount(BarList, { items, title: 'Gêneros' })

    const links = wrapper.findAll('a')
    expect(links).toHaveLength(1)
    expect(links[0]!.getAttribute('href')).toBe('/genero/ficcao')
    expect(links[0]!.textContent?.trim()).toBe('Ficção')

    const listItems = wrapper.findAll('li')
    expect(listItems[0]!.querySelector('a')).not.toBeNull()
    expect(listItems[1]!.querySelector('a')).toBeNull()

    wrapper.unmount()
  })

  it('supports custom singular and plural unit', () => {
    const items = [
      { label: 'Brasil', count: 1 },
      { label: 'Reino Unido', count: 3 },
    ]
    const wrapper = mount(BarList, {
      items,
      title: 'Países',
      unit: { one: 'leitura', other: 'leituras' },
    })
    const text = wrapper.text()
    expect(text).toContain('1 leitura')
    expect(text).toContain('3 leituras')

    wrapper.unmount()
  })

  it('renders the h2 title', () => {
    const wrapper = mount(BarList, {
      items: [{ label: 'Fantasia', count: 10 }],
      title: 'Gêneros mais lidos',
    })
    const heading = wrapper.find('h2')
    expect(heading).not.toBeNull()
    expect(heading?.textContent?.trim()).toBe('Gêneros mais lidos')

    wrapper.unmount()
  })
})

describe('YearColumns.vue', () => {
  it('builds links relative to basePath for each year', () => {
    const items = [
      { year: 2023, books: 10, pages: 3000 },
      { year: 2024, books: 12, pages: 3400 },
    ]
    const wrapper = mount(YearColumns, {
      items,
      title: 'Livros por ano',
      basePath: '/@diogo',
    })

    const links = wrapper.findAll('a')
    expect(links).toHaveLength(2)
    expect(links[0]!.getAttribute('href')).toBe('/@diogo/ano/2023')
    expect(links[1]!.getAttribute('href')).toBe('/@diogo/ano/2024')

    wrapper.unmount()
  })

  it('formats aria-label for { year: 2024, books: 12, pages: 3400 } as 2024: 12 livros, 3.400 páginas', () => {
    const items = [
      { year: 2024, books: 12, pages: 3400 },
    ]
    const wrapper = mount(YearColumns, {
      items,
      title: 'Livros por ano',
      basePath: '/@diogo',
    })

    const link = wrapper.find('a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('aria-label')).toBe('2024: 12 livros, 3.400 páginas')

    wrapper.unmount()
  })

  it('formats singular units in aria-label correctly', () => {
    const items = [
      { year: 2021, books: 1, pages: 1 },
    ]
    const wrapper = mount(YearColumns, {
      items,
      title: 'Livros por ano',
      basePath: '/@diogo',
    })

    const link = wrapper.find('a')
    expect(link?.getAttribute('aria-label')).toBe('2021: 1 livro, 1 página')

    wrapper.unmount()
  })

  it('marks only the highlighted year column with is-highlight and aria-current="page"', () => {
    const items = [
      { year: 2023, books: 8, pages: 2000 },
      { year: 2024, books: 12, pages: 3400 },
    ]
    const wrapper = mount(YearColumns, {
      items,
      title: 'Livros por ano',
      basePath: '/@diogo',
      highlightYear: 2024,
    })

    const links = wrapper.findAll('a')
    expect(links).toHaveLength(2)

    expect(links[0]!.classList.contains('is-highlight')).toBe(false)
    expect(links[0]!.getAttribute('aria-current')).toBeNull()

    expect(links[1]!.classList.contains('is-highlight')).toBe(true)
    expect(links[1]!.getAttribute('aria-current')).toBe('page')

    wrapper.unmount()
  })

  it('marks no column when highlightYear is null', () => {
    const items = [
      { year: 2023, books: 8, pages: 2000 },
      { year: 2024, books: 12, pages: 3400 },
    ]
    const wrapper = mount(YearColumns, {
      items,
      title: 'Livros por ano',
      basePath: '/@diogo',
      highlightYear: null,
    })

    const links = wrapper.findAll('a')
    expect(links[0]!.classList.contains('is-highlight')).toBe(false)
    expect(links[0]!.getAttribute('aria-current')).toBeNull()
    expect(links[1]!.classList.contains('is-highlight')).toBe(false)
    expect(links[1]!.getAttribute('aria-current')).toBeNull()

    wrapper.unmount()
  })

  it('renders nothing when items is empty', () => {
    const wrapperEmpty = mount(YearColumns, {
      items: [],
      title: 'Livros por ano',
      basePath: '/@diogo',
    })
    expect(wrapperEmpty.html()).toBe('<!--v-if-->')
    expect(wrapperEmpty.findAll('a')).toHaveLength(0)

    wrapperEmpty.unmount()
  })

  it('calculates column bar heights proportional to max books', () => {
    const items = [
      { year: 2022, books: 5, pages: 1000 },
      { year: 2023, books: 10, pages: 2000 },
      { year: 2024, books: 20, pages: 4000 },
    ]
    const wrapper = mount(YearColumns, {
      items,
      title: 'Livros por ano',
      basePath: '/@diogo',
    })

    const bars = wrapper.findAll<HTMLElement>('.column-bar')
    expect(bars).toHaveLength(3)
    expect(bars[0]!.style.height).toBe('25%')
    expect(bars[1]!.style.height).toBe('50%')
    expect(bars[2]!.style.height).toBe('100%')

    wrapper.unmount()
  })

  it('renders the h2 title', () => {
    const wrapper = mount(YearColumns, {
      items: [{ year: 2024, books: 1, pages: 100 }],
      title: 'Histórico anual',
      basePath: '/@diogo',
    })
    const heading = wrapper.find('h2')
    expect(heading).not.toBeNull()
    expect(heading?.textContent?.trim()).toBe('Histórico anual')

    wrapper.unmount()
  })
})
