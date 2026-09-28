// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, type Component } from 'vue'
import BookCard from '../../app/components/book/BookCard.vue'

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

describe('BookCard.vue', () => {
  it('renders title text in the DOM', () => {
    const wrapper = mount(BookCard, {
      title: 'Dom Casmurro'
    })

    expect(wrapper.text()).toContain('Dom Casmurro')
    const titleEl = wrapper.find('.caption-title')
    expect(titleEl?.textContent).toBe('Dom Casmurro')
    wrapper.unmount()
  })

  it('renders title and author text when author is provided', () => {
    const wrapper = mount(BookCard, {
      title: 'Dom Casmurro',
      author: 'Machado de Assis'
    })

    expect(wrapper.text()).toContain('Dom Casmurro')
    expect(wrapper.text()).toContain('Machado de Assis')
    const authorEl = wrapper.find('.caption-author')
    expect(authorEl?.textContent).toBe('Machado de Assis')
    wrapper.unmount()
  })

  it('does not render author element when author is not provided', () => {
    const wrapper = mount(BookCard, {
      title: 'Dom Casmurro'
    })

    expect(wrapper.find('.caption-author')).toBeNull()
    expect(wrapper.find('.overlay-author')).toBeNull()
    wrapper.unmount()
  })

  it('marks visible text elements with aria-hidden="true"', () => {
    const wrapper = mount(BookCard, {
      title: 'Dom Casmurro',
      author: 'Machado de Assis'
    })

    const overlay = wrapper.find('.overlay')
    expect(overlay?.getAttribute('aria-hidden')).toBe('true')

    const caption = wrapper.find('.caption')
    expect(caption?.getAttribute('aria-hidden')).toBe('true')
    wrapper.unmount()
  })

  it('preserves link aria-label unchanged without hearing title twice', () => {
    const wrapper = mount(BookCard, {
      title: 'Dom Casmurro',
      author: 'Machado de Assis'
    })

    const link = wrapper.find('a')
    expect(link?.getAttribute('aria-label')).toBe('Dom Casmurro, de Machado de Assis')
    wrapper.unmount()
  })

  it('preserves link aria-label with rating unchanged', () => {
    const wrapper = mount(BookCard, {
      title: 'Dom Casmurro',
      author: 'Machado de Assis',
      rating: 4.5
    })

    const link = wrapper.find('a')
    expect(link?.getAttribute('aria-label')).toBe('Dom Casmurro, de Machado de Assis (4,5 de 5 estrelas)')
    wrapper.unmount()
  })

  it('contains no interactive elements inside the <a> tag', () => {
    const wrapper = mount(BookCard, {
      title: 'Dom Casmurro',
      author: 'Machado de Assis',
      rating: 5,
      href: '/livro/dom-casmurro'
    })

    const link = wrapper.find('a')
    expect(link).not.toBeNull()
    const interactive = link?.querySelectorAll('a, button, input, select, textarea')
    expect(interactive?.length).toBe(0)
    wrapper.unmount()
  })
})
