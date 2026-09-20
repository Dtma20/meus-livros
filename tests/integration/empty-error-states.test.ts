// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import { useBookFilters } from '../../app/composables/useBookFilters'
import EmptyState from '../../app/components/ui/EmptyState.vue'
import ErrorState from '../../app/components/ui/ErrorState.vue'
import SearchBox from '../../app/components/search/SearchBox.vue'
import type { H3Event } from 'h3'
import { defineApiHandler } from '../../server/utils/api'
import type { ProfileLogItem } from '../../shared/schemas/profile'

// SearchBox reaches for three Nuxt auto-imports that a bare createApp does not
// provide: useId for the listbox ids, plus navigateTo and useRoute in goToAdd.
// Without them the component throws on mount and every assertion below reports
// a missing element rather than the real cause.
vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.useId = () => 'test-search-id'
  globalScope.navigateTo = (to: string) => to
  globalScope.useRoute = () => ({ fullPath: '/' })
})

function createSampleLog(overrides: Partial<ProfileLogItem> & {
  title?: string
  authorName?: string
  genre?: string
  year?: number | null
}): ProfileLogItem {
  const title = overrides.title ?? 'Livro Teste'
  const authorName = overrides.authorName ?? 'Autor Teste'
  const genreLabel = overrides.genre ?? 'Ficção'

  return {
    id: overrides.id ?? `log-${Math.random().toString(36).slice(2)}`,
    rating: overrides.rating !== undefined ? overrides.rating : 4,
    review: overrides.review ?? 'Ótimo livro',
    started_on: null,
    finished_on: '2024-01-01',
    finished_precision: 'dia',
    format: 'fisico',
    visibility: 'publico',
    created_at: new Date('2024-01-01T12:00:00Z'),
    work: {
      id: `work-${Math.random().toString(36).slice(2)}`,
      title,
      slug: 'slug-teste',
      first_published_year: overrides.year !== undefined ? overrides.year : 2020,
      cover_url: null,
      authors: [{ id: 'a1', name: authorName, slug: 'autor-teste', country_code: 'BRA', country_label: 'Brasil' }],
      genres: [{ id: 1, slug: 'ficcao', label_pt: genreLabel }],
    },
    edition: {
      id: 'ed-1',
      isbn13: '9788598078397',
      publisher: 'Editora',
      page_count: 250,
      published_year: 2020,
      cover_url: null,
      ol_cover_id: null,
    },
  }
}

describe('TASK-020 Integration: Profile filtering empty state and restoration', () => {
  it('filtering a profile to zero shows the empty state naming active filters, and clearing restores the grid', async () => {
    const logs = ref<ProfileLogItem[]>([
      createSampleLog({ title: 'Capitães da Areia', genre: 'Ficção' }),
      createSampleLog({ title: 'Dom Casmurro', genre: 'Clássico' }),
    ])

    const {
      filterGenre,
      hasActiveFilters,
      resetFilters,
      sortedBooks,
    } = useBookFilters(logs)

    // Initial state: 2 books visible
    expect(sortedBooks.value.length).toBe(2)
    expect(hasActiveFilters.value).toBe(false)

    // Filter by a non-matching genre
    filterGenre.value = 'Terror'
    expect(hasActiveFilters.value).toBe(true)
    expect(sortedBooks.value.length).toBe(0)

    // Active filter description
    const activeFiltersDesc = `gênero "${filterGenre.value}"`

    // Mount the empty state with the filter description
    const container = document.createElement('div')
    document.body.appendChild(container)
    const app = createApp(EmptyState, {
      title: 'Nenhum livro com esses filtros.',
      message: `Filtros ativos: ${activeFiltersDesc}.`,
      actionLabel: 'Limpar filtros',
      onAction: () => {
        resetFilters()
      },
    })
    app.mount(container)

    expect(container.textContent).toContain('Nenhum livro com esses filtros.')
    expect(container.textContent).toContain('Filtros ativos: gênero "Terror".')

    // Click "Limpar filtros"
    const clearBtn = container.querySelector('button.empty-btn')
    expect(clearBtn).not.toBeNull()
    clearBtn?.dispatchEvent(new MouseEvent('click'))
    await nextTick()

    // Filters are reset and the full grid is restored
    expect(hasActiveFilters.value).toBe(false)
    expect(filterGenre.value).toBe('')
    expect(sortedBooks.value.length).toBe(2)

    app.unmount()
    container.remove()
  })
})

describe('TASK-020 Integration: Search with no results shows manual-add as primary action', () => {
  it('shows "Não encontramos esse livro." with "Adicionar à mão" as primary action and "Buscar online" as secondary', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ works: [] }),
    } as unknown as Response)

    const container = document.createElement('div')
    document.body.appendChild(container)
    const app = createApp(SearchBox, { navigateOnSelect: false })
    app.mount(container)

    const input = container.querySelector('input') as HTMLInputElement
    expect(input).not.toBeNull()

    // Focus and input search term
    input.dispatchEvent(new Event('focus'))
    input.value = 'Livro Não Cadastrado'
    input.dispatchEvent(new Event('input'))

    // Wait for debounced search
    await new Promise((resolve) => setTimeout(resolve, 350))
    await nextTick()

    expect(container.textContent).toContain('Não encontramos esse livro.')

    const primaryBtn = container.querySelector('[data-testid="search-add-manual"]') as HTMLElement
    expect(primaryBtn).not.toBeNull()
    expect(primaryBtn.textContent?.trim()).toBe('Adicionar à mão')
    expect(primaryBtn.classList.contains('empty-btn-primary')).toBe(true)

    const secondaryBtn = container.querySelector('[data-testid="search-online-lookup"]') as HTMLElement
    expect(secondaryBtn).not.toBeNull()
    expect(secondaryBtn.textContent?.trim()).toBe('Buscar online')
    expect(secondaryBtn.classList.contains('empty-btn-secondary')).toBe(true)

    app.unmount()
    container.remove()
    global.fetch = originalFetch
  })
})

describe('TASK-020 Integration: Forced 500 error handling', () => {
  it('forced 500 returns error shape without stack trace and renders ErrorState with retry', async () => {
    // 1. Test the server-side API error handler contract
    let capturedStatusCode: number | undefined
    const mockEvent = {
      node: {
        res: {
          get statusCode(): number | undefined {
            return capturedStatusCode
          },
          set statusCode(code: number | undefined) {
            capturedStatusCode = code
          },
        },
      },
    } as unknown as H3Event

    // Mock h3 setResponseStatus behavior via defineApiHandler
    const failingHandler = defineApiHandler(async () => {
      const err = new Error('Database connection crashed: SELECT * FROM users')
      err.stack = 'Error: Database connection crashed\n    at query (pg.js:123:45)'
      throw err
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await failingHandler(mockEvent)
    consoleSpy.mockRestore()

    // Status code must be 500
    expect(capturedStatusCode).toBe(500)

    // Response body must adhere to project format { error, message }
    expect(response).toHaveProperty('error')
    expect(response).toHaveProperty('message')

    // Response body MUST NOT contain stack trace or internal database messages
    const bodyStr = JSON.stringify(response)
    expect(bodyStr).not.toContain('stack')
    expect(bodyStr).not.toContain('pg.js')
    expect(bodyStr).not.toContain('SELECT * FROM')
    expect(bodyStr).not.toContain('Database connection crashed')

    // 2. Test ErrorState component rendering for 500
    let retried = false
    const container = document.createElement('div')
    document.body.appendChild(container)
    const app = createApp(ErrorState, {
      title: 'Algo deu errado. Tente de novo.',
      actionLabel: 'Tentar de novo',
      onRetry: () => {
        retried = true
      },
    })
    app.mount(container)

    expect(container.textContent).toContain('Algo deu errado. Tente de novo.')
    expect(container.innerHTML).not.toContain('stack')
    expect(container.innerHTML).not.toContain('SELECT')

    const retryBtn = container.querySelector('button.error-btn') as HTMLButtonElement
    expect(retryBtn).not.toBeNull()
    expect(retryBtn.textContent?.trim()).toBe('Tentar de novo')

    retryBtn.click()
    await nextTick()
    expect(retried).toBe(true)

    app.unmount()
    container.remove()
  })
})
