import { createError, readBody } from 'h3'
import { z } from 'zod'
import { defineApiHandler, parseOrThrow } from '../../utils/api'
import { requireSessionUser } from '../../utils/session'
import { importUserLibrary } from '../../services/library-transfer'
import { checkRateLimit } from '../../services/rate-limit'
import { livroJsonSchema } from '../../../shared/schemas/export-import'

const booksArraySchema = z
  .array(livroJsonSchema)
  .min(1, 'Envie ao menos um livro para importação.')
  .max(1000, 'Limite de 1000 livros por importação.')

const booksObjectSchema = z.object({
  books: booksArraySchema,
})

export default defineApiHandler(async (event) => {
  const user = await requireSessionUser(event)

  const allowed = await checkRateLimit(`import:user:${user.id}`, 3)
  if (!allowed) {
    throw createError({
      statusCode: 429,
      data: {
        error: 'muitas_tentativas',
        message: 'Muitas importações em pouco tempo. Tente de novo daqui a uma hora.',
      },
    })
  }

  const rawBody = await readBody(event)
  const booksList = Array.isArray(rawBody)
    ? parseOrThrow(booksArraySchema, rawBody)
    : typeof rawBody === 'object' && rawBody !== null && 'books' in rawBody
      ? parseOrThrow(booksObjectSchema, rawBody).books
      : parseOrThrow(booksArraySchema, rawBody)
  const result = await importUserLibrary(user.id, booksList)

  return {
    success: true,
    imported: result.importedCount,
    skipped: result.skippedCount,
    errors: result.errors,
  }
})
