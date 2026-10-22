import { z } from 'zod'

export const inviteEmailSchema = z
  .string({ error: 'Informe um e-mail válido.' })
  .trim()
  .toLowerCase()
  .email({ error: 'Informe um e-mail válido.' })
  .max(254, { error: 'O e-mail deve ter no máximo 254 caracteres.' })

export const inviteNoteSchema = z
  .string()
  .trim()
  .max(200, { error: 'A observação deve ter no máximo 200 caracteres.' })
  .optional()
  .nullable()
  .transform((val) => {
    if (!val || val.length === 0) return null
    return val
  })

export const addInviteSchema = z.object({
  email: inviteEmailSchema,
  note: inviteNoteSchema.default(null),
})

export const deleteInviteSchema = z.object({
  email: inviteEmailSchema,
})

export type AddInviteInput = z.infer<typeof addInviteSchema>
export type DeleteInviteInput = z.infer<typeof deleteInviteSchema>

export interface InviteView {
  email: string
  note: string | null
  created_at: string
  invited_by_handle: string | null
  status: 'pendente' | 'ativado'
  has_profile: boolean
}
