
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

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
