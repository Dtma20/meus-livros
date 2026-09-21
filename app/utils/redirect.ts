/**
 * The `?next=` destination, or `/` when it is not a path on this site.
 *
 * Two copies of this guard existed, in `entrar/index.vue` and
 * `entrar/ativar.vue`, and both tested `startsWith('/') && !startsWith('//')`.
 * That rejects `//evil.com` and accepts **`/\evil.com`**: browsers normalise a
 * backslash in a URL to a forward slash, so the value becomes protocol-relative
 * and points off-site. `%5C` is the same character percent-encoded, and it is
 * decoded before the check ever sees it.
 *
 * Today both callers hand the result to `router.push`, which resolves a string
 * as an internal route and will not navigate cross-origin, so the hole was
 * latent rather than live. That is not a property worth relying on: the day
 * someone reaches for `navigateTo(…, { external: true })`, `window.location` or
 * an SSR `sendRedirect`, the guard is the only thing standing there, and nobody
 * re-reads a guard in the commit that changes its caller. Duplicating it made
 * that worse — a fix would have landed in one copy.
 *
 * Allowed: a single leading `/` followed by anything that is not `/` or `\`.
 * Everything else, including a bare `/`, an absolute URL and a scheme-relative
 * one, falls back to the home page.
 */
export function getSafeRedirectUrl(nextParam: unknown): string {
  if (typeof nextParam !== 'string') return '/'

  const value = nextParam.trim()
  if (!value.startsWith('/')) return '/'

  // Second character decides: `//` and `/\` both leave the site.
  const second = value[1]
  if (second === '/' || second === '\\') return '/'

  // A control character can truncate the value inside a header or a URL parser.
  // Written as a code-point test rather than a character class because a regex
  // with literal control characters trips `no-control-regex`, and the rule is
  // right in general — silencing it here would silence it for the next author
  // who meant something else by it.
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) return '/'
  }

  return value
}
