import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP } from 'better-auth/plugins/email-otp'
import { and, eq, isNotNull } from 'drizzle-orm'
import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { isForbiddenPassword } from '../../shared/schemas/auth'
import { db } from '../db'
import { allowed_emails, users } from '../db/schema'
import { getEmailFrom, getTransport, redactEmail } from '../utils/email'
import { logger } from '../utils/logger'
import { withRetry } from '../utils/retry'
import {
  checkOtpRequestLimit,
  checkPasswordChangeLimit,
  checkSignInLimit,
} from './rate-limit'

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

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
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
        const emailRedacted = redactEmail(email)

        // Fire-and-forget: do not block the HTTP response on SMTP latency.
        // Catch any error so it does not result in an unhandled rejection.
        // Never log the OTP code.
        const startTime = performance.now()
        withRetry(
          async () => {
            return await transport.sendMail({
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
          },
          {
            maxRetries: 2,
            initialDelayMs: 300,
            operationName: 'send_otp_email',
            module: 'auth',
          },
        )
          .then(() => {
            const durationMs = Math.round(performance.now() - startTime)
            logger.info(`[auth] E-mail OTP enviado com sucesso para ${emailRedacted}`, {
              module: 'auth',
              source: 'external_api',
              operation: 'send_otp_email',
              durationMs,
              context: { type, email: emailRedacted },
            })
          })
          .catch((err: unknown) => {
            const durationMs = Math.round(performance.now() - startTime)
            const message = err instanceof Error ? err.message : String(err)
            // Redacted: security.md keeps addresses out of logs beyond the
            // first character, and this line runs for every invited member.
            logger.error(`[auth] Falha ao enviar e-mail OTP para ${emailRedacted}: ${message}`, {
              module: 'auth',
              source: 'external_api',
              operation: 'send_otp_email',
              durationMs,
              context: { type, email: emailRedacted },
              error: err as Error,
            })
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

/**
 * Checks whether an email identity already has an account row with a non-null password.
 * Used by activation to avoid revealing whether invitees have already signed up.
 * Query checks directly in SQL rather than fetching in JS.
 */
export async function hasPassword(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false

  const [row] = await db
    .select({ id: account.id })
    .from(account)
    .innerJoin(baUser, eq(account.userId, baUser.id))
    .where(
      and(
        eq(baUser.email, normalized),
        isNotNull(account.password),
      ),
    )
    .limit(1)

  return !!row
}

/**
 * Resolves a sign-in identifier (handle or email) to an email address.
 * If handle matches ^[a-z0-9_]{3,20}$ and does not contain @, looks up users.handle.
 * If nonexistent handle, substitutes a dummy email to prevent timing oracle.
 */
export async function resolveIdentifier(identifier: string): Promise<{ email: string; found: boolean }> {
  const normalized = identifier.trim().toLowerCase()
  const handleRegex = /^[a-z0-9_]{3,20}$/

  if (handleRegex.test(normalized) && !normalized.includes('@')) {
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.handle, normalized))
      .limit(1)

    if (user?.email) {
      return { email: user.email.toLowerCase(), found: true }
    }
    // Synthetic nonexistent address handed to better-auth for timing mitigation
    return { email: `inexistente-${normalized}@invalido.local`, found: false }
  }

  return { email: normalized, found: true }
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
  const sessionData = await auth.api.getSession({ headers })
  if (!sessionData?.user?.email) {
    return null
  }

  const normalizedEmail = sessionData.user.email.trim().toLowerCase()
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

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
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

  // 1. Activation — Requesting an OTP code
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
    const ip = getClientIp(request)

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
      return Response.json(
        { success: true },
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    }

    // Activation: check if address already has a password set.
    // If already activated, send nothing and return identical generic response.
    const alreadyActivated = await hasPassword(email)
    if (alreadyActivated) {
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

  // 2. Activation — Verifying OTP
  if (request.method === 'POST' && authPath === '/sign-in/email-otp') {
    const response = await auth.handler(request)
    if (response.ok) {
      return response
    }

    // Translates better-auth error codes to project standard: 400 { error: 'validacao' }
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

  // 3. Activation — Setting first password
  if (request.method === 'POST' && authPath === '/set-password') {
    // Gated on the better-auth session, NOT on getSessionUserByHeaders.
    //
    // This is first access: the invitee has just proved the six-digit code, so
    // `ba_user` and `session` exist — but the `users` profile row does not, and
    // is not created until /app/bem-vindo, after this call. getSessionUserByHeaders
    // is the *app profile* seam and returns null with no `users` row, which
    // answered 401 to every genuine activation and made the flow this task
    // exists to build unreachable. The OTP-issued session is the proof the code
    // was verified; a profile is not, and cannot be, required here.
    const sessionData = await auth.api.getSession({ headers: request.headers })
    const sessionEmail = sessionData?.user?.email?.trim().toLowerCase()
    if (!sessionEmail) {
      return Response.json(
        { error: 'nao_autenticado', message: 'É necessário entrar para continuar.' },
        { status: 401, headers: { 'content-type': 'application/json' } },
      )
    }

    const bodyText = await request.text()
    let body: Record<string, unknown>
    try {
      body = JSON.parse(bodyText)
    } catch {
      return Response.json(
        { error: 'validacao', message: 'Corpo da requisição inválido.' },
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''
    if (
      newPassword.length < 8 ||
      newPassword.length > 128 ||
      // No handle yet: the profile is created after this call, so the email
      // local-part is the only user context that exists at first access.
      isForbiddenPassword(newPassword, { email: sessionEmail })
    ) {
      return Response.json(
        { error: 'validacao', message: 'Senha inválida ou muito fraca.' },
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    const setPwRes = await auth.api.setPassword({
      body: { newPassword },
      headers: request.headers,
      asResponse: true,
    })

    if (setPwRes.ok) {
      return Response.json(
        { success: true },
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    return Response.json(
      { error: 'validacao', message: 'Não foi possível definir a senha.' },
      { status: 400, headers: { 'content-type': 'application/json' } },
    )
  }

  // 4. Daily sign-in with handle or email + password (POST /api/auth/entrar).
  // Deliberately not better-auth's own /sign-in/email: that name promises an
  // email, and this field accepts a handle. The delegation below still calls
  // better-auth's handler, so /sign-in/email stays denied from outside.
  if (request.method === 'POST' && authPath === '/entrar') {
    const bodyText = await request.text()
    let body: Record<string, unknown>
    try {
      body = JSON.parse(bodyText)
    } catch {
      return Response.json(
        { error: 'validacao', message: 'E-mail, usuário ou senha incorretos.' },
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    const rawIdentifier = typeof body.identificador === 'string' ? body.identificador : ''
    const password = typeof body.senha === 'string' ? body.senha : ''

    const ip = getClientIp(request)

    // Rate limit check counted BEFORE identifier resolution
    const rateLimitExceeded = await checkSignInLimit(rawIdentifier, ip)
    if (rateLimitExceeded) {
      return Response.json(rateLimitExceeded, {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    }

    if (!rawIdentifier || !password) {
      return Response.json(
        { error: 'validacao', message: 'E-mail, usuário ou senha incorretos.' },
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    // Resolve identifier: turns handle to email, or dummy email if not found
    const resolved = await resolveIdentifier(rawIdentifier)

    // Delegate to better-auth sign-in/email
    // Note: better-auth runs password hashing for unknown users, ensuring uniform timing
    const signInRequest = new Request(`${betterAuthUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({
        email: resolved.email,
        password,
      }),
    })

    const response = await auth.handler(signInRequest)
    if (response.ok) {
      return response
    }

    // Indistinguishable response for unknown identifier or wrong password
    return Response.json(
      { error: 'validacao', message: 'E-mail, usuário ou senha incorretos.' },
      { status: 400, headers: { 'content-type': 'application/json' } },
    )
  }

  // 5. Reset — Request OTP code
  if (request.method === 'POST' && authPath === '/forget-password/email-otp') {
    const bodyText = await request.text()
    let body: Record<string, unknown>
    try {
      body = JSON.parse(bodyText)
    } catch {
      return Response.json(
        { error: 'requisicao_invalida', message: 'Corpo da requisição inválido.' },
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const ip = getClientIp(request)

    // Rate limit check
    const rateLimitExceeded = await checkOtpRequestLimit(email, ip)
    if (rateLimitExceeded) {
      return Response.json(rateLimitExceeded, {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    }

    // Same warm as the activation branch above, for the same reason: this
    // branch also sends mail, so without it an address that gets a reset code
    // pays nodemailer's 62 ms first load and an unknown one does not. The
    // activation branch's warm does not cover this one -- a lambda can receive
    // a reset request before ever seeing an activation request.
    await import('nodemailer')

    // Enumeration defense: unknown or non-allowlisted address returns same generic response and sends nothing
    const allowed = await isEmailAllowed(email)
    const hasExistingPassword = await hasPassword(email)
    if (!allowed || !hasExistingPassword) {
      return Response.json(
        { success: true },
        { status: 200, headers: { 'content-type': 'application/json' } },
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

  // 6. Reset — Complete with OTP and new password
  if (request.method === 'POST' && authPath === '/email-otp/reset-password') {
    const bodyText = await request.text()
    let body: Record<string, unknown>
    try {
      body = JSON.parse(bodyText)
    } catch {
      return Response.json(
        { error: 'validacao', message: 'Corpo da requisição inválido.' },
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const newPassword = typeof body.password === 'string' ? body.password : ''

    // Weak-password floor validation server-side
    if (
      newPassword.length < 8 ||
      newPassword.length > 128 ||
      isForbiddenPassword(newPassword, { email })
    ) {
      return Response.json(
        { error: 'validacao', message: 'Senha inválida ou muito fraca.' },
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    const response = await auth.handler(
      new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: bodyText,
      }),
    )

    if (response.ok) {
      return response
    }

    return Response.json(
      { error: 'validacao', message: 'Código inválido ou expirado.' },
      { status: 400, headers: { 'content-type': 'application/json' } },
    )
  }

  // 7. Change password — Authenticated user
  if (request.method === 'POST' && authPath === '/change-password') {
    const sessionUser = await getSessionUserByHeaders(request.headers)
    if (!sessionUser) {
      return Response.json(
        { error: 'nao_autenticado', message: 'É necessário entrar para continuar.' },
        { status: 401, headers: { 'content-type': 'application/json' } },
      )
    }

    // Rate limit check: 10 changes per user per hour
    const rateLimitExceeded = await checkPasswordChangeLimit(sessionUser.id)
    if (rateLimitExceeded) {
      return Response.json(rateLimitExceeded, {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    }

    const bodyText = await request.text()
    let body: Record<string, unknown>
    try {
      body = JSON.parse(bodyText)
    } catch {
      return Response.json(
        { error: 'validacao', message: 'Corpo da requisição inválido.' },
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

    if (!currentPassword) {
      return Response.json(
        { error: 'validacao', message: 'Informe a senha atual.' },
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    const [appUser] = await db
      .select({ handle: users.handle })
      .from(users)
      .where(eq(users.id, sessionUser.id))
      .limit(1)

    if (
      newPassword.length < 8 ||
      newPassword.length > 128 ||
      isForbiddenPassword(newPassword, { email: sessionUser.email, handle: appUser?.handle })
    ) {
      return Response.json(
        { error: 'validacao', message: 'Senha inválida ou muito fraca.' },
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    // Delegate to better-auth with revokeOtherSessions: true enforced
    const changePwReq = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      }),
    })

    const response = await auth.handler(changePwReq)
    if (response.ok) {
      return response
    }

    return Response.json(
      { error: 'validacao', message: 'Senha atual incorreta.' },
      { status: 400, headers: { 'content-type': 'application/json' } },
    )
  }

  // 8. Allowed session check and sign-out
  if ((request.method === 'GET' || request.method === 'HEAD') && authPath === '/get-session') {
    return auth.handler(request)
  }

  if (request.method === 'POST' && authPath === '/sign-out') {
    return auth.handler(request)
  }

  // 9. Deny all other routes by default with 404 in project error format
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
