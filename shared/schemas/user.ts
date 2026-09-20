import { z } from 'zod'

/**
 * Reserved handles that cannot be registered by users.
 * These correspond to existing or planned public routes and system endpoints.
 */
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

/**
 * Checks whether a candidate handle is reserved.
 * Case-insensitive comparison.
 */
export function isReservedHandle(handle: string): boolean {
  const normalized = handle.trim().toLowerCase()
  return (RESERVED_HANDLES as readonly string[]).includes(normalized)
}

/**
 * Transliterates free text to a valid handle candidate visible on the client.
 * Strips accents, lowercases, and converts spaces/separators to underscores.
 * E.g., "João Silva" -> "joao_silva", "2ª Edição" -> "2a_edicao".
 */
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

/**
 * Base handle schema validating format and length: /^[a-z0-9_]{3,20}$/
 */
export const baseHandleSchema = z
  .string({ error: 'Informe um nome de usuário.' })
  .trim()
  .min(3, { error: 'O nome de usuário deve ter pelo menos 3 caracteres.' })
  .max(20, { error: 'O nome de usuário deve ter no máximo 20 caracteres.' })
  .regex(/^[a-z0-9_]{3,20}$/, {
    error: 'O nome de usuário deve conter apenas letras minúsculas sem acento, números e sublinhados.',
  })

/**
 * Validates a handle against length, regex (`^[a-z0-9_]{3,20}$`), and reserved words.
 */
export const handleSchema = baseHandleSchema.refine((val) => !isReservedHandle(val), {
  error: 'Este nome de usuário é reservado.',
})

/**
 * Helper function for programmatic handle validation.
 */
export function validateHandle(handle: string): { valid: boolean; error?: string } {
  const result = handleSchema.safeParse(handle)
  if (result.success) {
    return { valid: true }
  }
  return { valid: false, error: result.error.issues[0]?.message }
}

/**
 * Schema for POST /api/users request body.
 * Note: regex and length are enforced here (returning 400 if invalid);
 * reserved words and collision checks are handled at the service level (returning 409).
 */
export const createUserSchema = z.object({
  handle: baseHandleSchema,
  display_name: z
    .string({ error: 'Informe seu nome de exibição.' })
    .trim()
    .min(1, { error: 'O nome de exibição não pode ficar em branco.' })
    .max(100, { error: 'O nome de exibição deve ter no máximo 100 caracteres.' }),
})

/**
 * Schema for PATCH /api/users/me request body.
 * Bio is capped at 500 characters.
 * Handle field is accepted in input but ignored by the service (handle is immutable).
 */
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
