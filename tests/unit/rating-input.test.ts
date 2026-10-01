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
  const touch = mediaBody(css, '(hover: none)')
  const touchWrapper = ruleDeclarations(touch, '.star-wrapper')
  const touchTrack = ruleDeclarations(touch, '.stars-track')
  const baseHalf = ruleDeclarations(css, '.star-half')

  it('gives each half-star at least 24px of width', () => {
    expect(baseHalf.width).toBe('50%')
    expect(toPx(touchWrapper.width) / 2).toBeGreaterThanOrEqual(24)
  })

  it('makes the control at least 44px tall', () => {
    expect(toPx(touchWrapper.height)).toBeGreaterThanOrEqual(44)
    expect(baseHalf.height).toBe('100%')
  })

  it('fits five stars and four gaps in 343px', () => {
    const total = 5 * toPx(touchWrapper.width) + 4 * toPx(touchTrack.gap)
    expect(total).toBeLessThanOrEqual(343)
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
    const app = createApp(RatingInput, props)
    app.mount(container)
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
    const slider = wrapper.container.querySelector('[role="slider"]')
    expect(slider?.getAttribute('aria-valuetext')).toBe('2 de 5 estrelas')
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
    const slider = wrapper.container.querySelector<HTMLElement>('[role="slider"]')
    for (const key of ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown']) {
      slider?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      await nextTick()
    }
    expect(emitted).toEqual([2.5, 2.5, 1.5, 1.5])
    wrapper.unmount()
  })
})
