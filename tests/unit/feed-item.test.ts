// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import FeedItem from '../../app/components/feed/FeedItem.vue'
import type { FeedEntry } from '../../shared/schemas/feed'

vi.mock('../../app/components/book/BookCover.vue', () => ({ default: { render: () => null } }))
vi.mock('../../app/components/book/StarRating.vue', () => ({ default: { render: () => null } }))
vi.mock('../../app/composables/useScrollReveal', () => ({ vReveal: {} }))
const cleanup: (() => void)[] = []
const fetchMock = vi.fn().mockResolvedValue({ comments: [], nextCursor: null })
const entry: FeedEntry = {
  id: 'log-1', rating: 4, review_excerpt: 'Uma resenha.', created_at: '2026-10-01T12:00:00Z',
  user: { handle: 'reader', display_name: 'Reader' },
  work: { id: 'work', title: 'Meu livro', slug: 'meu-livro', first_published_year: null, cover_url: null, authors: [] }, edition: null,
}
function mount(value: FeedEntry) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(FeedItem, { entry: value })
  app.component('NuxtLink', defineComponent({ props: ['to'], setup: (p, { slots }) => () => h('a', { href: p.to }, slots.default?.()) }))
  app.mount(container)
  cleanup.push(() => { app.unmount(); container.remove() })
  return container
}
beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal('useState', () => ref({ user: null }))
  vi.stubGlobal('$fetch', fetchMock)
})
afterEach(() => { cleanup.splice(0).forEach((dispose) => dispose()); vi.unstubAllGlobals() })
describe('Feed item discussions and block navigation', () => {
  it('keeps the review conversation on its parent log', async () => {
    const container = mount(entry)
    expect(container.querySelector('a.feed-work-title')?.getAttribute('href')).toBe('/entrada/log-1')
    container.querySelector<HTMLButtonElement>('.discussion-toggle')!.click()
    for (let i = 0; i < 5; i++) await nextTick()
    expect(fetchMock).toHaveBeenCalledWith('/api/logs/log-1/comments', expect.objectContaining({ query: expect.objectContaining({ block_id: undefined }) }))
  })
  it('shows unannotated blocks with page range and a separate conversation', async () => {
    const container = mount({ ...entry, id: 'block-1', log_id: 'log-1', kind: 'reading_block', rating: null, review_excerpt: null,
      block: { id: 'block-1', start_page: 12, end_page: 25, comment: null, read_at: '2026-09-30' } })
    expect(container.textContent).toContain('leu um trecho de')
    expect(container.textContent).toContain('Páginas 12 a 25')
    expect(container.querySelector('a.feed-work-title')?.getAttribute('href')).toBe('/entrada/log-1#trecho-block-1')
    container.querySelector<HTMLButtonElement>('.discussion-toggle')!.click()
    for (let i = 0; i < 5; i++) await nextTick()
    expect(fetchMock).toHaveBeenCalledWith('/api/logs/log-1/comments', expect.objectContaining({ query: expect.objectContaining({ block_id: 'block-1' }) }))
  })
  it('does not offer a review conversation on a log without a review', () => {
    const container = mount({ ...entry, review_excerpt: null })
    expect(container.querySelector('.discussion-thread')).toBeNull()
  })
})
