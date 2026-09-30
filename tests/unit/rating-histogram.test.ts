// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, type Component } from 'vue'
import RatingHistogram from '../../app/components/book/RatingHistogram.vue'

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

describe('RatingHistogram.vue', () => {
  it('renders ten bars with [5, 5, 4.5, 1], the 5 bar is the tallest, and the label mentions "5 estrelas"', () => {
    const wrapper = mount(RatingHistogram, { ratings: [5, 5, 4.5, 1] })

    const bars = wrapper.findAll<HTMLElement>('.histogram-bar')
    expect(bars).toHaveLength(10)

    const bar5 = wrapper.find<HTMLElement>('[data-rating="5"] .histogram-bar') ?? wrapper.find<HTMLElement>('.histogram-bar[data-rating="5"]')
    expect(bar5).not.toBeNull()
    const height5 = parseFloat(bar5?.style.height || '0')
    expect(height5).toBe(100)

    for (const bar of bars) {
      if (bar !== bar5) {
        const h = parseFloat(bar.style.height || '0')
        expect(h).toBeLessThan(height5)
      }
    }

    const img = wrapper.find('[role="img"]')
    expect(img).not.toBeNull()
    const label = img?.getAttribute('aria-label') ?? ''
    expect(label).toContain('5 estrelas')

    const stars = wrapper.findAll('.histogram-star-label')
    expect(stars).toHaveLength(2)

    wrapper.unmount()
  })

  it('renders nothing when ratings is empty', () => {
    const wrapperEmpty = mount(RatingHistogram, { ratings: [] })
    expect(wrapperEmpty.html()).toBe('<!--v-if-->')
    expect(wrapperEmpty.find('.rating-histogram')).toBeNull()
    wrapperEmpty.unmount()

    const wrapperUndefined = mount(RatingHistogram, {})
    expect(wrapperUndefined.html()).toBe('<!--v-if-->')
    expect(wrapperUndefined.find('.rating-histogram')).toBeNull()
    wrapperUndefined.unmount()
  })

  it('large variant lists every half-star value, highest first, with its visible count', () => {
    const wrapper = mount(RatingHistogram, { ratings: [5, 5, 4.5, 1], size: 'large' })

    expect(wrapper.find('.rating-histogram')).toBeNull()
    const rows = wrapper.findAll<HTMLElement>('.histogram-row')
    expect(rows).toHaveLength(10)
    expect(rows[0]?.dataset.rating).toBe('5')
    expect(rows[9]?.dataset.rating).toBe('0.5')

    const row45 = wrapper.find('.histogram-row[data-rating="4.5"]')
    expect(row45?.querySelector('.histogram-row-label')?.textContent?.trim()).toBe('4,5 ★ estrelas:')
    expect(row45?.querySelector('.histogram-row-count')?.textContent?.trim()).toBe('1 avaliação')
    expect(wrapper.find('.histogram-row[data-rating="5"] .histogram-row-count')?.textContent?.trim()).toBe('2 avaliações')
    expect(wrapper.find('.histogram-row[data-rating="3"] .histogram-row-count')?.textContent?.trim()).toBe('0 avaliações')
    wrapper.unmount()
  })

  it('large variant renders nothing without ratings', () => {
    const wrapper = mount(RatingHistogram, { ratings: [], size: 'large' })
    expect(wrapper.html()).toBe('<!--v-if-->')
    wrapper.unmount()
  })
})
