// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import ReadingMap from '../../app/components/profile/ReadingMap.vue'

function mountMap(props: Record<string, unknown>) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(ReadingMap, props)
  app.mount(container)
  return {
    container,
    unmount: () => {
      app.unmount()
      container.remove()
    },
  }
}

describe('ReadingMap.vue - compact map (TASK-052)', () => {
  it('centres the map inside its box with preserveAspectRatio meet', () => {
    const wrapper = mountMap({ countryCounts: { BR: 3 } })
    const svg = wrapper.container.querySelector('svg.world-map-svg')
    expect(svg?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
    wrapper.unmount()
  })

  it('keeps the title row and the unmapped-country note', () => {
    const wrapper = mountMap({ countryCounts: { BR: 3 }, unmappedCountries: ['Roma Antiga'] })
    expect(wrapper.container.querySelector('.map-title')?.textContent).toBe('Mapa de leituras')
    expect(wrapper.container.querySelector('.unmapped-note')?.textContent).toContain('Roma Antiga')
    wrapper.unmount()
  })

  it('still emits the country name when a country with books is clicked', async () => {
    let emitted: string | null = null
    const wrapper = mountMap({
      countryCounts: { BR: 3 },
      onSelect: (country: string) => {
        emitted = country
      },
    })
    const group = wrapper.container.querySelector('g.country-group.has-books')
    group?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(emitted).toBe('Brasil')
    wrapper.unmount()
  })
})
