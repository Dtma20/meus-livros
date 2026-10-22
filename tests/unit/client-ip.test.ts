import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import { getClientIp } from '../../server/utils/client-ip'

function eventWithHeaders(headers: Record<string, string>): H3Event {
  return {
    node: { req: { headers } },
  } as unknown as H3Event
}

describe('getClientIp', () => {
  it('uses first x-forwarded-for address', () => {
    expect(getClientIp(eventWithHeaders({
      'x-forwarded-for': '203.0.113.10, 198.51.100.20',
    }))).toBe('203.0.113.10')
  })

  it('falls back to loopback when headers are absent', () => {
    expect(getClientIp(eventWithHeaders({}))).toBe('127.0.0.1')
  })

  it('keeps Request header behavior through shared parser', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.10, 198.51.100.20',
    })

    expect(getClientIp(headers)).toBe('203.0.113.10')
  })
})
