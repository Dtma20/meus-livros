// @vitest-environment happy-dom
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, type Component } from 'vue'
import LandingChapter from '../../app/components/landing/LandingChapter.vue'

const LandingSceneMediaStub = defineComponent({
  name: 'LandingSceneMedia',
  props: { scene: { type: Number, required: true } },
  template: '<div class="landing-scene-media-stub" :data-scene="scene" />',
})

function mount(component: Component, props: Record<string, unknown> = {}, slots: Record<string, () => unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp({
    render: () => h(component, props, slots),
  })
  app.component('LandingSceneMedia', LandingSceneMediaStub)
  app.mount(container)

  return {
    container,
    unmount: () => {
      app.unmount()
      container.remove()
    },
  }
}

describe('LandingChapter.vue', () => {
  it('renders copy before media in DOM order so text provides context before images on single-column layouts', () => {
    const wrapper = mount(
      LandingChapter,
      { scene: 2 },
      { default: () => h('p', { class: 'test-copy' }, 'Texto do capítulo') },
    )

    const inner = wrapper.container.querySelector('.chapter-inner')
    expect(inner).not.toBeNull()

    const children = Array.from(inner!.children)
    expect(children.length).toBe(2)
    expect(children[0]?.classList.contains('chapter-copy')).toBe(true)
    expect(children[1]?.classList.contains('chapter-media')).toBe(true)

    wrapper.unmount()
  })

  it('does not invert chapter media order with order: -1 so images are never adjacent across consecutive chapters', () => {
    const filePath = path.resolve(__dirname, '../../app/components/landing/LandingChapter.vue')
    const source = fs.readFileSync(filePath, 'utf-8')

    // Neither chapter-media nor any scene-specific selector should pull media before copy
    expect(source).not.toMatch(/order:\s*-1/)
    expect(source).not.toMatch(/\[data-scene=['"]?1['"]?\].*order/s)
  })
})
