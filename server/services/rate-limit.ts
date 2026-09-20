import { sql } from 'drizzle-orm'
import { db } from '../db'

/**
 * Rate limiting backed by the `rate_limit` table — no Redis.
 *
 * One counter row per (key, 1-hour window), bumped by a single atomic upsert.
 * The UNIQUE(key, window_start) constraint in migration 0002 is what makes
 * the ON CONFLICT branch reachable; without it every request would insert a
 * fresh row and the limit would never fire.
 *
 * Only server/services/** may import the db handle (ESLint enforces this),
 * so the implementation lives here. server/utils/rate-limit.ts re-exports it.
 */

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

/** Error body for a tripped OTP limit, in the project's `{ error, message }` shape. */
export interface RateLimitExceeded {
  error: 'muitas_tentativas'
  message: string
}

/**
 * OTP-request limits (security.md §8):
 *   - 5 requests per email per hour
 *   - 20 requests per IP per hour
 *
 * Returns null when within limits, or the 429 body when either trips.
 * Every call counts — including requests for non-allowlisted addresses, which
 * the caller answers with an identical success-shaped response.
 */
export async function checkOtpRequestLimit(
  email: string,
  ip: string,
): Promise<RateLimitExceeded | null> {
  const [emailOk, ipOk] = await Promise.all([
    checkRateLimit(`otp:email:${email.toLowerCase()}`, 5),
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
