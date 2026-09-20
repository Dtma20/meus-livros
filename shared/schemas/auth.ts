import { z } from 'zod'

/**
 * Shared authentication schemas (used by frontend form validation in entrar.vue).
 */

export const emailSchema = z
  .email({ error: 'Informe um e-mail válido.' })
  .trim()
  .toLowerCase()

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

export type RequestOtpInput = z.infer<typeof requestOtpSchema>
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>
