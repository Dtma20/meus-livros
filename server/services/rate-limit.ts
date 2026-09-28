import { sql } from 'drizzle-orm'
import { db } from '../db'

export async function checkRateLimit(key: string, limitPerHour: number): Promise<boolean> {
  const rows = await db.execute(sql<{ count: number }>`
    INSERT INTO rate_limit (key, count, window_start)
    VALUES (${key}, 1, date_trunc('hour', now()))
    ON CONFLICT (key, window_start)
    DO UPDATE SET count = rate_limit.count + 1
    RETURNING count
  `)
  const count = Number(rows[0]?.count ?? 1)
  return count <= limitPerHour
}

export interface RateLimitExceeded {
  error: 'muitas_tentativas'
  message: string
}

export async function checkOtpRequestLimit(
  email: string,
  ip: string,
): Promise<RateLimitExceeded | null> {
  const [emailOk, ipOk] = await Promise.all([
    checkRateLimit(`otp:email:${email.toLowerCase().trim()}`, 5),
    checkRateLimit(`otp:ip:${ip}`, 20),
  ])

  if (!emailOk || !ipOk) {
    return {
      error: 'muitas_tentativas',
      message: 'Muitas tentativas. Aguarde uma hora e tente novamente.',
    }
  }

  return null
}

export async function checkSignInLimit(
  identifier: string,
  ip: string,
): Promise<RateLimitExceeded | null> {
  const [idOk, ipOk] = await Promise.all([
    checkRateLimit(`signin:id:${identifier.toLowerCase().trim()}`, 10),
    checkRateLimit(`signin:ip:${ip}`, 30),
  ])

  if (!idOk || !ipOk) {
    return {
      error: 'muitas_tentativas',
      message: 'Muitas tentativas. Aguarde uma hora e tente novamente.',
    }
  }

  return null
}

export async function checkPasswordChangeLimit(userId: string): Promise<RateLimitExceeded | null> {
  const userOk = await checkRateLimit(`pwchange:user:${userId}`, 10)

  if (!userOk) {
    return {
      error: 'muitas_tentativas',
      message: 'Muitas tentativas. Aguarde uma hora e tente novamente.',
    }
  }

  return null
}
