// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, createSSRApp, h, nextTick, ref, type Ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import BookCover from '../../app/components/book/BookCover.vue'

type CoverProps = {
  alt: string
  title?: string
  coverUrl?: string | null
  olCoverId?: number | string | null
  isbn13?: string | null
}

function mount(initial: CoverProps) {
  const props: Ref<CoverProps> = ref(initial)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp({ render: () => h(BookCover, props.value) })
  app.mount(container)

  return {
    props,
    root: () => container.querySelector<HTMLElement>('.book-cover'),
    img: () => container.querySelector<HTMLImageElement>('img'),
    unmount: () => {
      app.unmount()
      container.remove()
    }
  }
}

function stubImageState(complete: boolean, naturalWidth: number) {
  const proto: object = Object.getPrototypeOf(document.createElement('img'))
  const originals = {
    complete: Object.getOwnPropertyDescriptor(proto, 'complete'),
    naturalWidth: Object.getOwnPropertyDescriptor(proto, 'naturalWidth')
  }
  Object.defineProperty(proto, 'complete', { configurable: true, get: () => complete })
  Object.defineProperty(proto, 'naturalWidth', { configurable: true, get: () => naturalWidth })

  return () => {
    for (const key of ['complete', 'naturalWidth'] as const) {
      const descriptor = originals[key]
      if (descriptor) {
        Object.defineProperty(proto, key, descriptor)
      } else {
        Reflect.deleteProperty(proto, key)
      }
    }
  }
}

describe('BookCover.vue server render', () => {
  it('renders the cover visible, without the loading state, before mount', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () => h(BookCover, { alt: 'Capa HTTPS', coverUrl: 'https://example.com/cover.jpg' })
      })
    )

    expect(html).toContain('class="book-cover"')
    expect(html).toContain('src="https://example.com/cover.jpg"')
    expect(html).not.toContain('is-loading')
    expect(html).not.toContain('is-loaded')
  })
})

describe('BookCover.vue loading placeholder', () => {
  let restore: (() => void) | null = null

  afterEach(() => {
    restore?.()
    restore = null
  })

  it('hides the image on mount when it is not complete, and shows it on load', async () => {
    restore = stubImageState(false, 0)
    const wrapper = mount({ alt: 'Capa HTTPS', coverUrl: 'https://example.com/cover.jpg' })
    await nextTick()

    expect(wrapper.root()?.classList.contains('is-loading')).toBe(true)
    expect(wrapper.root()?.classList.contains('is-loaded')).toBe(false)

    wrapper.img()?.dispatchEvent(new Event('load'))
    await nextTick()

    expect(wrapper.root()?.classList.contains('is-loading')).toBe(false)
    expect(wrapper.root()?.classList.contains('is-loaded')).toBe(true)
    wrapper.unmount()
  })

  it('never hides an image that is already complete on mount', async () => {
    restore = stubImageState(true, 180)
    const wrapper = mount({ alt: 'Capa em cache', coverUrl: 'https://example.com/cached.jpg' })
    await nextTick()

    expect(wrapper.root()?.classList.contains('is-loading')).toBe(false)
    expect(wrapper.root()?.classList.contains('is-loaded')).toBe(true)
    wrapper.unmount()
  })

  it('does not hide an image that finished with an error before mount', async () => {
    restore = stubImageState(true, 0)
    const wrapper = mount({ alt: 'Capa quebrada', coverUrl: 'https://example.com/broken.jpg' })
    await nextTick()

    expect(wrapper.root()?.classList.contains('is-loading')).toBe(false)
    wrapper.unmount()
  })

  it('on error removes the loading state and falls back to the svg placeholder', async () => {
    restore = stubImageState(false, 0)
    const wrapper = mount({ alt: 'Capa 404', title: 'Livro Desconhecido', isbn13: '9780000000000' })
    await nextTick()
    expect(wrapper.img()?.getAttribute('src')).toBe(
      'https://covers.openlibrary.org/b/isbn/9780000000000-L.jpg?default=false'
    )
    expect(wrapper.root()?.classList.contains('is-loading')).toBe(true)

    wrapper.img()?.dispatchEvent(new Event('error'))
    await nextTick()
    await nextTick()

    const src = wrapper.img()?.getAttribute('src') ?? ''
    expect(src.startsWith('data:image/svg+xml')).toBe(true)
    expect(src).toContain('LD')
    expect(wrapper.root()?.classList.contains('is-loading')).toBe(false)
    wrapper.unmount()
  })

  it('never hides the svg placeholder', async () => {
    restore = stubImageState(false, 0)
    const wrapper = mount({ alt: 'Capa de Dom Casmurro', title: 'Dom Casmurro' })
    await nextTick()

    expect(wrapper.img()?.getAttribute('src')?.startsWith('data:image/svg+xml')).toBe(true)
    expect(wrapper.root()?.classList.contains('is-loading')).toBe(false)
    wrapper.unmount()
  })

  it('hides again when the cover changes to an image that is not complete', async () => {
    restore = stubImageState(false, 0)
    const wrapper = mount({ alt: 'Capa', coverUrl: 'https://example.com/a.jpg' })
    await nextTick()
    wrapper.img()?.dispatchEvent(new Event('load'))
    await nextTick()
    expect(wrapper.root()?.classList.contains('is-loading')).toBe(false)

    wrapper.props.value = { alt: 'Capa', coverUrl: 'https://example.com/b.jpg' }
    await nextTick()
    await nextTick()

    expect(wrapper.img()?.getAttribute('src')).toBe('https://example.com/b.jpg')
    expect(wrapper.root()?.classList.contains('is-loading')).toBe(true)
    expect(wrapper.root()?.classList.contains('is-loaded')).toBe(false)
    wrapper.unmount()
  })
})

describe('BookCover.vue styles', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'app/components/book/BookCover.vue'),
    'utf-8'
  )

  function reducedMotionBlock(): string {
    const start = source.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(start).toBeGreaterThan(-1)
    const open = source.indexOf('{', start)
    let depth = 0
    for (let i = open; i < source.length; i++) {
      if (source[i] === '{') depth++
      if (source[i] === '}') depth--
      if (depth === 0) return source.slice(open, i + 1)
    }
    return ''
  }

  it('builds the shimmer from the card and input tokens and stops it after load', () => {
    expect(source).toContain('background-color: var(--card-bg)')
    expect(source).toContain('var(--input-bg)')
    expect(source).toMatch(/animation:\s*book-cover-shimmer/)
    expect(source).toMatch(/transition:\s*opacity 0\.2s/)
    expect(source).toMatch(/\.book-cover\.is-loaded\s*\{[^}]*animation:\s*none/)
  })

  it('turns off the shimmer and the fade under prefers-reduced-motion', () => {
    const block = reducedMotionBlock()

    expect(block).toMatch(/\.book-cover\s*\{[^}]*animation:\s*none/)
    expect(block).toMatch(/\.book-cover\s*\{[^}]*background-image:\s*none/)
    expect(block).toMatch(/\.book-cover-img\s*\{[^}]*transition:\s*none/)
  })
})
