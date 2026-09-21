import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP } from 'better-auth/plugins/email-otp'
import { eq } from 'drizzle-orm'
import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { db } from '../db'
import { allowed_emails, users } from '../db/schema'
import { getEmailFrom, getTransport } from '../utils/email'
import { checkOtpRequestLimit } from './rate-limit'

const betterAuthSecret = process.env.BETTER_AUTH_SECRET
const betterAuthUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3000'

if (!betterAuthSecret) {
  throw new Error('A variável de ambiente BETTER_AUTH_SECRET não foi informada.')
}

// Inline Drizzle table definitions for better-auth's own tables.
// These match the SQL in 0002_better_auth.sql exactly.
// "ba_user" keeps better-auth identities separate from the app's "users" profile table.
const baUser = pgTable('ba_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull(),
})

const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull(),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const auth = betterAuth({
  secret: betterAuthSecret,
  baseURL: betterAuthUrl,

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: baUser,
      session,
      account,
      verification,
    },
  }),

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // roll every 24 h
    cookieCache: {
      enabled: false, // always validate against DB → sessions are revocable
    },
  },

  advanced: {
    useSecureCookies: true, // enforce httpOnly, Secure, SameSite=Lax in all environments
  },

  rateLimit: {
    enabled: false, // rate limiting is enforced in Postgres via our rate_limit table
  },

  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 10, // 10 minutes
      allowedAttempts: 5,
      sendVerificationOTP: async ({ email, otp, type }) => {
        // OTP codes must never appear in logs — do NOT log otp here.
        const transport = await getTransport()
        const subject =
          type === 'sign-in' ? 'Seu código de acesso — Meus Livros' : 'Seu código — Meus Livros'

        // Fire-and-forget: do not block the HTTP response on SMTP latency.
        // Catch any error so it does not result in an unhandled rejection.
        // Never log the OTP code.
        transport
          .sendMail({
            from: getEmailFrom(),
            to: email,
            subject,
            text: [
              `Olá,`,
              ``,
              `Seu código de acesso é: ${otp}`,
              ``,
              `O código expira em 10 minutos e só pode ser usado uma vez.`,
              ``,
              `Se você não solicitou este código, ignore este e-mail.`,
              ``,
              `— Meus Livros`,
            ].join('\n'),
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err)
            console.error(`[auth] Falha ao enviar e-mail OTP para ${email}: ${message}`)
          })
      },
    }),
  ],

  trustedOrigins: [betterAuthUrl],
})

export type Auth = typeof auth

/**
 * Checks whether an email is registered in the allowlist table.
 * Case-insensitive comparison against allowed_emails.email (citext column).
 */
export async function isEmailAllowed(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false

  const [row] = await db
    .select({ email: allowed_emails.email })
    .from(allowed_emails)
    .where(eq(allowed_emails.email, normalized))
    .limit(1)

  return !!row
}

export interface SessionUser {
  id: string
  email?: string
}

/**
 * Looks up the authenticated session user given incoming HTTP headers.
 * Database-backed: returns null if the session token is absent, expired, or deleted.
 */
export async function getSessionUserByHeaders(headers: Headers): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers })
  if (!session?.user?.email) {
    return null
  }

  const normalizedEmail = session.user.email.trim().toLowerCase()
  const [appUser] = await db
    .select({
      id: users.id,
      email: users.email,
    })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1)

  if (!appUser) {
    return null
  }

  return {
    id: appUser.id,
    email: appUser.email,
  }
}

/**
 * Handles incoming authentication requests with:
 *   1. Rate limiting on OTP send (5/email/hr, 20/IP/hr) -> 429
 *   2. Allowlist verification before sending OTP (enumeration defense: identical response/timing)
 *   3. Consistent error translation for OTP verification -> 400 { error: 'validacao' }
 *   4. Explicit allowlist of supported paths; denies all other routes with 404
 */
export async function handleAuthRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const authPath = url.pathname.replace(/^\/api\/auth/, '').replace(/\/$/, '')

  // 1. Requesting an OTP code
  if (request.method === 'POST' && authPath === '/email-otp/send-verification-otp') {
    const bodyText = await request.text()
    let body: Record<string, unknown>
    try {
      body = JSON.parse(bodyText)
    } catch {
      return Response.json(
        {
          error: 'requisicao_invalida',
          message: 'Corpo da requisição inválido.',
        },
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      )
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1'

    // Rate limit check
    const rateLimitExceeded = await checkOtpRequestLimit(email, ip)
    if (rateLimitExceeded) {
      return Response.json(rateLimitExceeded, {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    }

    // Warm nodemailer's module cache before the allowlist branch, so both the
    // invited and the uninvited address pay its 62 ms first load. getTransport()
    // moved nodemailer to a dynamic import to keep 1.4 MB out of every
    // serverless bundle; awaiting it only inside sendVerificationOTP -- which
    // runs for allowlisted addresses alone -- would hand that 62 ms back as an
    // enumeration timing signal, which is the very thing the identical 200
    // below exists to deny. Second call costs 0.06 ms, from cache.
    await import('nodemailer')

    // Allowlist check
    const allowed = await isEmailAllowed(email)
    if (!allowed) {
      // Enumeration defense: return identical 200 { success: true } without sending email.
      // Response does not wait for email sending latency.
      return Response.json(
        { success: true },
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    }

    return auth.handler(
      new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: bodyText,
      }),
    )
  }

  // 2. Verifying OTP / Signing in
  if (request.method === 'POST' && authPath === '/sign-in/email-otp') {
    const response = await auth.handler(request)
    if (response.ok) {
      return response
    }

    // Translates better-auth error codes (INVALID_OTP, OTP_EXPIRED, TOO_MANY_ATTEMPTS)
    // to project standard: 400 { error: 'validacao', message: '...' }
    return Response.json(
      {
        error: 'validacao',
        message: 'Código inválido ou expirado.',
      },
      {
        status: 400,
        headers: { 'content-type': 'application/json' },
      },
    )
  }

  // 3. Allowed session check and sign-out
  if ((request.method === 'GET' || request.method === 'HEAD') && authPath === '/get-session') {
    return auth.handler(request)
  }

  if (request.method === 'POST' && authPath === '/sign-out') {
    return auth.handler(request)
  }

  // 4. Deny all other routes by default with 404 in project error format
  return Response.json(
    {
      error: 'nao_encontrado',
      message: 'Rota não encontrada.',
    },
    {
      status: 404,
      headers: { 'content-type': 'application/json' },
    },
  )
}
