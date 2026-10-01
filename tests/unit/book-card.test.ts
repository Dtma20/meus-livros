import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
    wrapper.unmount()
  })

  it('marks the text block with aria-hidden="true"', () => {
    const wrapper = mount(BookCard, {
      title: 'Dom Casmurro',
      author: 'Machado de Assis'
    })

    const caption = wrapper.find('.caption')
    expect(caption?.getAttribute('aria-hidden')).toBe('true')
    expect(caption?.querySelector('.caption-title')).not.toBeNull()
    expect(caption?.querySelector('.caption-author')).not.toBeNull()
    wrapper.unmount()
  })

  it('renders the title and author text exactly once', () => {
    const wrapper = mount(BookCard, {
      title: 'Dom Casmurro',
      author: 'Machado de Assis',
      rating: 4.5
    })

    const text = wrapper.container.textContent ?? ''
    expect(text.split('Dom Casmurro').length - 1).toBe(1)
    expect(text.split('Machado de Assis').length - 1).toBe(1)
    expect(wrapper.findAll('.caption')).toHaveLength(1)
    expect(wrapper.findAll('.caption-title')).toHaveLength(1)
    expect(wrapper.findAll('.caption-author')).toHaveLength(1)
    expect(wrapper.find('.overlay')).toBeNull()
    wrapper.unmount()
  })

  it('keeps the text block outside the poster so it can flow under it', () => {
    const wrapper = mount(BookCard, {
      title: 'Dom Casmurro',
      author: 'Machado de Assis'
    })

    const poster = wrapper.find('.poster')
    expect(poster).not.toBeNull()
    expect(poster?.querySelector('.caption')).toBeNull()
    expect(wrapper.find('.media > .caption')).not.toBeNull()
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

describe('BookCard.vue row alignment styles', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'app/components/book/BookCard.vue'),
    'utf-8'
  )

  function ruleBody(selector: string): string {
    const start = source.indexOf(`\n${selector} {`)
    expect(start).toBeGreaterThan(-1)
    const open = source.indexOf('{', start)
    return source.slice(open, source.indexOf('}', open) + 1)
  }

  it('fills the grid cell as a column flex so the stars can sink to the bottom', () => {
    const card = ruleBody('.card')
    expect(card).toMatch(/display:\s*flex/)
    expect(card).toMatch(/flex-direction:\s*column/)
    expect(card).toMatch(/height:\s*100%/)
    expect(ruleBody('.info')).toMatch(/margin-top:\s*auto/)
  })

  it('reserves two title lines and one author line under the cover on touch', () => {
    expect(ruleBody('.caption')).toMatch(
      /min-height:\s*calc\(var\(--font-size-xs\)\s*\*\s*var\(--line-height-tight\)\s*\*\s*3\s*\+\s*var\(--space-1\)\)/
    )
  })

  it('keeps title and author visible on every device, with no hover-only overlay', () => {
    expect(source).not.toContain('@media (hover: hover) and (pointer: fine)')
    expect(ruleBody('.caption')).not.toMatch(/opacity:\s*0/)
    expect(ruleBody('.caption')).not.toMatch(/position:\s*absolute/)
  })
})
