/**
 * Slug generation.
 *
 * Slugs are `citext` and unique per table, so collisions must resolve to a new
 * value rather than fail. Accents are stripped rather than transliterated by a
 * table: 'Ficção Científica' -> 'ficcao-cientifica'.
 */

/** Strip accents, lowercase, and reduce everything else to single hyphens. */
export function slugify(text: string): string {
  return text
    // NFKD, not NFD: Portuguese titles carry ordinal indicators ('2ª edição'),
    // which are compatibility characters and survive NFD untouched.
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

/**
 * The first slug not already taken.
 *
 * `taken` answers whether a candidate exists; the caller decides how to ask the
 * database. Suffixes start at -2 because the unsuffixed slug is the first.
 */
export async function uniqueSlug(
  text: string,
  taken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(text) || 'item'
  if (!(await taken(base))) return base

  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`
    if (!(await taken(candidate))) return candidate
  }

  throw new Error(`Não foi possível gerar um slug único para "${text}".`)
}
