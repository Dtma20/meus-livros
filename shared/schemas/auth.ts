import { z } from 'zod'

export const emailSchema = z
  .string({ error: 'Informe um e-mail válido.' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Informe um e-mail válido.' }))

export const otpSchema = z
  .string({ error: 'Informe o código.' })
  .trim()
  .regex(/^\d{6}$/, 'O código deve ter 6 dígitos numéricos.')

export const requestOtpSchema = z.object({
  email: emailSchema,
})

export const verifyOtpSchema = z.object({
  email: emailSchema,
  otp: otpSchema,
})

export const FORBIDDEN_PASSWORDS = [
  '12345678',
  '123456789',
  'password',
  'senha123',
  'meuslivros',
] as const

export function isForbiddenPassword(
  password: string,
  userContext?: { handle?: string; email?: string },
): boolean {
  const normalized = password.toLowerCase().trim()
  if (FORBIDDEN_PASSWORDS.some((p) => p.toLowerCase() === normalized)) {
    return true
  }
  if (userContext?.handle) {
    const handleNormalized = userContext.handle.toLowerCase().trim()
    if (handleNormalized && normalized === handleNormalized) {
      return true
    }
  }
  if (userContext?.email) {
    const localPart = userContext.email.split('@')[0]?.toLowerCase().trim()
    if (localPart && normalized === localPart) {
      return true
    }
  }
  return false
}

export const senhaSchema = z
  .string({ error: 'Informe uma senha.' })
  .min(8, { error: 'A senha deve ter pelo menos 8 caracteres.' })
  .max(128, { error: 'A senha deve ter no máximo 128 caracteres.' })
  .refine((val) => !isForbiddenPassword(val), {
    error: 'Senha muito fraca ou comum.',
  })

export const identificadorSchema = z
  .string({ error: 'Informe seu e-mail ou usuário.' })
  .trim()
  .min(3, { error: 'O identificador deve ter pelo menos 3 caracteres.' })
  .max(254, { error: 'O identificador deve ter no máximo 254 caracteres.' })

export const signInSchema = z.object({
  identificador: z.string({ error: 'Informe seu e-mail ou usuário.' }).trim().min(1, {
    error: 'Informe seu e-mail ou usuário.',
  }),
  senha: z.string({ error: 'Informe sua senha.' }).min(1, {
    error: 'Informe sua senha.',
  }),
})

export const setPasswordSchema = z.object({
  newPassword: senhaSchema,
})

export const resetPasswordSchema = z
  .object({
    email: emailSchema,
    otp: otpSchema,
    password: senhaSchema,
  })
  .refine(
    (data) => {
      const localPart = data.email.split('@')[0]?.toLowerCase().trim()
      return !localPart || data.password.toLowerCase().trim() !== localPart
    },
    {
      error: 'A senha não pode ser igual ao seu e-mail.',
      path: ['password'],
    },
  )

export const changePasswordSchema = z.object({
  currentPassword: z.string({ error: 'Informe a senha atual.' }).min(1, {
    error: 'Informe a senha atual.',
  }),
  newPassword: senhaSchema,
  revokeOtherSessions: z.boolean().optional(),
})

export type RequestOtpInput = z.infer<typeof requestOtpSchema>
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>
export type SignInInput = z.infer<typeof signInSchema>
export type SetPasswordInput = z.infer<typeof setPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
