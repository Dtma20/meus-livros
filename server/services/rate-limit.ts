import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '../db'
import { logger } from '../utils/logger'

export function hashRateLimitKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export async function pruneRateLimits(): Promise<void> {
  await db.execute(sql`
    DELETE FROM rate_limit
    WHERE window_start < date_trunc('hour', now()) - interval '1 day'
  `)
}

export async function checkRateLimit(key: string, limitPerHour: number): Promise<boolean> {
  if (Math.random() < 0.01) {
    pruneRateLimits().catch((err: unknown) => {
      logger.warn('Falha ao limpar rate limits antigos', {
        module: 'rate-limit',
        error: {
          name: err instanceof Error ? err.name : 'UnknownError',
          message: err instanceof Error ? err.message : String(err),
        },
      })
    })
  }

  const hashedKey = hashRateLimitKey(key)
  const rows = await db.execute(sql<{ count: number }>`
    INSERT INTO rate_limit (key, count, window_start)
    VALUES (${hashedKey}, 1, date_trunc('hour', now()))
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
  const ipOk = await checkRateLimit(`otp:ip:${ip}`, 20)
  if (!ipOk) {
    return {
      error: 'muitas_tentativas',
      message: 'Muitas tentativas. Aguarde uma hora e tente novamente.',
    }
  }

  const emailOk = await checkRateLimit(`otp:email:${email.toLowerCase().trim()}`, 5)
  if (!emailOk) {
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
  const ipOk = await checkRateLimit(`signin:ip:${ip}`, 30)
  if (!ipOk) {
    return {
      error: 'muitas_tentativas',
      message: 'Muitas tentativas. Aguarde uma hora e tente novamente.',
    }
  }

  const cleanId = identifier.toLowerCase().trim()
  const idIpOk = await checkRateLimit(`signin:idip:${cleanId}:${ip}`, 10)
  if (!idIpOk) {
    return {
      error: 'muitas_tentativas',
      message: 'Muitas tentativas. Aguarde uma hora e tente novamente.',
    }
  }

  const idOk = await checkRateLimit(`signin:id:${cleanId}`, 50)
  if (!idOk) {
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
