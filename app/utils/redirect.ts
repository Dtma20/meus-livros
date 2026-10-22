export function getSafeRedirectUrl(nextParam: unknown): string {
  if (typeof nextParam !== 'string') return '/'

  const value = nextParam.trim()
  if (!value.startsWith('/')) return '/'

  const second = value[1]
  if (second === '/' || second === '\\') return '/'

  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) return '/'
  }

  return value
}
