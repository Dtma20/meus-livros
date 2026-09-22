import { createError, readBody } from 'h3'
import { z } from 'zod'
import { defineApiHandler } from '../../utils/api'
import { requireSessionUser } from '../../utils/session'
import { importUserLibrary } from '../../services/library-transfer'
import { livroJsonSchema } from '../../../shared/schemas/export-import'

const payloadSchema = z.union([
  z.array(livroJsonSchema).min(1, 'Envie ao menos um livro para importação.').max(1000, 'Limite de 1000 livros por importação.'),
  z.object({
    books: z.array(livroJsonSchema).min(1, 'Envie ao menos um livro para importação.').max(1000, 'Limite de 1000 livros por importação.'),
  }),
])

export default defineApiHandler(async (event) => {
  const user = await requireSessionUser(event)
  const rawBody = await readBody(event)

  const parsed = payloadSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      data: {
        error: 'requisicao_invalida',
        message: 'Formato do arquivo JSON inválido. Certifique-se de enviar uma lista de livros no formato esperado.',
        details: parsed.error.issues.slice(0, 5),
      },
    })
  }

  const booksList = Array.isArray(parsed.data) ? parsed.data : parsed.data.books
  const result = await importUserLibrary(user.id, booksList)

  return {
    success: true,
    imported: result.importedCount,
    skipped: result.skippedCount,
    errors: result.errors,
  }
})
