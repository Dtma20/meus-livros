// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createApp, type Component, nextTick } from 'vue'
import EmptyState from '../../app/components/ui/EmptyState.vue'
import ErrorState from '../../app/components/ui/ErrorState.vue'
import LoadingSkeleton from '../../app/components/ui/LoadingSkeleton.vue'
import SearchBox from '../../app/components/search/SearchBox.vue'
import JsonImportSection from '../../app/components/log/JsonImportSection.vue'

// SearchBox reaches for three Nuxt auto-imports that a bare createApp does not
// provide: useId for the listbox ids, plus navigateTo and useRoute in goToAdd.
// Without them the component throws on mount and every assertion below reports
// a missing element rather than the real cause. tests/unit/routes.test.ts stubs
// the same three for the same reason.
vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.useId = () => 'test-search-id'
  globalScope.navigateTo = (to: string) => to
  globalScope.useRoute = () => ({ fullPath: '/' })
})

function mount<T extends Component>(component: T, props: Record<string, unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(component, props)
  app.component('NuxtLink', {
    props: ['to'],
    template: '<a><slot /></a>',
  })
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

describe('EmptyState.vue', () => {
  it('renders icon, title and message correctly', () => {
    const wrapper = mount(EmptyState, {
      icon: '📚',
      title: 'Você ainda não registrou nenhum livro.',
      message: 'Assim que registrar seus primeiros livros, eles aparecerão aqui.',
    })

    expect(wrapper.text()).toContain('📚')
    expect(wrapper.text()).toContain('Você ainda não registrou nenhum livro.')
    expect(wrapper.text()).toContain('Assim que registrar seus primeiros livros, eles aparecerão aqui.')
    wrapper.unmount()
  })

  it('renders action link when actionHref is provided', () => {
    const wrapper = mount(EmptyState, {
      title: 'Ninguém registrou nada ainda. Seja o primeiro.',
      actionLabel: 'Registrar livro',
      actionHref: '/app/novo',
    })

    const link = wrapper.find('a.empty-btn')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('/app/novo')
    expect(link?.textContent?.trim()).toBe('Registrar livro')
    wrapper.unmount()
  })

  it('renders button and emits action event when clicked without actionHref', async () => {
    let clicked = false
    const wrapper = mount(EmptyState, {
      title: 'Nenhum livro com esses filtros.',
      actionLabel: 'Limpar filtros',
      onAction: () => {
        clicked = true
      },
    })

    const button = wrapper.find('button.empty-btn')
    expect(button).not.toBeNull()
    expect(button?.textContent?.trim()).toBe('Limpar filtros')
    button?.dispatchEvent(new MouseEvent('click'))
    await nextTick()

    expect(clicked).toBe(true)
    wrapper.unmount()
  })

  it('renders without action when no actionLabel or actionHref is provided (visitor state)', () => {
    const wrapper = mount(EmptyState, {
      title: 'Ainda não registrou nenhum livro.',
    })

    expect(wrapper.find('.empty-btn')).toBeNull()
    expect(wrapper.text()).toContain('Ainda não registrou nenhum livro.')
    wrapper.unmount()
  })
})

describe('ErrorState.vue', () => {
  it('renders default pt-BR copy and retry button', () => {
    const wrapper = mount(ErrorState)

    expect(wrapper.text()).toContain('Algo deu errado. Tente de novo.')
    const btn = wrapper.find('button.error-btn')
    expect(btn).not.toBeNull()
    expect(btn?.textContent?.trim()).toBe('Tentar de novo')
    wrapper.unmount()
  })

  it('emits retry event on button click', async () => {
    let retried = false
    const wrapper = mount(ErrorState, {
      onRetry: () => {
        retried = true
      },
    })

    const btn = wrapper.find('button.error-btn')
    btn?.dispatchEvent(new MouseEvent('click'))
    await nextTick()

    expect(retried).toBe(true)
    wrapper.unmount()
  })

  it('never displays stack traces or internal database error messages', () => {
    const wrapper = mount(ErrorState, {
      title: 'Algo deu errado. Tente de novo.',
      message: 'Não foi possível completar a operação.',
    })

    const html = wrapper.html()
    expect(html).not.toContain('stack')
    expect(html).not.toContain('at Object.')
    expect(html).not.toContain('ECONNREFUSED')
    expect(html).not.toContain('SELECT ')
    wrapper.unmount()
  })
})

describe('LoadingSkeleton.vue', () => {
  it('renders default count of 6 skeleton cards matching card dimensions', () => {
    const wrapper = mount(LoadingSkeleton)

    const cards = wrapper.findAll('[data-testid="skeleton-card"]')
    expect(cards.length).toBe(6)
    wrapper.unmount()
  })

  it('renders specified count of skeleton cards', () => {
    const wrapper = mount(LoadingSkeleton, { count: 12 })

    const cards = wrapper.findAll('[data-testid="skeleton-card"]')
    expect(cards.length).toBe(12)
    wrapper.unmount()
  })
})

describe('SearchBox.vue - Empty state on search miss', () => {
  it('renders "Não encontramos esse livro." with "Adicionar à mão" as primary action and "Buscar online" as secondary', async () => {
    // Mock global fetch to return zero works
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ works: [] }),
    } as unknown as Response)

    const wrapper = mount(SearchBox, { navigateOnSelect: false })

    const input = wrapper.find<HTMLInputElement>('input')
    if (!input) throw new Error('input element not found')

    // Focus input and type a query
    input.dispatchEvent(new Event('focus'))
    input.value = 'Livro Inexistente Brasileiro'
    input.dispatchEvent(new Event('input'))

    // Wait for debounced search (250ms)
    await new Promise((resolve) => setTimeout(resolve, 350))
    await nextTick()

    expect(wrapper.text()).toContain('Não encontramos esse livro.')

    const primaryBtn = wrapper.find('[data-testid="search-add-manual"]')
    expect(primaryBtn).not.toBeNull()
    expect(primaryBtn?.textContent?.trim()).toBe('Adicionar à mão')
    expect(primaryBtn?.classList.contains('empty-btn-primary')).toBe(true)

    const secondaryBtn = wrapper.find('[data-testid="search-online-lookup"]')
    expect(secondaryBtn).not.toBeNull()
    expect(secondaryBtn?.textContent?.trim()).toBe('Buscar online')
    expect(secondaryBtn?.classList.contains('empty-btn-secondary')).toBe(true)

    wrapper.unmount()
    global.fetch = originalFetch
  })

  it('renders cover preview in search results dropdown for found works', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        works: [
          {
            id: 'work-1',
            slug: 'dom-casmurro',
            title: 'Dom Casmurro',
            authors: [{ name: 'Machado de Assis', slug: 'machado-de-assis' }],
            first_published_year: 1899,
            cover_url: 'https://covers.openlibrary.org/b/id/647501-M.jpg',
            ol_cover_id: 647501,
            source: 'externo',
          },
        ],
      }),
    } as unknown as Response)

    const wrapper = mount(SearchBox, { navigateOnSelect: false })

    const input = wrapper.find<HTMLInputElement>('input')
    if (!input) throw new Error('input element not found')

    input.dispatchEvent(new Event('focus'))
    input.value = 'Dom Casmurro'
    input.dispatchEvent(new Event('input'))

    // Wait for debounced search (250ms)
    await new Promise((resolve) => setTimeout(resolve, 350))
    await nextTick()

    const resultCover = wrapper.find('.result-cover')
    expect(resultCover).not.toBeNull()

    const img = resultCover?.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://covers.openlibrary.org/b/id/647501-M.jpg')

    wrapper.unmount()
    global.fetch = originalFetch
  })
})

describe('JsonImportSection.vue - Format Guide', () => {
  it('renders JSON format description, sample code, and field documentation', () => {
    const wrapper = mount(JsonImportSection)

    expect(wrapper.text()).toContain('Estrutura esperada do arquivo JSON')
    expect(wrapper.text()).toContain('title')
    expect(wrapper.text()).toContain('author')
    expect(wrapper.text()).toContain('Obrigatório')
    expect(wrapper.text()).toContain('Opcional')
    expect(wrapper.text()).toContain('Dom Casmurro')
    expect(wrapper.text()).toContain('Machado de Assis')

    const details = wrapper.find('details.json-format-guide')
    expect(details).not.toBeNull()
    expect(details?.getAttribute('open')).toBe('')

    const copyBtn = wrapper.find('.btn-copy-template')
    expect(copyBtn).not.toBeNull()
    expect(copyBtn?.textContent?.trim()).toContain('Copiar modelo')

    wrapper.unmount()
  })
})


