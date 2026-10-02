import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getFeedPage,
  getRecentFeed,
  invalidateFeedCache,
} from '../../server/services/feed'

const mockSelect = vi.fn()

vi.mock('../../server/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}))

function createQueryChain(result: unknown[]) {
  const chain: Record<string, unknown> = {}
  const methods = ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit']
  for (const method of methods) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = (resolve: (val: unknown) => unknown) => Promise.resolve(resolve(result))
  return chain
}

describe('Feed in-memory TTL cache', () => {
  beforeEach(() => {
    invalidateFeedCache()
    mockSelect.mockReset()
  })

  afterEach(() => vi.useRealTimers())

  it('maps an unannotated reading block without inheriting the parent rating or review', async () => {
    const row = {
      id: '55555555-5555-4555-8555-555555555555', kind: 'reading_block',
      log_id: '66666666-6666-4666-8666-666666666666',
      start_page: 1, end_page: 12, comment: null, read_at: '2026-10-01',
      rating: null, review: null, started_on: null, finished_on: null,
      created_at: new Date('2026-10-01T12:00:00Z'), cursor_created_at: '2026-10-01T12:00:00.000000Z',
      user: { handle: 'reader', display_name: 'Reader' },
      work: { id: 'work-1', title: 'Livro', slug: 'livro', first_published_year: null, cover_url: null, isbn13: null },
      edition: null,
    }
    mockSelect.mockImplementationOnce(() => createQueryChain([row])).mockImplementationOnce(() => createQueryChain([]))
    const page = await getFeedPage(null)
    expect(page.entries[0]).toMatchObject({
      id: row.id, kind: 'reading_block', log_id: row.log_id, rating: null, review_excerpt: null,
      block: { id: row.id, start_page: 1, end_page: 12, comment: null, read_at: '2026-10-01' },
    })
  })

  it('refreshes an expired first page exactly at the 30-second TTL boundary', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'))
    mockSelect.mockImplementationOnce(() => createQueryChain([]))
    expect((await getFeedPage(null, { limit: 20 })).entries).toEqual([])
    vi.setSystemTime(new Date('2026-10-01T12:00:29.999Z'))
    expect((await getFeedPage(null, { limit: 20 })).entries).toEqual([])
    expect(mockSelect).toHaveBeenCalledTimes(1)
    const freshLog = {
      id: '77777777-7777-4777-a777-777777777777', rating: '4.0', review: null,
      kind: 'reading_log', log_id: '77777777-7777-4777-a777-777777777777',
      start_page: null, end_page: null, comment: null, read_at: null,
      started_on: null, finished_on: null, created_at: new Date('2026-10-01T12:00:30Z'),
      cursor_created_at: '2026-10-01T12:00:30.000000Z',
      user: { handle: 'fresh', display_name: 'Fresh Reader' },
      work: { id: 'fresh-work', title: 'Newly visible book', slug: 'fresh-book', first_published_year: 2026, cover_url: null, isbn13: null },
      edition: null,
    }
    mockSelect.mockImplementationOnce(() => createQueryChain([freshLog]))
      .mockImplementationOnce(() => createQueryChain([]))
    vi.setSystemTime(new Date('2026-10-01T12:00:30Z'))
    expect((await getFeedPage(null, { limit: 20 })).entries.map((entry) => entry.id)).toEqual([freshLog.id])
    expect(mockSelect).toHaveBeenCalledTimes(3)
  })

  it('caches the first page of public feed and avoids repeated database queries', async () => {
    const dummyLog = {
      id: 'd9b01234-5678-4abc-def0-123456789abc',
      kind: 'reading_log', log_id: 'd9b01234-5678-4abc-def0-123456789abc',
      start_page: null, end_page: null, comment: null, read_at: null,
      rating: '4.5',
      review: 'Ótima leitura',
      started_on: '2026-03-01',
      finished_on: '2026-03-05',
      created_at: new Date('2026-03-05T10:00:00Z'),
      cursor_created_at: '2026-03-05T10:00:00.000000Z',
      user: { handle: 'leitor', display_name: 'Leitor Exemplo' },
      work: {
        id: 'work-1',
        title: 'Dom Casmurro',
        slug: 'dom-casmurro',
        first_published_year: 1899,
        cover_url: null,
        isbn13: null,
      },
      edition: null,
    }

    const dummyAuthor = {
      work_id: 'work-1',
      id: 'author-1',
      name: 'Machado de Assis',
      slug: 'machado-de-assis',
      position: 1,
    }

    mockSelect
      .mockImplementationOnce(() => createQueryChain([dummyLog]))
      .mockImplementationOnce(() => createQueryChain([dummyAuthor]))

    const page1 = await getFeedPage(null, { limit: 20 })
    expect(page1.entries).toHaveLength(1)
    expect(page1.entries[0]!.work.title).toBe('Dom Casmurro')
    expect(mockSelect).toHaveBeenCalledTimes(2)

    const page2 = await getFeedPage(null, { limit: 20 })
    expect(page2.entries).toHaveLength(1)
    expect(page2.entries[0]!.work.title).toBe('Dom Casmurro')
    expect(mockSelect).toHaveBeenCalledTimes(2)
  })

  it('clears the cache when invalidateFeedCache() is invoked', async () => {
    const dummyLog1 = {
      id: '11111111-1111-4111-a111-111111111111',
      kind: 'reading_log', log_id: '11111111-1111-4111-a111-111111111111',
      start_page: null, end_page: null, comment: null, read_at: null,
      rating: '5.0',
      review: 'Primeiro livro',
      started_on: null,
      finished_on: null,
      created_at: new Date('2026-03-01T10:00:00Z'),
      cursor_created_at: '2026-03-01T10:00:00.000000Z',
      user: { handle: 'u1', display_name: 'User 1' },
      work: { id: 'w1', title: 'Livro 1', slug: 'l1', first_published_year: 2000, cover_url: null, isbn13: null },
      edition: null,
    }

    const dummyLog2 = {
      id: '22222222-2222-4222-a222-222222222222',
      kind: 'reading_log', log_id: '22222222-2222-4222-a222-222222222222',
      start_page: null, end_page: null, comment: null, read_at: null,
      rating: '4.0',
      review: 'Segundo livro',
      started_on: null,
      finished_on: null,
      created_at: new Date('2026-03-02T10:00:00Z'),
      cursor_created_at: '2026-03-02T10:00:00.000000Z',
      user: { handle: 'u2', display_name: 'User 2' },
      work: { id: 'w2', title: 'Livro 2', slug: 'l2', first_published_year: 2001, cover_url: null, isbn13: null },
      edition: null,
    }

    mockSelect
      .mockImplementationOnce(() => createQueryChain([dummyLog1]))
      .mockImplementationOnce(() => createQueryChain([]))

    const res1 = await getFeedPage(null, { limit: 10 })
    expect(res1.entries).toHaveLength(1)
    expect(res1.entries[0]!.id).toBe('11111111-1111-4111-a111-111111111111')
    expect(mockSelect).toHaveBeenCalledTimes(2)

    invalidateFeedCache()

    mockSelect
      .mockImplementationOnce(() => createQueryChain([dummyLog2]))
      .mockImplementationOnce(() => createQueryChain([]))

    const res2 = await getFeedPage(null, { limit: 10 })
    expect(res2.entries).toHaveLength(1)
    expect(res2.entries[0]!.id).toBe('22222222-2222-4222-a222-222222222222')
    expect(mockSelect).toHaveBeenCalledTimes(4)
  })

  it('bypasses cache when a pagination cursor is specified', async () => {
    const dummyLog = {
      id: '33333333-3333-4333-a333-333333333333',
      kind: 'reading_log', log_id: '33333333-3333-4333-a333-333333333333',
      start_page: null, end_page: null, comment: null, read_at: null,
      rating: '3.0',
      review: 'Página 2',
      started_on: null,
      finished_on: null,
      created_at: new Date('2026-02-01T10:00:00Z'),
      cursor_created_at: '2026-02-01T10:00:00.000000Z',
      user: { handle: 'u3', display_name: 'User 3' },
      work: { id: 'w3', title: 'Livro 3', slug: 'l3', first_published_year: 1999, cover_url: null, isbn13: null },
      edition: null,
    }

    const validCursor = Buffer.from(
      JSON.stringify({ t: '2026-03-01T10:00:00.000Z', id: '11111111-1111-4111-a111-111111111111' }),
      'utf8',
    ).toString('base64url')

    mockSelect
      .mockImplementationOnce(() => createQueryChain([dummyLog]))
      .mockImplementationOnce(() => createQueryChain([]))
      .mockImplementationOnce(() => createQueryChain([dummyLog]))
      .mockImplementationOnce(() => createQueryChain([]))

    await getFeedPage(null, { cursor: validCursor, limit: 10 })
    expect(mockSelect).toHaveBeenCalledTimes(2)

    await getFeedPage(null, { cursor: validCursor, limit: 10 })
    expect(mockSelect).toHaveBeenCalledTimes(4)
  })

  it('caches getRecentFeed calls for public feed', async () => {
    const dummyLog = {
      id: '44444444-4444-4444-a444-444444444444',
      kind: 'reading_log', log_id: '44444444-4444-4444-a444-444444444444',
      start_page: null, end_page: null, comment: null, read_at: null,
      rating: '5.0',
      review: 'Recente',
      started_on: null,
      finished_on: null,
      created_at: new Date('2026-03-01T10:00:00Z'),
      cursor_created_at: '2026-03-01T10:00:00.000000Z',
      user: { handle: 'u4', display_name: 'User 4' },
      work: { id: 'w4', title: 'Livro 4', slug: 'l4', first_published_year: 2010, cover_url: null, isbn13: null },
      edition: null,
    }

    mockSelect
      .mockImplementationOnce(() => createQueryChain([dummyLog]))
      .mockImplementationOnce(() => createQueryChain([]))

    const feed1 = await getRecentFeed(null, 10)
    expect(feed1.entries).toHaveLength(1)
    expect(mockSelect).toHaveBeenCalledTimes(2)

    const feed2 = await getRecentFeed(null, 10)
    expect(feed2.entries).toHaveLength(1)
    expect(mockSelect).toHaveBeenCalledTimes(2)
  })
})
