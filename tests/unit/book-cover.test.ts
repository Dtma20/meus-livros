import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, createSSRApp, h, nextTick, ref, type Ref } from 'vue'
import { renderToString } from '@vue/server-renderer'
import BookCover from '../../app/components/book/BookCover.vue'

type CoverProps = {
  alt: string
  title?: string
  coverUrl?: string | null
  olCoverId?: number | string | null
  isbn13?: string | null
  size?: 'small' | 'medium' | 'large'
  mobileSize?: 'small' | 'medium' | 'large'
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

const PLACEHOLDER_PREFIX = 'data:image/svg+xml;utf8,'
const TOKEN_COLOURS = ['#232a31', '#2c3440', '#f59e0b', '#fff', '#99aabb']

function decodePlaceholder(src: string): string {
  expect(src.startsWith(PLACEHOLDER_PREFIX)).toBe(true)
  return decodeURIComponent(src.slice(PLACEHOLDER_PREFIX.length))
}

function placeholderFor(props: CoverProps): string {
  const wrapper = mount(props)
  const src = wrapper.img()?.getAttribute('src') ?? ''
  wrapper.unmount()
  return decodePlaceholder(src)
}

function titleLines(svg: string): string[] {
  return Array.from(svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g), match => match[1] ?? '')
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

  it('uses the medium ISBN cover by default and offers the large Open Library source at 2x', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () => h(BookCover, {
          alt: 'Capa ISBN',
          isbn13: '9780000000000',
          loading: 'eager',
        })
      })
    )
    const img = new DOMParser().parseFromString(html, 'text/html').querySelector('img')

    expect(img?.getAttribute('src')).toBe(
      'https://covers.openlibrary.org/b/isbn/9780000000000-M.jpg?default=false'
    )
    expect(img?.getAttribute('srcset')).toBe(
      'https://covers.openlibrary.org/b/isbn/9780000000000-M.jpg?default=false 1x, ' +
      'https://covers.openlibrary.org/b/isbn/9780000000000-L.jpg?default=false 2x'
    )
    expect(img?.getAttribute('decoding')).toBe('async')
    expect(img?.getAttribute('loading')).toBe('eager')
    expect(img?.getAttribute('fetchpriority')).toBe('high')
  })

  it('uses Open Library small and medium variants for a small slot', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () => h(BookCover, {
          alt: 'Capa pequena',
          isbn13: '9780000000000',
          size: 'small',
        })
      })
    )
    const img = new DOMParser().parseFromString(html, 'text/html').querySelector('img')

    expect(img?.getAttribute('src')).toBe(
      'https://covers.openlibrary.org/b/isbn/9780000000000-S.jpg?default=false'
    )
    expect(img?.getAttribute('srcset')).toBe(
      'https://covers.openlibrary.org/b/isbn/9780000000000-S.jpg?default=false 1x, ' +
      'https://covers.openlibrary.org/b/isbn/9780000000000-M.jpg?default=false 2x'
    )
  })

  it('keeps Open Library ID covers on the S/M path without the ISBN default flag', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () => h(BookCover, {
          alt: 'Capa por ID',
          olCoverId: 123,
          size: 'small',
        })
      })
    )
    const img = new DOMParser().parseFromString(html, 'text/html').querySelector('img')

    expect(img?.getAttribute('src')).toBe('https://covers.openlibrary.org/b/id/123-S.jpg')
    expect(img?.getAttribute('srcset')).toBe(
      'https://covers.openlibrary.org/b/id/123-S.jpg 1x, ' +
      'https://covers.openlibrary.org/b/id/123-M.jpg 2x'
    )
  })

  it('offers a smaller Open Library source at the feed mobile breakpoint', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () => h(BookCover, {
          alt: 'Capa responsiva',
          isbn13: '9780000000000',
          mobileSize: 'small',
        })
      })
    )
    const document = new DOMParser().parseFromString(html, 'text/html')
    const source = document.querySelector('source')
    const img = document.querySelector('img')

    expect(source?.getAttribute('media')).toBe('(max-width: 600px)')
    expect(source?.getAttribute('srcset')).toContain('-S.jpg?default=false 1x')
    expect(img?.getAttribute('src')).toContain('-M.jpg?default=false')
  })

  it('keeps a stored external cover ahead of the ISBN fallback', async () => {
    const amazonCover = 'https://images-na.ssl-images-amazon.com/images/I/cover.jpg'
    const html = await renderToString(
      createSSRApp({
        render: () => h(BookCover, {
          alt: 'Capa externa',
          coverUrl: amazonCover,
          isbn13: '9780000000000',
          mobileSize: 'small',
        })
      })
    )
    const document = new DOMParser().parseFromString(html, 'text/html')
    const img = document.querySelector('img')

    expect(img?.getAttribute('src')).toBe(amazonCover)
    expect(img?.hasAttribute('srcset')).toBe(false)
    expect(document.querySelector('source')).toBeNull()
    expect(img?.getAttribute('loading')).toBe('lazy')
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
      'https://covers.openlibrary.org/b/isbn/9780000000000-M.jpg?default=false'
    )
    expect(wrapper.root()?.classList.contains('is-loading')).toBe(true)

    wrapper.img()?.dispatchEvent(new Event('error'))
    await nextTick()
    await nextTick()

    const src = wrapper.img()?.getAttribute('src') ?? ''
    expect(src.startsWith('data:image/svg+xml')).toBe(true)
    expect(decodePlaceholder(src)).toContain('>Livro<')
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

describe('BookCover.vue missing-cover placeholder', () => {
  it('renders the title over a spine for "O retorno do rei"', () => {
    const svg = placeholderFor({ alt: 'Capa de O retorno do rei', title: 'O retorno do rei' })

    expect(titleLines(svg)).toEqual(['O retorno do', 'rei'])
    expect(svg).toContain('#f59e0b')
    expect(svg).toContain('font-family="Lora, Georgia, serif"')
    expect(svg).toContain('fill-opacity="0.85"')
    expect(svg).toContain('viewBox="0 0 200 300"')
  })

  it('escapes & and < in the title', () => {
    const svg = placeholderFor({ alt: 'Capa de Tom & Jerry <3', title: 'Tom & Jerry <3' })

    expect(titleLines(svg)).toEqual(['Tom &amp; Jerry &lt;3'])
    expect(svg).not.toContain('Tom & Jerry')
    expect(svg).not.toContain('<3')
  })

  it('escapes quotes in the title and the author', () => {
    const svg = placeholderFor({
      alt: 'Capa de "Ela" e \'ele\', de O\'Brien & Filhos',
      title: '"Ela" e \'ele\''
    })

    expect(svg).toContain('&quot;Ela&quot; e &apos;ele&apos;')
    expect(svg).toContain('O&apos;Brien &amp; Filhos')
  })

  it('wraps to at most three lines of about fourteen characters', () => {
    const svg = placeholderFor({
      alt: 'Capa',
      title: 'Crônica de uma morte anunciada e outras histórias'
    })
    const lines = titleLines(svg)

    expect(lines.length).toBe(3)
    for (const line of lines) {
      expect(Array.from(line).length).toBeLessThanOrEqual(14)
    }
    expect(lines[2]?.endsWith('…')).toBe(true)
  })

  it('cuts a single word longer than a line', () => {
    const svg = placeholderFor({ alt: 'Capa', title: 'Anticonstitucionalissimamente' })
    const lines = titleLines(svg)

    expect(lines).toHaveLength(1)
    expect(Array.from(lines[0] ?? '').length).toBe(14)
    expect(lines[0]?.endsWith('…')).toBe(true)
  })

  it('writes the author below the title when the alt names one', () => {
    const svg = placeholderFor({
      alt: 'Capa de O retorno do rei, de J. R. R. Tolkien',
      title: 'O retorno do rei'
    })

    expect(svg).toMatch(/<text[^>]*fill="#99aabb"[^>]*>J\. R\. R\. Tolkien<\/text>/)
    expect(svg.indexOf('J. R. R. Tolkien')).toBeGreaterThan(svg.indexOf('>rei<'))
  })

  it('omits the author when the alt does not name one', () => {
    const svg = placeholderFor({ alt: 'Capa de O retorno do rei', title: 'O retorno do rei' })

    expect(svg.match(/<text/g)).toHaveLength(1)
  })

  it('keeps the initials fallback when there is no title', () => {
    const svg = placeholderFor({ alt: '' })

    expect(svg).not.toContain('<tspan')
    expect(svg).toContain('>?</text>')
    expect(svg).toContain('#f59e0b')
  })

  it('uses only token colours', () => {
    const samples = [
      placeholderFor({ alt: 'Capa de O retorno do rei, de J. R. R. Tolkien', title: 'O retorno do rei' }),
      placeholderFor({ alt: '' })
    ]

    for (const svg of samples) {
      const colours = svg.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
      expect(colours.length).toBeGreaterThan(0)
      for (const colour of colours) {
        expect(TOKEN_COLOURS).toContain(colour.toLowerCase())
      }
      expect(svg).not.toMatch(/rgba?\(|hsla?\(/)
    }
  })

  it('builds the same placeholder on the server and on the client', async () => {
    const props: CoverProps = {
      alt: 'Capa de Tom & Jerry <3, de Hanna-Barbera',
      title: 'Tom & Jerry <3'
    }
    const html = await renderToString(createSSRApp({ render: () => h(BookCover, props) }))
    const serverSrc = new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector('img')
      ?.getAttribute('src')

    const wrapper = mount(props)
    const clientSrc = wrapper.img()?.getAttribute('src')
    wrapper.unmount()

    expect(serverSrc).toBeTruthy()
    expect(serverSrc).toBe(clientSrc)
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

  it('paints a broken cover alt text in the text colour, never UA link blue', () => {
    expect(source).toMatch(/\.book-cover-img\s*\{[^}]*color:\s*var\(--text-color\)/)
  })

  it('turns off the shimmer and the fade under prefers-reduced-motion', () => {
    const block = reducedMotionBlock()

    expect(block).toMatch(/\.book-cover\s*\{[^}]*animation:\s*none/)
    expect(block).toMatch(/\.book-cover\s*\{[^}]*background-image:\s*none/)
    expect(block).toMatch(/\.book-cover-img\s*\{[^}]*transition:\s*none/)
  })
})
