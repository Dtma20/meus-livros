import { z } from 'zod'

export const commentInputSchema = z.object({
  body: z.string().trim().min(1, 'Escreva um comentário.').max(2000, 'O comentário pode ter no máximo 2.000 caracteres.'),
  block_id: z.string().uuid().nullish(),
})

const cursorValueSchema = z.object({
  created_at: z.iso.datetime({ offset: true }),
  id: z.string().uuid(),
})

export const commentQuerySchema = z.object({
  block_id: z.string().uuid().nullish(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(256).transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Cursor inválido.' })
      return z.NEVER
    }
  }).pipe(cursorValueSchema).optional(),
})

export const commentViewSchema = z.object({
  id: z.string().uuid(),
  log_id: z.string().uuid(),
  block_id: z.string().uuid().nullable(),
  body: z.string(),
  created_at: z.union([z.date(), z.string()]),
  user: z.object({ handle: z.string(), display_name: z.string() }),
  can_delete: z.boolean(),
})

export type CommentInput = z.infer<typeof commentInputSchema>
export type CommentQuery = z.infer<typeof commentQuerySchema>
export type CommentView = z.infer<typeof commentViewSchema>
export interface CommentPageResponse {
  comments: CommentView[]
  nextCursor: string | null
}
