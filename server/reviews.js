import { readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export function reviewMiddleware(publicDir) {
  let queue = Promise.resolve()
  return async (req, res, next) => {
    const pathname = req.url?.split('?')[0]
    if (req.method === 'GET' && ['/livros.json', '/quadrinhos.json'].includes(pathname)) {
      try {
        const content = await readFile(join(publicDir, pathname.slice(1)), 'utf8')
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        return res.end(content)
      } catch { res.writeHead(500); return res.end('Falha ao ler a coleção.') }
    }
    const managingBooks = pathname === '/api/books'
    if (!managingBooks && pathname !== '/api/reviews') return next()
    const reply = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(data))
    }
    if (!(managingBooks ? ['POST', 'PUT', 'DELETE'] : ['PUT']).includes(req.method)) return reply(405, { error: 'Método não permitido.' })
    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) return reply(403, { error: 'Origem não permitida.' })
      } catch { return reply(403, { error: 'Origem não permitida.' }) }
    }
    if (!req.headers['content-type']?.startsWith('application/json')) return reply(415, { error: 'Envie JSON.' })
    try {
      let body = ''
      for await (const chunk of req) {
        body += chunk
        if (Buffer.byteLength(body) > 250000) return reply(413, { error: 'Resenha muito longa.' })
      }
      const input = JSON.parse(body)
      if (managingBooks) {
        const operation = queue.then(async () => {
          const path = join(publicDir, 'livros.json')
          const raw = await readFile(path, 'utf8')
          const items = JSON.parse(raw)
          if (req.method !== 'POST' && (!Number.isInteger(input.index) || input.index < 0 || !items[input.index] || JSON.stringify(items[input.index]) !== input.snapshot)) {
            return reply(409, { error: 'Este livro mudou. Recarregue a página antes de editar ou remover.' })
          }
          if (req.method === 'DELETE') items.splice(input.index, 1)
          else {
            const book = input.book
            const names = typeof book?.author === 'string' ? [book.author] : book?.author
            if (!book || typeof book.title !== 'string' || !book.title.trim() || !Array.isArray(names) || !names.length || names.some(name => typeof name !== 'string' || !name.trim()) || !Array.isArray(book.genre) || book.genre.some(g => typeof g !== 'string')) {
              return reply(400, { error: 'Informe título, autor(es) e gêneros válidos.' })
            }
            for (const field of ['pages', 'year', 'read_in', 'rate']) {
              const value = book[field]
              if (value != null && (typeof value !== 'number' || !Number.isFinite(value) || (field !== 'rate' && !Number.isInteger(value)) || (field === 'pages' && value < 0) || (field === 'read_in' && value < 1) || (field === 'rate' && (value < 0.5 || value > 5 || value * 2 % 1)))) {
                return reply(400, { error: `Valor inválido: ${field}.` })
              }
            }
            const clean = {}
            for (const field of ['title', 'country', 'original_language', 'publisher', 'source', 'series_name', 'series_number', 'isbn', 'cover_url']) {
              if (book[field] != null && typeof book[field] !== 'string') return reply(400, { error: `Texto inválido: ${field}.` })
              clean[field] = book[field]?.trim() || null
            }
            if (clean.cover_url && !/^https?:\/\//i.test(clean.cover_url)) return reply(400, { error: 'Use uma URL de capa HTTP ou HTTPS.' })
            Object.assign(clean, { author: names.length === 1 ? names[0].trim() : [...new Set(names.map(n => n.trim()))], genre: [...new Set(book.genre.map(g => g.trim()).filter(Boolean))] })
            for (const field of ['pages', 'year', 'read_in', 'rate']) clean[field] = book[field] ?? null
            if (req.method === 'POST') items.push({ ...clean, id: randomUUID(), review: null })
            else items[input.index] = { ...items[input.index], ...clean }
          }
          const temporary = `${path}.${randomUUID()}.tmp`
          try {
            await writeFile(temporary, JSON.stringify(items, null, 2) + '\n', 'utf8')
            if (await readFile(path, 'utf8') !== raw) return reply(409, { error: 'O arquivo mudou. Recarregue antes de tentar novamente.' })
            await rename(temporary, path)
          } finally { await unlink(temporary).catch(() => {}) }
          reply(200, { books: items })
        })
        queue = operation.catch(() => {})
        await operation
        return
      }
      const filename = input.collection === 'books' ? 'livros.json' : input.collection === 'comics' ? 'quadrinhos.json' : null
      if (!filename || !Number.isInteger(input.index) || input.index < 0 || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 50000) {
        return reply(400, { error: 'Dados da resenha inválidos (limite de 50 mil caracteres).' })
      }
      const update = async () => {
        const path = join(publicDir, filename)
        const raw = await readFile(path, 'utf8')
        const items = JSON.parse(raw)
        const item = items[input.index]
        if (!item || item.title !== input.title || (item.isbn || null) !== (input.isbn || null)) {
          return reply(409, { error: 'O cadastro mudou. Copie sua resenha e recarregue a página antes de salvar.' })
        }
        if ((item.review || null) !== (input.previousReview || null)) {
          return reply(409, { error: 'A resenha foi alterada em outro lugar. Copie seu texto e recarregue antes de salvar.' })
        }
        item.review = input.text.trim()
        item.review_format = 'text'
        const temporary = `${path}.${randomUUID()}.tmp`
        try {
          await writeFile(temporary, JSON.stringify(items, null, 2) + '\n', 'utf8')
          // Evita sobrescrever uma edição manual feita durante a gravação.
          if (await readFile(path, 'utf8') !== raw) return reply(409, { error: 'O arquivo mudou durante a gravação. Tente novamente após recarregar.' })
          await rename(temporary, path)
        } finally {
          await unlink(temporary).catch(() => {})
        }
        reply(200, { review: item.review, review_format: item.review_format })
      }
      const operation = queue.then(update)
      queue = operation.catch(() => {})
      await operation
    } catch (error) {
      reply(error instanceof SyntaxError ? 400 : 500, { error: error instanceof SyntaxError ? 'JSON inválido.' : 'Não foi possível gravar a resenha no arquivo. Tente novamente.' })
    }
  }
}

export function reviewsPlugin(publicDir) {
  return {
    name: 'save-reviews',
    configureServer(server) { server.middlewares.use(reviewMiddleware(publicDir)) },
    configurePreviewServer(server) { server.middlewares.use(reviewMiddleware(publicDir)) },
  }
}
