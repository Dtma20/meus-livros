// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, type Component, nextTick } from 'vue'
import NewPostsPill from '../../app/components/feed/NewPostsPill.vue'

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

describe('NewPostsPill.vue', () => {
  it('does not render button when visible is false', () => {
    const wrapper = mount(NewPostsPill, { visible: false })
    const button = wrapper.find('button.new-posts-pill')
    expect(button).toBeNull()
    wrapper.unmount()
  })

  it('renders button and arrow when visible is true', () => {
    const wrapper = mount(NewPostsPill, { visible: true })
    const button = wrapper.find('button.new-posts-pill')
    expect(button).not.toBeNull()
    expect(wrapper.text()).toContain('↑')
    expect(wrapper.text()).toContain('Novas atividades no grupo')
    wrapper.unmount()
  })

  it('renders custom label when provided', () => {
    const wrapper = mount(NewPostsPill, {
      visible: true,
      label: 'Novas atividades',
    })
    expect(wrapper.text()).toContain('Novas atividades')
    wrapper.unmount()
  })

  it('renders count badge when count is greater than 1', () => {
    const wrapper = mount(NewPostsPill, {
      visible: true,
      count: 5,
    })
    const badge = wrapper.find('.pill-badge')
    expect(badge).not.toBeNull()
    expect(badge?.textContent?.trim()).toBe('5')
    wrapper.unmount()
  })

  it('does not render count badge when count is 1 or 0', () => {
    const wrapperOne = mount(NewPostsPill, {
      visible: true,
      count: 1,
    })
    expect(wrapperOne.find('.pill-badge')).toBeNull()
    wrapperOne.unmount()

    const wrapperZero = mount(NewPostsPill, {
      visible: true,
      count: 0,
    })
    expect(wrapperZero.find('.pill-badge')).toBeNull()
    wrapperZero.unmount()
  })

  it('has accessible aria-live region and aria-label', () => {
    const wrapper = mount(NewPostsPill, {
      visible: true,
      count: 3,
    })
    const container = wrapper.find('.new-posts-pill-container')
    expect(container?.getAttribute('aria-live')).toBe('polite')

    const button = wrapper.find('button.new-posts-pill')
    expect(button?.getAttribute('aria-label')).toContain('3 novas atividades')
    wrapper.unmount()
  })

  it('emits click event when clicked', async () => {
    let clicked = false
    const wrapper = mount(NewPostsPill, {
      visible: true,
      onClick: () => {
        clicked = true
      },
    })
    const button = wrapper.find('button.new-posts-pill')
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(clicked).toBe(true)
    wrapper.unmount()
  })
})
