import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP } from 'better-auth/plugins/email-otp'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { isForbiddenPassword, requestOtpSchema, verifyOtpSchema } from '../../shared/schemas/auth'
import { db } from '../db'
import { getClientIp } from '../utils/client-ip'
import { allowed_emails, users } from '../db/schema'
import { getEmailFrom, getTransport, redactEmail } from '../utils/email'
import { logger } from '../utils/logger'
import { withRetry } from '../utils/retry'
import {
  checkOtpRequestLimit,
  checkPasswordChangeLimit,
  checkRateLimit,
  checkSignInAccountLimit,
  checkSignInIpLimit,
} from './rate-limit'
import { assertWriteBudget } from '../utils/session'

const betterAuthSecret = process.env.BETTER_AUTH_SECRET
const betterAuthUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3000'

if (!betterAuthSecret) {
  throw new Error('A variável de ambiente BETTER_AUTH_SECRET não foi informada.')
}

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

type BetterAuthLogLevel = 'debug' | 'info' | 'warn' | 'error'

function describeBetterAuthLogArg(arg: unknown): Record<string, string> {
  if (!(arg instanceof Error)) {
    return { type: typeof arg }
  }
  const cause: unknown = arg.cause
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string'
      ? cause.code
      : undefined
  return code ? { name: arg.name, code } : { name: arg.name }
}

function logBetterAuth(level: BetterAuthLogLevel, message: string, ...args: unknown[]): void {
  const safeMessage = String(message).replace(/failed query[\s\S]*/i, 'Failed query [SQL omitido]')
  const context = {
    module: 'auth',
    source: 'service' as const,
    operation: 'better_auth',
    ...(args.length > 0 ? { context: { args: args.map(describeBetterAuthLogArg) } } : {}),
  }
  logger[level](`[better-auth] ${safeMessage}`, context)
}

export const auth = betterAuth({
  secret: betterAuthSecret,
  baseURL: betterAuthUrl,

  logger: {
    log: logBetterAuth,
  },

  // Non-APIErrors are rethrown to handleAuthRequest's caller instead of being printed by better-call,
  // which would print the raw failed query with its bound values. defineApiHandler logs them through logger.
  onAPIError: { throw: true },

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
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },

  advanced: {
    useSecureCookies: true,
  },

  rateLimit: {
    enabled: false,
  },

  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 10,
      allowedAttempts: 5,
      sendVerificationOTP: async ({ email, otp, type }) => {
        const subject =
          type === 'sign-in' ? 'Seu código de acesso - Meus Livros' : 'Seu código - Meus Livros'
        const emailRedacted = redactEmail(email)

        const startTime = performance.now()
        // Awaited on purpose: decided by the owner on 2026-10-10 (docs/agent-workflow.md,
        // item 7). On Vercel, work left running after the response may never finish, so a
        // fire-and-forget send could silently drop the code. The .catch below logs send
        // failures and never rethrows, so the response stays the generic { success: true }.
        // The cost is a timing signal, accepted for an invite-only instance.
        await withRetry(
          async () => {
            const transport = await getTransport()
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
                `- Meus Livros`,
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
    return { email: `inexistente-${normalized}@invalido.local`, found: false }
  }

  return { email: normalized, found: true }
}

export interface SessionUser {
  id: string
  email?: string
}

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

const activationOtpRequestSchema = requestOtpSchema.extend({
  type: z.literal('sign-in'),
})

const FORWARDED_HEADERS = [
  'cookie',
  'origin',
  'referer',
  'sec-fetch-site',
  'sec-fetch-mode',
  'sec-fetch-dest',
  'user-agent',
  'x-forwarded-for',
  'x-real-ip',
] as const

function parseJsonObject(text: string): Record<string, unknown> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null
  }
  return parsed as Record<string, unknown>
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const mediaType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (mediaType !== 'application/json') {
    return null
  }
  return parseJsonObject(await request.text())
}

function invalidOtpRequestResponse(): Response {
  return Response.json(
    { error: 'validacao', message: 'Corpo da requisição inválido.' },
    { status: 400, headers: { 'content-type': 'application/json' } },
  )
}

// The one answer for a wrong, expired, used or exhausted code, and for an address no longer on the allowlist.
// Same status and body in every case, so the caller cannot tell them apart. better-auth's TOO_MANY_ATTEMPTS
// lands here too: a 429 for it would reveal that the address has a live code, which only invitees get.
function invalidOtpResponse(): Response {
  return Response.json(
    { error: 'validacao', message: 'Código inválido ou expirado.' },
    { status: 400, headers: { 'content-type': 'application/json' } },
  )
}

// Every verify attempt for an address counts here, invited or not, before any other check. The 429 is the same
// for both, so it reveals nothing about the account (security.md §4.3, §8).
function otpVerifyLimitResponse(): Response {
  return Response.json(
    { error: 'muitas_tentativas', message: 'Muitas tentativas. Peça um novo código e tente mais tarde.' },
    { status: 429, headers: { 'content-type': 'application/json' } },
  )
}

// Deletes what removeInvite (services/invites.ts) deletes, for an address whose invite is already gone: its
// sessions and its password credential. session."userId" holds ba_user.id, so it is reached through ba_user by e-mail.
async function revokeAccessFor(email: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      DELETE FROM "session"
      WHERE "userId" IN (
        SELECT id FROM ba_user WHERE email = ${email}
      )
    `)

    await tx.execute(sql`
      DELETE FROM "account"
      WHERE "providerId" = 'credential'
        AND "userId" IN (
          SELECT id FROM ba_user WHERE email = ${email}
        )
    `)
  })
}

// Headers for every request this module builds for better-auth. Nothing else from the client's headers
// is forwarded, so fields it adds (name, image) cannot reach the OTP endpoints.
function buildForwardedHeaders(request: Request): Headers {
  const headers = new Headers({ 'content-type': 'application/json' })
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name)
    if (value !== null) {
      headers.set(name, value)
    }
  }
  return headers
}

function warnRefusedOtp(email: string, operation: 'sign_in_otp' | 'reset_password'): void {
  logger.warn(`[auth] Código recusado para ${redactEmail(email)}: o e-mail não está na lista de convidados`, {
    module: 'auth',
    source: 'service',
    operation,
  })
}

function genericOtpResponse(): Response {
  return Response.json(
    { success: true },
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

async function forwardOtpRequest(
  request: Request,
  body: { email: string; type?: 'sign-in' },
  operation: string,
): Promise<Response> {
  const response = await auth.handler(
    new Request(request.url, {
      method: 'POST',
      headers: buildForwardedHeaders(request),
      body: JSON.stringify(body),
    }),
  )

  if (!response.ok) {
    logger.warn(`[auth] O better-auth recusou o pedido de código para ${redactEmail(body.email)}`, {
      module: 'auth',
      source: 'service',
      operation,
      context: { status: response.status },
    })
  }

  return genericOtpResponse()
}

async function stripSessionToken(response: Response): Promise<Response> {
  const contentType = response.headers.get('content-type')
  if (
    !contentType ||
    !contentType.toLowerCase().includes('application/json') ||
    response.status === 204 ||
    response.status === 304 ||
    !response.body
  ) {
    return response
  }

  const clone = response.clone()
  const text = await clone.text()
  if (!text || text.trim() === '') {
    return response
  }

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return response
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return response
  }

  const record = { ...(data as Record<string, unknown>) }
  let modified = false

  if ('token' in record) {
    delete record.token
    modified = true
  }

  if (
    typeof record.session === 'object' &&
    record.session !== null &&
    !Array.isArray(record.session) &&
    'token' in record.session
  ) {
    const session = { ...(record.session as Record<string, unknown>) }
    delete session.token
    record.session = session
    modified = true
  }

  if (!modified) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.delete('content-length')
  if (typeof response.headers.getSetCookie === 'function') {
    const cookies = response.headers.getSetCookie()
    if (cookies.length > 0) {
      headers.delete('set-cookie')
      for (const cookie of cookies) {
        headers.append('set-cookie', cookie)
      }
    }
  }

  return new Response(JSON.stringify(record), {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export async function handleAuthRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const authPath = url.pathname.replace(/^\/api\/auth/, '').replace(/\/$/, '')

  if (request.method === 'POST' && authPath === '/email-otp/send-verification-otp') {
    const parsed = activationOtpRequestSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return invalidOtpRequestResponse()
    }

    const { email, type } = parsed.data
    const ip = getClientIp(request.headers)

    const rateLimitExceeded = await checkOtpRequestLimit(email, ip)
    if (rateLimitExceeded) {
      return Response.json(rateLimitExceeded, {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    }

    await import('nodemailer')

    if (!(await isEmailAllowed(email)) || (await hasPassword(email))) {
      return genericOtpResponse()
    }

    return forwardOtpRequest(request, { email, type }, 'send_activation_otp')
  }

  if (request.method === 'POST' && authPath === '/sign-in/email-otp') {
    const parsed = verifyOtpSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return invalidOtpResponse()
    }

    const { email, otp } = parsed.data
    // Before the allowlist: an atomic upsert, so parallel guesses cannot read the same count (H1 item 2).
    if (!(await checkRateLimit(`otp-verify:email:${email}`, 5))) {
      return otpVerifyLimitResponse()
    }

    // Checked when the code is consumed, so a code issued before the invite was removed signs nobody in (TASK-069).
    if (!(await isEmailAllowed(email))) {
      warnRefusedOtp(email, 'sign_in_otp')
      return invalidOtpResponse()
    }

    // Only email and otp go to better-auth: its sign-in also reads name and image when it creates a user.
    const response = await auth.handler(
      new Request(request.url, {
        method: 'POST',
        headers: buildForwardedHeaders(request),
        body: JSON.stringify({ email, otp }),
      }),
    )
    if (response.ok) {
      if (!(await isEmailAllowed(email))) {
        await revokeAccessFor(email)
        return invalidOtpResponse()
      }
      return stripSessionToken(response)
    }

    return invalidOtpResponse()
  }

  if (request.method === 'POST' && authPath === '/set-password') {
    const sessionData = await auth.api.getSession({ headers: request.headers })
    const sessionEmail = sessionData?.user?.email?.trim().toLowerCase()
    if (!sessionData || !sessionEmail) {
      return Response.json(
        { error: 'nao_autenticado', message: 'É necessário entrar para continuar.' },
        { status: 401, headers: { 'content-type': 'application/json' } },
      )
    }

    try {
      await assertWriteBudget(sessionEmail)
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'statusCode' in e && e.statusCode === 429 && 'data' in e) {
        return Response.json(
          e.data,
          { status: 429, headers: { 'content-type': 'application/json' } },
        )
      }
      throw e
    }

    const rateLimitOk = await checkRateLimit(`setpw:email:${sessionEmail}`, 10)
    if (!rateLimitOk) {
      return Response.json(
        {
          error: 'muitas_tentativas',
          message: 'Muitas tentativas. Aguarde uma hora e tente novamente.',
        },
        { status: 429, headers: { 'content-type': 'application/json' } },
      )
    }

    if (await hasPassword(sessionEmail)) {
      return Response.json(
        { error: 'validacao', message: 'Não foi possível definir a senha.' },
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    const body = parseJsonObject(await request.text())
    if (!body) {
      return Response.json(
        { error: 'validacao', message: 'Corpo da requisição inválido.' },
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''
    if (
      newPassword.length < 8 ||
      newPassword.length > 128 ||
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
      if (!(await isEmailAllowed(sessionEmail))) {
        await revokeAccessFor(sessionEmail)
        return Response.json(
          { error: 'validacao', message: 'Não foi possível definir a senha.' },
          { status: 400, headers: { 'content-type': 'application/json' } },
        )
      }
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

  if (request.method === 'POST' && authPath === '/entrar') {
    const body = parseJsonObject(await request.text())
    if (!body) {
      return Response.json(
        { error: 'validacao', message: 'E-mail, usuário ou senha incorretos.' },
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    const rawIdentifier = typeof body.identificador === 'string' ? body.identificador : ''
    const password = typeof body.senha === 'string' ? body.senha : ''

    const ip = getClientIp(request.headers)

    // IP first, before any lookup. The account buckets are keyed by the resolved e-mail, so a handle and
    // the e-mail of the same account share them (TASK-067: 50 per account).
    const ipLimitExceeded = await checkSignInIpLimit(ip)
    if (ipLimitExceeded) {
      return Response.json(ipLimitExceeded, {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    }

    const resolved = await resolveIdentifier(rawIdentifier)

    const accountLimitExceeded = await checkSignInAccountLimit(resolved.email, ip)
    if (accountLimitExceeded) {
      return Response.json(accountLimitExceeded, {
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
      if (!(await isEmailAllowed(resolved.email))) {
        await revokeAccessFor(resolved.email)
        return Response.json(
          { error: 'validacao', message: 'E-mail, usuário ou senha incorretos.' },
          { status: 400, headers: { 'content-type': 'application/json' } },
        )
      }
      return stripSessionToken(response)
    }

    return Response.json(
      { error: 'validacao', message: 'E-mail, usuário ou senha incorretos.' },
      { status: 400, headers: { 'content-type': 'application/json' } },
    )
  }

  if (request.method === 'POST' && authPath === '/forget-password/email-otp') {
    const parsed = requestOtpSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return invalidOtpRequestResponse()
    }

    const { email } = parsed.data
    const ip = getClientIp(request.headers)

    const rateLimitExceeded = await checkOtpRequestLimit(email, ip)
    if (rateLimitExceeded) {
      return Response.json(rateLimitExceeded, {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    }

    await import('nodemailer')

    const allowed = await isEmailAllowed(email)
    const hasExistingPassword = await hasPassword(email)
    if (!allowed || !hasExistingPassword) {
      return genericOtpResponse()
    }

    return forwardOtpRequest(request, { email }, 'send_reset_otp')
  }

  if (request.method === 'POST' && authPath === '/email-otp/reset-password') {
    const body = parseJsonObject(await request.text())
    if (!body) {
      return Response.json(
        { error: 'validacao', message: 'Corpo da requisição inválido.' },
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    const parsed = verifyOtpSchema.safeParse({ email: body.email, otp: body.otp })
    if (!parsed.success) {
      return invalidOtpResponse()
    }

    const { email, otp } = parsed.data
    // Same bucket as sign-in (H1 item 2). Before the password rules and the allowlist, for invitees and everyone else alike.
    if (!(await checkRateLimit(`otp-verify:email:${email}`, 5))) {
      return otpVerifyLimitResponse()
    }

    const newPassword = typeof body.password === 'string' ? body.password : ''

    // Does not depend on the address or the user, so every caller gets the same answer (TASK-069, item 2).
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

    if (!(await isEmailAllowed(email))) {
      warnRefusedOtp(email, 'reset_password')
      return invalidOtpResponse()
    }

    // Checked without consuming the code: better-auth consumes it when the password is set.
    const check = await auth.api.checkVerificationOTP({
      body: { email, type: 'forget-password', otp },
      asResponse: true,
    })
    if (!check.ok) {
      return invalidOtpResponse()
    }

    // Read only after the code has been proven, so the handle check answers only the owner of the mailbox.
    const [appUser] = await db
      .select({ handle: users.handle })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (isForbiddenPassword(newPassword, { email, handle: appUser?.handle })) {
      return Response.json(
        { error: 'validacao', message: 'Senha inválida ou muito fraca.' },
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    const response = await auth.handler(
      new Request(request.url, {
        method: 'POST',
        headers: buildForwardedHeaders(request),
        body: JSON.stringify({ email, otp, password: newPassword }),
      }),
    )

    if (response.ok) {
      // The allowlist was read before better-auth hashed the password. If the invite was removed in that window,
      // the credential just written must go too, with the sessions (H1 item 3).
      if (!(await isEmailAllowed(email))) {
        await revokeAccessFor(email)
        warnRefusedOtp(email, 'reset_password')
        return invalidOtpResponse()
      }
      return response
    }

    return invalidOtpResponse()
  }

  if (request.method === 'POST' && authPath === '/change-password') {
    const sessionUser = await getSessionUserByHeaders(request.headers)
    if (!sessionUser) {
      return Response.json(
        { error: 'nao_autenticado', message: 'É necessário entrar para continuar.' },
        { status: 401, headers: { 'content-type': 'application/json' } },
      )
    }

    try {
      await assertWriteBudget(sessionUser.email ?? sessionUser.id)
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'statusCode' in e && e.statusCode === 429 && 'data' in e) {
        return Response.json(
          e.data,
          { status: 429, headers: { 'content-type': 'application/json' } },
        )
      }
      throw e
    }

    const rateLimitExceeded = await checkPasswordChangeLimit(sessionUser.id)
    if (rateLimitExceeded) {
      return Response.json(rateLimitExceeded, {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    }

    const body = parseJsonObject(await request.text())
    if (!body) {
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
      return stripSessionToken(response)
    }

    return Response.json(
      { error: 'validacao', message: 'Senha atual incorreta.' },
      { status: 400, headers: { 'content-type': 'application/json' } },
    )
  }

  if ((request.method === 'GET' || request.method === 'HEAD') && authPath === '/get-session') {
    return stripSessionToken(await auth.handler(request))
  }

  // Not counted against the write budget: signing out must never be refused.
  if (request.method === 'POST' && authPath === '/sign-out') {
    return auth.handler(request)
  }

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
