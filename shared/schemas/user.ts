import { z } from 'zod'

export const RESERVED_HANDLES = [
  'livro',
  'entrada',
  'app',
  'api',
  'entrar',
  'admin',
  'sobre',
  'me',
  'sair',
  'perfil',
  'novo',
] as const

export type ReservedHandle = (typeof RESERVED_HANDLES)[number]

export function isReservedHandle(handle: string): boolean {
  const normalized = handle.trim().toLowerCase()
  return (RESERVED_HANDLES as readonly string[]).includes(normalized)
}

export function transliterateToHandle(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)
    .replace(/_+$/g, '')
}

export const baseHandleSchema = z
  .string({ error: 'Informe um nome de usuário.' })
  .trim()
  .min(3, { error: 'O nome de usuário deve ter pelo menos 3 caracteres.' })
  .max(20, { error: 'O nome de usuário deve ter no máximo 20 caracteres.' })
  .regex(/^[a-z0-9_]{3,20}$/, {
    error: 'O nome de usuário deve conter apenas letras minúsculas sem acento, números e sublinhados.',
  })

export const handleSchema = baseHandleSchema.refine((val) => !isReservedHandle(val), {
  error: 'Este nome de usuário é reservado.',
})

export function validateHandle(handle: string): { valid: boolean; error?: string } {
  const result = handleSchema.safeParse(handle)
  if (result.success) {
    return { valid: true }
  }
  return { valid: false, error: result.error.issues[0]?.message }
}

export const createUserSchema = z.object({
  handle: baseHandleSchema,
  display_name: z
    .string({ error: 'Informe seu nome de exibição.' })
    .trim()
    .min(1, { error: 'O nome de exibição não pode ficar em branco.' })
    .max(100, { error: 'O nome de exibição deve ter no máximo 100 caracteres.' }),
})

export const updateProfileSchema = z.object({
  display_name: z
    .string({ error: 'Informe seu nome de exibição.' })
    .trim()
    .min(1, { error: 'O nome de exibição não pode ficar em branco.' })
    .max(100, { error: 'O nome de exibição deve ter no máximo 100 caracteres.' })
    .optional(),
  bio: z
    .string()
    .max(500, { error: 'A biografia deve ter no máximo 500 caracteres.' })
    .nullable()
    .optional(),
  profile_visibility: z
    .enum(['publico', 'privado'], { error: 'Visibilidade de perfil inválida.' })
    .optional(),
  handle: z.string().optional(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
