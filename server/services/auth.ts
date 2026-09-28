import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP } from 'better-auth/plugins/email-otp'
import { and, eq, isNotNull } from 'drizzle-orm'
import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { isForbiddenPassword, requestOtpSchema } from '../../shared/schemas/auth'
import { db } from '../db'
import { getClientIp } from '../utils/client-ip'
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
        const transport = await getTransport()
        const subject =
          type === 'sign-in' ? 'Seu código de acesso - Meus Livros' : 'Seu código - Meus Livros'
        const emailRedacted = redactEmail(email)

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
    { error: 'requisicao_invalida', message: 'Corpo da requisição inválido.' },
    { status: 400, headers: { 'content-type': 'application/json' } },
  )
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
  const headers = new Headers({ 'content-type': 'application/json' })
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name)
    if (value !== null) {
      headers.set(name, value)
    }
  }

  const response = await auth.handler(
    new Request(request.url, {
      method: 'POST',
      headers,
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
    const response = await auth.handler(request)
    if (response.ok) {
      return response
    }

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

  if (request.method === 'POST' && authPath === '/set-password') {
    const sessionData = await auth.api.getSession({ headers: request.headers })
    const sessionEmail = sessionData?.user?.email?.trim().toLowerCase()
    if (!sessionEmail) {
      return Response.json(
        { error: 'nao_autenticado', message: 'É necessário entrar para continuar.' },
        { status: 401, headers: { 'content-type': 'application/json' } },
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

    const resolved = await resolveIdentifier(rawIdentifier)

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
    const bodyText = await request.text()
    const body = parseJsonObject(bodyText)
    if (!body) {
      return Response.json(
        { error: 'validacao', message: 'Corpo da requisição inválido.' },
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const newPassword = typeof body.password === 'string' ? body.password : ''

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

  if (request.method === 'POST' && authPath === '/change-password') {
    const sessionUser = await getSessionUserByHeaders(request.headers)
    if (!sessionUser) {
      return Response.json(
        { error: 'nao_autenticado', message: 'É necessário entrar para continuar.' },
        { status: 401, headers: { 'content-type': 'application/json' } },
      )
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
      return response
    }

    return Response.json(
      { error: 'validacao', message: 'Senha atual incorreta.' },
      { status: 400, headers: { 'content-type': 'application/json' } },
    )
  }

  if ((request.method === 'GET' || request.method === 'HEAD') && authPath === '/get-session') {
    return auth.handler(request)
  }

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
