import { getRequestHeader } from 'h3'
import type { H3Event } from 'h3'

type HeaderSource = H3Event | Pick<Headers, 'get'>

function readHeader(source: HeaderSource, name: string): string | undefined {
  if ('node' in source) {
    return getRequestHeader(source, name)
  }
  return source.get(name) ?? undefined
}

export function getClientIp(source: HeaderSource): string {
  return (
    readHeader(source, 'x-forwarded-for')?.split(',')[0]?.trim() ||
    readHeader(source, 'x-real-ip') ||
    '127.0.0.1'
  )
}
