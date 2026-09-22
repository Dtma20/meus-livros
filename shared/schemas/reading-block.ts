import { z } from 'zod'
import { getTodaySaoPaulo, isFutureDateSaoPaulo } from './log'

export const readingBlockDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data deve estar no formato AAAA-MM-DD.' })
  .refine((d) => !isFutureDateSaoPaulo(d), {
    message: 'A data não pode ser no futuro.',
  })

export const readingBlockInputSchema = z
  .object({
    start_page: z
      .number({ error: 'A página inicial é obrigatória.' })
      .int({ message: 'A página inicial deve ser um número inteiro.' })
      .min(1, { message: 'A página inicial deve ser pelo menos 1.' }),
    end_page: z
      .number({ error: 'A página final é obrigatória.' })
      .int({ message: 'A página final deve ser um número inteiro.' })
      .min(1, { message: 'A página final deve ser pelo menos 1.' }),
    comment: z
      .string()
      .max(5000, { message: 'O comentário pode ter no máximo 5.000 caracteres.' })
      .nullish(),
    read_at: readingBlockDateSchema.optional().default(() => getTodaySaoPaulo()),
  })
  .refine((data) => data.end_page >= data.start_page, {
    message: 'A página final deve ser maior ou igual à página inicial.',
    path: ['end_page'],
  })

export const updateReadingBlockInputSchema = z
  .object({
    start_page: z
      .number()
      .int({ message: 'A página inicial deve ser um número inteiro.' })
      .min(1, { message: 'A página inicial deve ser pelo menos 1.' })
      .optional(),
    end_page: z
      .number()
      .int({ message: 'A página final deve ser um número inteiro.' })
      .min(1, { message: 'A página final deve ser pelo menos 1.' })
      .optional(),
    comment: z
      .string()
      .max(5000, { message: 'O comentário pode ter no máximo 5.000 caracteres.' })
      .nullish(),
    read_at: readingBlockDateSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.start_page !== undefined && data.end_page !== undefined) {
        return data.end_page >= data.start_page
      }
      return true
    },
    {
      message: 'A página final deve ser maior ou igual à página inicial.',
      path: ['end_page'],
    },
  )

export type ReadingBlockInput = z.infer<typeof readingBlockInputSchema>
export type UpdateReadingBlockInput = z.infer<typeof updateReadingBlockInputSchema>

export interface ReadingBlockView {
  id: string
  log_id: string
  user_id: string
  start_page: number
  end_page: number
  comment: string | null
  read_at: string
  created_at: Date
  updated_at: Date
}

export interface ReadingProgressView {
  pages_read: number
  current_page: number
  total_pages: number | null
  percentage: number | null
  is_complete: boolean
}
