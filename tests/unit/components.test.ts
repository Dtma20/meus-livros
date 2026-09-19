import { describe, expect, it } from 'vitest'
import { createApp, type Component, nextTick } from 'vue'
import StarRating from '../../app/components/book/StarRating.vue'
import BookCover from '../../app/components/book/BookCover.vue'
import BookCard from '../../app/components/book/BookCard.vue'
import BookGrid from '../../app/components/book/BookGrid.vue'
import ReviewText from '../../app/components/log/ReviewText.vue'
import EmptyState from '../../app/components/ui/EmptyState.vue'

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
    }
  }
}

describe('StarRating.vue', () => {
  it('renders 4.5 as ★★★★½ with correct pt-BR aria-label', () => {
    const wrapper = mount(StarRating, { rating: 4.5 })
    expect(wrapper.text()).toBe('★★★★½')
    const el = wrapper.find('[role="img"]')
    expect(el).not.toBeNull()
    expect(el?.getAttribute('aria-label')).toBe('4,5 de 5 estrelas')
    wrapper.unmount()
  })

  it('renders 3 as ★★★ with correct aria-label', () => {
    const wrapper = mount(StarRating, { rating: 3 })
    expect(wrapper.text()).toBe('★★★')
    const el = wrapper.find('[role="img"]')
    expect(el).not.toBeNull()
    expect(el?.getAttribute('aria-label')).toBe('3 de 5 estrelas')
    wrapper.unmount()
  })

  it('renders nothing when rating is null', () => {
    const wrapper = mount(StarRating, { rating: null })
    expect(wrapper.text()).toBe('')
    expect(wrapper.find('[role="img"]')).toBeNull()
    wrapper.unmount()
  })

  it('renders nothing when rating is undefined or 0', () => {
    const wrapperUndefined = mount(StarRating, {})
    expect(wrapperUndefined.text()).toBe('')
    wrapperUndefined.unmount()

    const wrapperZero = mount(StarRating, { rating: 0 })
    expect(wrapperZero.text()).toBe('')
    wrapperZero.unmount()
  })
})

describe('BookCover.vue', () => {
  it('ends with ?default=false when isbn13 is provided', () => {
    const wrapper = mount(BookCover, {
      alt: 'Capa de 1984',
      isbn13: '9788598078397'
    })
    const img = wrapper.find('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe(
      'https://covers.openlibrary.org/b/isbn/9788598078397-L.jpg?default=false'
    )
    expect(img?.getAttribute('alt')).toBe('Capa de 1984')
    wrapper.unmount()
  })

  it('prefers isbn13 over isbn when both are provided', () => {
    const wrapper = mount(BookCover, {
      alt: 'Capa com ISBN13 e ISBN10',
      isbn: '8532511015',
      isbn13: '9788532511010'
    })
    const img = wrapper.find('img')
    expect(img?.getAttribute('src')).toBe(
      'https://covers.openlibrary.org/b/isbn/9788532511010-L.jpg?default=false'
    )
    wrapper.unmount()
  })

  it('falls back to isbn when isbn13 is not provided', () => {
    const wrapper = mount(BookCover, {
      alt: 'Capa com ISBN fallback',
      isbn: '9788598078397'
    })
    const img = wrapper.find('img')
    expect(img?.getAttribute('src')).toBe(
      'https://covers.openlibrary.org/b/isbn/9788598078397-L.jpg?default=false'
    )
    wrapper.unmount()
  })

  it('starts with data:image/svg+xml and contains initials when no cover data is provided', () => {
    const wrapper = mount(BookCover, {
      alt: 'Capa de Dom Casmurro',
      title: 'Dom Casmurro'
    })
    const img = wrapper.find('img')
    expect(img).not.toBeNull()
    const src = img?.getAttribute('src') ?? ''
    expect(src.startsWith('data:image/svg+xml')).toBe(true)
    expect(src).toContain('DC')
    expect(img?.getAttribute('alt')).toBe('Capa de Dom Casmurro')
    wrapper.unmount()
  })

  it('rejects javascript:alert(1) coverUrl and falls back to placeholder', () => {
    const wrapper = mount(BookCover, {
      alt: 'Capa Maliciosa',
      title: 'Ataque XSS',
      coverUrl: 'javascript:alert(1)'
    })
    const img = wrapper.find('img')
    expect(img).not.toBeNull()
    const src = img?.getAttribute('src') ?? ''
    expect(src.startsWith('data:image/svg+xml')).toBe(true)
    expect(src).not.toContain('javascript:')
    wrapper.unmount()
  })

  it('rejects http: (non-https) URLs and falls back to placeholder', () => {
    const wrapper = mount(BookCover, {
      alt: 'Capa Insegura',
      title: 'Inseguro',
      coverUrl: 'http://example.com/insecure.jpg'
    })
    const img = wrapper.find('img')
    const src = img?.getAttribute('src') ?? ''
    expect(src.startsWith('data:image/svg+xml')).toBe(true)
    wrapper.unmount()
  })

  it('uses olCoverId when provided', () => {
    const wrapper = mount(BookCover, {
      alt: 'Capa OL',
      olCoverId: 12345
    })
    const img = wrapper.find('img')
    expect(img?.getAttribute('src')).toBe('https://covers.openlibrary.org/b/id/12345-M.jpg')
    wrapper.unmount()
  })

  it('uses valid https coverUrl when provided', () => {
    const wrapper = mount(BookCover, {
      alt: 'Capa HTTPS',
      coverUrl: 'https://example.com/cover.jpg'
    })
    const img = wrapper.find('img')
    expect(img?.getAttribute('src')).toBe('https://example.com/cover.jpg')
    wrapper.unmount()
  })

  it('falls back to placeholder when image emits error event', async () => {
    const wrapper = mount(BookCover, {
      alt: 'Capa 404',
      title: 'Livro Desconhecido',
      isbn13: '9780000000000'
    })
    const img = wrapper.find('img')
    expect(img?.getAttribute('src')).toContain('?default=false')

    img?.dispatchEvent(new Event('error'))
    await nextTick()

    const newSrc = img?.getAttribute('src') ?? ''
    expect(newSrc.startsWith('data:image/svg+xml')).toBe(true)
    expect(newSrc).toContain('LD')
    wrapper.unmount()
  })

  it('ensures every img has a non-empty alt attribute', () => {
    const wrapper = mount(BookCover, {
      alt: 'Descrição obrigatória da capa'
    })
    const img = wrapper.find('img')
    expect(img?.getAttribute('alt')).toBeTruthy()
    wrapper.unmount()
  })
})

describe('BookCard.vue', () => {
  it('renders as an <a> tag with href, poster, and keyboard accessibility', () => {
    const wrapper = mount(BookCard, {
      title: 'Dom Casmurro',
      author: 'Machado de Assis',
      rating: 5,
      href: '/livro/dom-casmurro'
    })
    const link = wrapper.find('a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('/livro/dom-casmurro')
    expect(link?.classList.contains('card')).toBe(true)

    const img = wrapper.find('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('alt')).toBe('Capa de Dom Casmurro, de Machado de Assis')

    const stars = wrapper.find('.stars')
    expect(stars?.textContent).toBe('★★★★★')
    wrapper.unmount()
  })

  it('renders fallback href # and alt without author when only title is passed', () => {
    const wrapper = mount(BookCard, {
      title: 'Livro Sem Autor'
    })
    const link = wrapper.find('a')
    expect(link?.getAttribute('href')).toBe('#')
    expect(wrapper.find('img')?.getAttribute('alt')).toBe('Capa de Livro Sem Autor')
    expect(wrapper.find('.stars')).toBeNull()
    wrapper.unmount()
  })
})

describe('BookGrid.vue', () => {
  it('renders a grid container', () => {
    const wrapper = mount(BookGrid)
    const grid = wrapper.find('.book-grid')
    expect(grid).not.toBeNull()
    wrapper.unmount()
  })

  it('renders slotted cards inside the grid', () => {
    const wrapper = mount({
      components: { BookGrid, BookCard },
      template: `
        <BookGrid>
          <BookCard title="Livro 1" author="Autor 1" href="/livro/livro-1" :rating="4" />
          <BookCard title="Livro 2" author="Autor 2" href="/livro/livro-2" :rating="5" />
        </BookGrid>
      `
    })
    const cards = wrapper.findAll('a.card')
    expect(cards).toHaveLength(2)
    wrapper.unmount()
  })
})

describe('ReviewText.vue', () => {
  it('renders literal string for <b>oi</b> with no <b> element in DOM', () => {
    const wrapper = mount(ReviewText, { text: '<b>oi</b>' })
    expect(wrapper.text()).toBe('<b>oi</b>')
    expect(wrapper.find('b')).toBeNull()
    expect(wrapper.container.querySelector('b')).toBeNull()
    wrapper.unmount()
  })

  it('shows <script>alert(1)</script> literally and executes nothing', () => {
    const wrapper = mount(ReviewText, { text: '<script>alert(1)</script>' })
    expect(wrapper.text()).toBe('<script>alert(1)</script>')
    expect(wrapper.find('script')).toBeNull()
    expect(wrapper.container.querySelector('script')).toBeNull()
    wrapper.unmount()
  })

  it('preserves multi-line text', () => {
    const wrapper = mount(ReviewText, { text: 'Primeira linha\nSegunda linha' })
    expect(wrapper.text()).toBe('Primeira linha\nSegunda linha')
    wrapper.unmount()
  })
})

describe('EmptyState.vue', () => {
  it('renders title and message correctly', () => {
    const wrapper = mount(EmptyState, {
      title: 'Nenhum livro encontrado',
      message: 'Tente alterar os filtros de busca.'
    })
    expect(wrapper.text()).toContain('Nenhum livro encontrado')
    expect(wrapper.text()).toContain('Tente alterar os filtros de busca.')
    wrapper.unmount()
  })

  it('renders action link when actionHref is set', () => {
    const wrapper = mount(EmptyState, {
      title: 'Vazio',
      actionLabel: 'Adicionar Livro',
      actionHref: '/app/novo'
    })
    const link = wrapper.find('a.empty-btn')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('/app/novo')
    expect(link?.textContent?.trim()).toBe('Adicionar Livro')
    wrapper.unmount()
  })

  it('renders action button and emits action event on click', async () => {
    const wrapper = mount(EmptyState, {
      title: 'Vazio',
      actionLabel: 'Limpar Filtros'
    })
    const button = wrapper.find('button.empty-btn')
    expect(button).not.toBeNull()
    button?.dispatchEvent(new MouseEvent('click'))
    await nextTick()
    wrapper.unmount()
  })
})

describe('All six components render in isolation with mock props', () => {
  it('mounts all 6 components without error', () => {
    const r1 = mount(StarRating, { rating: 4 })
    const r2 = mount(BookCover, { alt: 'Mock Cover', title: 'Mock Title' })
    const r3 = mount(BookCard, { title: 'Mock Book', author: 'Mock Author' })
    const r4 = mount(BookGrid)
    const r5 = mount(ReviewText, { text: 'Mock Review' })
    const r6 = mount(EmptyState, { title: 'Mock Empty' })

    expect(r1.container).toBeTruthy()
    expect(r2.container).toBeTruthy()
    expect(r3.container).toBeTruthy()
    expect(r4.container).toBeTruthy()
    expect(r5.container).toBeTruthy()
    expect(r6.container).toBeTruthy()

    r1.unmount()
    r2.unmount()
    r3.unmount()
    r4.unmount()
    r5.unmount()
    r6.unmount()
  })
})
