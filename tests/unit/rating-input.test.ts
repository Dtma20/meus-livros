import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import RatingInput from '../../app/components/book/RatingInput.vue'

vi.hoisted(() => {
  const globalScope = globalThis as unknown as Record<string, unknown>
  globalScope.useId = () => 'test-rating-id'
})

const componentSource = fs.readFileSync(path.resolve('app/components/book/RatingInput.vue'), 'utf-8')
const tokensSource = fs.readFileSync(path.resolve('app/assets/css/tokens.css'), 'utf-8')

function styleBlock(source: string): string {
  const match = source.match(/<style[^>]*>([\s\S]*?)<\/style>/)
  if (!match?.[1]) throw new Error('style block not found')
  return match[1]
}

function bracedBody(css: string, openIndex: number): string {
  let depth = 0
  for (let i = openIndex; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return css.slice(openIndex + 1, i)
    }
  }
  throw new Error('unbalanced braces')
}

function mediaBody(css: string, query: string): string {
  const start = css.indexOf(`@media ${query}`)
  if (start === -1) throw new Error(`@media ${query} not found`)
  return bracedBody(css, css.indexOf('{', start))
}

function ruleDeclarations(css: string, selector: string): Record<string, string> {
  const pattern = new RegExp(`(^|[\\s}])${selector.replace('.', '\\.')}\\s*\\{`)
  const match = pattern.exec(css)
  if (!match) throw new Error(`rule ${selector} not found`)
  const body = bracedBody(css, match.index + match[0].length - 1)
  const declarations: Record<string, string> = {}
  for (const part of body.split(';')) {
    const [prop, ...rest] = part.split(':')
    if (prop && rest.length > 0) declarations[prop.trim()] = rest.join(':').trim()
  }
  return declarations
}

function toPx(value: string | undefined): number {
  if (value === undefined) throw new Error('missing value')
  const trimmed = value.trim()
  if (trimmed === '0') return 0
  const px = trimmed.match(/^(\d+(?:\.\d+)?)px$/)
  if (px?.[1]) return Number(px[1])
  const token = trimmed.match(/^var\((--[\w-]+)\)$/)
  if (token?.[1]) {
    const definition = tokensSource.match(new RegExp(`${token[1]}:\\s*([^;]+);`))
    return toPx(definition?.[1])
  }
  throw new Error(`cannot resolve ${trimmed} to px`)
}

describe('RatingInput.vue - touch target under (hover: none)', () => {
  const css = styleBlock(componentSource)
  const touch = mediaBody(css, '(hover: none), (pointer: coarse)')
  const touchWrapper = ruleDeclarations(touch, '.star-wrapper')
  const touchTrack = ruleDeclarations(touch, '.stars-track')
  const touchSlider = ruleDeclarations(css, '.rating-slider')
  const touchClear = ruleDeclarations(touch, '.clear-rating-btn')

  it('uses one 44px-wide target per star for half-step pointer input', () => {
    expect(toPx(touchWrapper.width)).toBe(44)
    expect(touchSlider.left).toBe('var(--space-2)')
    expect(touchSlider.top).toBe('var(--space-1)')
    expect(touchSlider.width).toBe('calc(100% - var(--space-2) - var(--space-2))')
    expect(touchSlider.height).toBe('calc(100% - var(--space-1) - var(--space-1))')
  })

  it('keeps the full slider within a 320px mobile content area', () => {
    expect(toPx(touchWrapper.height)).toBeGreaterThanOrEqual(44)
    const total = 5 * toPx(touchWrapper.width) + 4 * toPx(touchTrack.gap)
    const controlWidth = total + 2 * toPx('var(--space-2)')
    expect(controlWidth).toBeLessThanOrEqual(288)
    expect(toPx(touchClear['min-height'] ?? '0')).toBeGreaterThanOrEqual(44)
    expect(toPx(touchClear['min-width'] ?? '0')).toBeGreaterThanOrEqual(44)
  })

  it('keeps the desktop star at 28px', () => {
    const baseWrapper = ruleDeclarations(css, '.star-wrapper')
    expect(toPx(baseWrapper.width)).toBe(28)
    expect(toPx(baseWrapper.height)).toBe(28)
  })
})

describe('RatingInput.vue - behaviour kept', () => {
  function mountComponent(props: Record<string, unknown> = {}) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    if (typeof props.labelledBy === 'string') {
      const label = document.createElement('span')
      label.id = props.labelledBy
      label.textContent = 'Sua avaliação'
      container.appendChild(label)
    }
    const appRoot = document.createElement('div')
    container.appendChild(appRoot)
    const app = createApp(RatingInput, props)
    app.mount(appRoot)
    return {
      container,
      unmount: () => {
        app.unmount()
        container.remove()
      },
    }
  }

  it('is still a slider', () => {
    const wrapper = mountComponent({ modelValue: 2 })
    const slider = wrapper.container.querySelector<HTMLInputElement>('input[type="range"]')
    expect(slider?.getAttribute('aria-valuetext')).toBe('2 de 5 estrelas')
    expect(slider?.value).toBe('2')
    wrapper.unmount()
  })

  it('moves by 0.5 with each arrow key', async () => {
    const emitted: (number | null)[] = []
    const wrapper = mountComponent({
      modelValue: 2,
      'onUpdate:modelValue': (val: number | null) => {
        emitted.push(val)
      },
    })
    const slider = wrapper.container.querySelector<HTMLInputElement>('input[type="range"]')
    for (const key of ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown']) {
      slider?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      await nextTick()
    }
    expect(emitted).toEqual([2.5, 2.5, 1.5, 1.5])
    wrapper.unmount()
  })

  it('maps pointer range input to half-star values', async () => {
    const emitted: (number | null)[] = []
    const wrapper = mountComponent({
      modelValue: 2,
      'onUpdate:modelValue': (val: number | null) => emitted.push(val),
    })
    const slider = wrapper.container.querySelector<HTMLInputElement>('input[type="range"]')
    if (!slider) throw new Error('rating slider not found')

    slider.value = '4.5'
    slider.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    expect(emitted).toEqual([4.5])
    wrapper.unmount()
  })

  it('uses the visible label as the slider name', () => {
    const wrapper = mountComponent({ labelledBy: 'rating-label' })
    const slider = wrapper.container.querySelector<HTMLInputElement>('input[type="range"]')

    expect(slider?.getAttribute('aria-labelledby')).toBe('rating-label')
    expect(wrapper.container.querySelector('#rating-label')?.textContent).toBe('Sua avaliação')
    expect(slider?.hasAttribute('aria-label')).toBe(false)
    wrapper.unmount()
  })

  it('removes a disabled slider from focus and interaction', async () => {
    const emitted: (number | null)[] = []
    const wrapper = mountComponent({
      modelValue: 3,
      disabled: true,
      'onUpdate:modelValue': (val: number | null) => emitted.push(val),
    })
    const slider = wrapper.container.querySelector<HTMLInputElement>('input[type="range"]')
    if (!slider) throw new Error('rating slider not found')

    expect(slider.disabled).toBe(true)
    expect(slider.tabIndex).toBe(-1)
    slider.focus()
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    slider.value = '4'
    slider.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    expect(document.activeElement).not.toBe(slider)
    expect(emitted).toEqual([])
    expect(wrapper.container.querySelector('.clear-rating-btn')).toBeNull()
    wrapper.unmount()
  })
})
