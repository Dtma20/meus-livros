import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readStyle(rel: string): string {
  const source = readFileSync(resolve(process.cwd(), rel), 'utf-8')
  const match = source.match(/<style[^>]*>([\s\S]*?)<\/style>/)
  if (!match || match[1] === undefined) {
    throw new Error(`sem <style> em ${rel}`)
  }
  return match[1]
}

function ruleBody(css: string, selector: string, from = 0): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(^|[\\s,}])${escaped}\\s*\\{([^}]*)\\}`, 'g')
  re.lastIndex = from
  const match = re.exec(css)
  if (!match || match[2] === undefined) {
    throw new Error(`regra ${selector} não encontrada`)
  }
  return match[2]
}

function declaration(body: string, property: string): string | undefined {
  const match = body.match(new RegExp(`(^|;|\\s)${property}\\s*:\\s*([^;]+);`))
  return match?.[2]?.trim()
}

function mediaBlock(css: string, query: string): string {
  const start = css.indexOf(`@media (${query})`)
  if (start < 0) {
    throw new Error(`@media (${query}) não encontrado`)
  }
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}') {
      depth--
      if (depth === 0) {
        return css.slice(start, i + 1)
      }
    }
  }
  throw new Error(`@media (${query}) sem fechamento`)
}

const files = [
  'app/layouts/default.vue',
  'app/layouts/app.vue',
  'app/components/book/StarRating.vue',
  'app/components/dashboard/ReadingCarousel.vue',
  'app/components/feed/FeedItem.vue',
]

describe('escala tipográfica e espaçamento da navegação', () => {
  it.each(files)('%s não usa tamanhos de fonte fora da escala', (rel) => {
    expect(readStyle(rel)).not.toMatch(/font-size:\s*(1\.35rem|1\.15rem|0\.9rem|1\.05rem|11px)/)
  })

  it('o título do site usa xl no desktop e lg abaixo de 600px', () => {
    const css = readStyle('app/layouts/default.vue')
    expect(declaration(ruleBody(css, '.site-title'), 'font-size')).toBe('var(--font-size-xl)')
    const mobile = mediaBlock(css, 'max-width: 600px')
    expect(declaration(ruleBody(mobile, '.site-title'), 'font-size')).toBe('var(--font-size-lg)')
  })

  it('"Sair" tem o mesmo font-size dos outros links da navegação', () => {
    const css = readStyle('app/layouts/app.vue')
    const linkSize = declaration(ruleBody(css, '.nav-link'), 'font-size')
    expect(linkSize).toBe('var(--font-size-sm)')
    expect(declaration(ruleBody(css, '.nav-btn'), 'font-size')).toBe(linkSize)
  })

  it.each(['app/layouts/default.vue', 'app/layouts/app.vue'])('%s: .nav-link usa padding da escala', (rel) => {
    const css = readStyle(rel)
    expect(declaration(ruleBody(css, '.nav-link'), 'padding')).toBe('var(--space-1) var(--space-3)')
  })

  it('.site-title usa padding da escala', () => {
    const css = readStyle('app/layouts/default.vue')
    expect(declaration(ruleBody(css, '.site-title'), 'padding')).toBe('var(--space-1) var(--space-3)')
  })

  it('.bottom-nav-link usa padding e gap da escala', () => {
    const body = ruleBody(readStyle('app/layouts/app.vue'), '.bottom-nav-link')
    expect(declaration(body, 'padding')).toBe('var(--space-2) var(--space-1)')
    expect(declaration(body, 'gap')).toBe('var(--space-1)')
  })

  it('as estrelas usam font-size-sm', () => {
    const css = readStyle('app/components/book/StarRating.vue')
    expect(declaration(ruleBody(css, '.stars'), 'font-size')).toBe('var(--font-size-sm)')
  })
})
