import { describe, expect, it, vi } from 'vitest'

import { decodeCursor, encodeCursor, getFeedPage } from '../../server/services/feed'

vi.mock('../../server/db', () => ({ db: {} }))

const LOG_ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b'

function cursorOf(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

const invalidCursor = { statusCode: 400, data: { error: 'cursor_invalido' } }

function decodeError(cursor: string): unknown {
  try {
    decodeCursor(cursor)
  } catch (caught: unknown) {
    return caught
  }
  return null
}

describe('feed cursor decoding', () => {
  it('round-trips the cursors the service emits, with milli- and microsecond precision', () => {
    const fromDate = encodeCursor({ created_at: new Date('2026-09-20T12:34:56.789Z'), id: LOG_ID })
    expect(decodeCursor(fromDate)).toEqual({ t: '2026-09-20T12:34:56.789Z', id: LOG_ID })

    const fromDatabase = encodeCursor({
      cursor_created_at: '2026-09-20T12:34:56.789123Z',
      created_at: new Date('2026-09-20T12:34:56.789Z'),
      id: LOG_ID,
    })
    expect(decodeCursor(fromDatabase)).toEqual({ t: '2026-09-20T12:34:56.789123Z', id: LOG_ID })
  })

  it.each([
    ['a timestamp JavaScript parses but Postgres rejects', { t: '1', id: LOG_ID }],
    ['a free-form date string', { t: 'Sun Sep 20 2026', id: LOG_ID }],
    ['an impossible calendar day', { t: '2026-02-30T00:00:00Z', id: LOG_ID }],
    ['year zero, which timestamptz has no value for', { t: '0000-01-01T00:00:00Z', id: LOG_ID }],
    ['a numeric timestamp', { t: 1758371696789, id: LOG_ID }],
    ['an id that is not a uuid', { t: '2026-09-20T12:34:56.789Z', id: 'not-a-uuid' }],
    ['a missing id', { t: '2026-09-20T12:34:56.789Z' }],
    ['a JSON array', ['2026-09-20T12:34:56.789Z', LOG_ID]],
  ])('rejects %s with 400 cursor_invalido', (_label, payload) => {
    expect(decodeError(cursorOf(payload))).toMatchObject(invalidCursor)
  })

  it('rejects a cursor that is not base64url JSON', () => {
    expect(decodeError('malformed_not_base64_json')).toMatchObject(invalidCursor)
  })

  it('getFeedPage refuses the bad cursor before any query reaches the database', async () => {
    await expect(getFeedPage({ id: LOG_ID }, { cursor: cursorOf({ t: '1', id: LOG_ID }) }))
      .rejects.toMatchObject(invalidCursor)
  })
})
