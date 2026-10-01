import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import FeedItem from '../../app/components/feed/FeedItem.vue'
import DiaryList from '../../app/components/profile/DiaryList.vue'
import type { FeedEntry } from '../../shared/schemas/feed'
import type { ProfileLogItem } from '../../shared/schemas/profile'

const NuxtLink = defineComponent({
  props: { to: { type: String, required: true } },
  setup(_props, { slots }) {
    return () => h('a', null, slots.default?.())
  },
})

async function renderServer(component: Component, props: Record<string, unknown>): Promise<string> {
  const app = createSSRApp({ render: () => h(component, props) })
  app.component('NuxtLink', NuxtLink)
  return renderToString(app)
}

function scopedStyles(path: string): string {
  const source = readFileSync(resolve(process.cwd(), path), 'utf8')
  const start = source.indexOf('<style scoped>')
  const end = source.indexOf('</style>', start)
  return start < 0 || end < 0 ? '' : source.slice(start + '<style scoped>'.length, end)
}

function ruleBody(styles: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rule = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^{}]*)\\}`, 'm').exec(styles)
  return rule?.[1] ?? ''
}

function blockBody(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker)
  if (markerIndex < 0) return ''
  const open = source.indexOf('{', markerIndex)
  if (open < 0) return ''
  let depth = 0
  for (let index = open; index < source.length; index++) {
    if (source[index] === '{') depth++
    if (source[index] === '}') depth--
    if (depth === 0) return source.slice(open + 1, index)
  }
  return ''
}

describe('scroll reveal progressive enhancement', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['feed rows', 'app/components/feed/FeedItem.vue', '.feed-row'],
    ['diary rows', 'app/components/profile/DiaryList.vue', '.diary-row'],
    ['profile cards', 'app/pages/@[handle]/index.vue', '.book-card-item'],
  ])('%s remain visible in the server-rendered default state', (_name, path, selector) => {
    const styles = scopedStyles(path)
    const baseRule = ruleBody(styles, selector)

    expect(baseRule).not.toMatch(/(?:opacity\s*:\s*0\b|visibility\s*:\s*hidden\b|display\s*:\s*none\b)/)
  })

  it('includes feed and diary text in the server-rendered markup without reveal classes', async () => {
    const feedEntry: FeedEntry = {
      id: '11111111-1111-1111-1111-111111111111',
      rating: 4,
      review_excerpt: 'Comentário visível no servidor',
      started_on: null,
      finished_on: '2024-01-10',
      created_at: '2024-01-10T12:00:00Z',
      user: { handle: 'leitor', display_name: 'Leitor' },
      work: {
        id: '22222222-2222-2222-2222-222222222222',
        title: 'Livro visível no feed',
        slug: 'livro-visivel-no-feed',
        first_published_year: 2020,
        cover_url: null,
        isbn13: '9780000000000',
        authors: [{ id: '33333333-3333-3333-3333-333333333333', name: 'Autora', slug: 'autora' }],
      },
      edition: null,
    }
    const diaryLog: ProfileLogItem = {
      id: '44444444-4444-4444-4444-444444444444',
      rating: 4,
      started_on: null,
      finished_on: '2024-01-10',
      finished_precision: 'dia',
      format: 'fisico',
      visibility: 'publico',
      created_at: '2024-01-10T12:00:00Z',
      work: {
        id: '22222222-2222-2222-2222-222222222222',
        title: 'Livro visível no diário',
        slug: 'livro-visivel-no-diario',
        first_published_year: 2020,
        cover_url: null,
        authors: [{
          id: '33333333-3333-3333-3333-333333333333',
          name: 'Autora',
          slug: 'autora',
          country_code: 'BR',
          country_label: 'Brasil',
        }],
        genres: [],
      },
      edition: {
        id: 'edition-1',
        isbn13: '9780000000000',
        page_count: null,
        published_year: null,
        cover_url: null,
        ol_cover_id: null,
      },
    }

    const feedHtml = await renderServer(FeedItem, { entry: feedEntry })
    const diaryHtml = await renderServer(DiaryList, { logs: [diaryLog] })

    expect(feedHtml).toContain('Livro visível no feed')
    expect(feedHtml).toContain('Comentário visível no servidor')
    expect(feedHtml).not.toContain('reveal-enabled')
    expect(feedHtml).not.toContain('is-revealed')
    expect(feedHtml).toContain('(max-width: 600px)')
    expect(feedHtml).toContain('-S.jpg?default=false')
    expect(diaryHtml).toContain('Livro visível no diário')
    expect(diaryHtml).toContain('-S.jpg?default=false')
    expect(diaryHtml).not.toContain('reveal-enabled')
    expect(diaryHtml).not.toContain('is-revealed')
  })

  it('marks an element revealed when IntersectionObserver is unavailable', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    vi.resetModules()
    const { registerRevealElement } = await import('../../app/composables/useScrollReveal')
    const element = document.createElement('div')

    registerRevealElement(element)

    expect(element.classList.contains('is-revealed')).toBe(true)
    expect(element.classList.contains('reveal-enabled')).toBe(false)
  })

  it('keeps the element visible when the observer rejects registration', async () => {
    class FailingObserver {
      readonly root = null
      readonly rootMargin = '0px'
      readonly thresholds = [0]

      observe(): never {
        throw new Error('observer failed')
      }

      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] { return [] }
    }

    vi.stubGlobal('IntersectionObserver', FailingObserver as unknown as typeof IntersectionObserver)
    vi.resetModules()
    const { registerRevealElement } = await import('../../app/composables/useScrollReveal')
    const element = document.createElement('div')

    expect(() => registerRevealElement(element)).not.toThrow()
    expect(element.classList.contains('is-revealed')).toBe(true)
    expect(element.classList.contains('reveal-enabled')).toBe(false)
  })

  it('keeps the element visible when the observer cannot be constructed', async () => {
    const ConstructorFailureObserver = vi.fn((): never => {
      throw new Error('observer unavailable')
    })

    vi.stubGlobal('IntersectionObserver', ConstructorFailureObserver as unknown as typeof IntersectionObserver)
    vi.resetModules()
    const { registerRevealElement } = await import('../../app/composables/useScrollReveal')
    const element = document.createElement('div')

    expect(() => registerRevealElement(element)).not.toThrow()
    expect(element.classList.contains('is-revealed')).toBe(true)
    expect(element.classList.contains('reveal-enabled')).toBe(false)
  })
})

describe('mobile feed cover sizing', () => {
  it('keeps the narrow feed cover at the 2:3 poster ratio', () => {
    const styles = scopedStyles('app/components/feed/FeedItem.vue')
    const mobileStyles = blockBody(styles, '@media (max-width: 600px)')
    const mobileCoverRule = ruleBody(mobileStyles, '.feed-cover-col')

    expect(mobileCoverRule).toMatch(/width:\s*48px/)
    expect(mobileCoverRule).toMatch(/height:\s*auto/)
    expect(mobileCoverRule).toMatch(/aspect-ratio:\s*2\s*\/\s*3/)
  })
})
