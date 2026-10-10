import { createHash } from 'node:crypto'
import type { Transporter } from 'nodemailer'
import { eq, inArray, sql } from 'drizzle-orm'
import { createApp, toWebHandler } from 'h3'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  auth,
  getSessionUserByHeaders,
  handleAuthRequest as dispatchAuthRequest,
  resolveIdentifier,
} from '../../server/services/auth'
import { removeInvite } from '../../server/services/invites'
import { getClientIp } from '../../server/utils/client-ip'
import { setTransport } from '../../server/utils/email'
import { deleteRateLimits, rateLimitHashes, uniqueTestIp } from './fixtures'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)

// A six-digit code other than `real`, for requests that must be refused.
function wrongOtpFor(real: string): string {
  return real === '000000' ? '111111' : '000000'
}

// The 429 for the verify limit, the same for an invitee and for an address with no invite.
const OTP_VERIFY_LIMIT_BODY = {
  error: 'muitas_tentativas',
  message: 'Muitas tentativas. Peça um novo código e tente mais tarde.',
}

// The 400 for a wrong, expired or exhausted code, and for an address with no invite.
const INVALID_OTP_BODY = { error: 'validacao', message: 'Código inválido ou expirado.' }

function cookieHeaderFrom(res: Response): string {
  const jar = new Map<string, string>()
  for (const raw of res.headers.getSetCookie()) {
    const pair = raw.split(';')[0]
    if (!pair) continue
    const eq = pair.indexOf('=')
    if (eq <= 0) continue
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
}

describe.skipIf(!hasDatabaseUrl)('TASK-027 - Password authentication + activation/reset OTP flows', () => {
  let db: typeof import('../../server/db')['db']
  let schema: typeof import('../../server/db/schema')
  const testId = Date.now()
  const allowedEmail = `test-auth-${testId}@example.com`
  const nonAllowedEmail = `test-blocked-${testId}@example.com`

  const activationEmail = `test-ativar-${testId}@example.com`
  const pendingEmail = `test-pendente-${testId}@example.com`
  const activationFlowEmail = `test-ativar-flow-${testId}@example.com`
  const activationFlowHandle = `taf${testId % 1000000000}`
  const testIp = uniqueTestIp()
  const activationIp = uniqueTestIp()
  const enumerationIp = uniqueTestIp()

  const sentEmails: Array<{ to: string; subject: string; text: string }> = []
  const createdEmails: string[] = [allowedEmail, nonAllowedEmail, activationEmail, pendingEmail, activationFlowEmail]
  const customIp = uniqueTestIp()
  const gateIp = uniqueTestIp()
  const signInIdIp = uniqueTestIp()
  const signInIpLimitIp = uniqueTestIp()
  const allTestIps = [testIp, activationIp, enumerationIp, customIp, gateIp, signInIdIp, signInIpLimitIp]
  const createdRateLimitKeys: string[] = [
    `otp:ip:${testIp}`,
    `otp:ip:${customIp}`,
    `otp:ip:${gateIp}`,
    `signin:ip:${signInIdIp}`,
    `signin:ip:${signInIpLimitIp}`,
    `otp:ip:${activationIp}`,
    `signin:ip:${activationIp}`,
    `otp:ip:${enumerationIp}`,
    `signin:ip:${enumerationIp}`,
  ]

  const testHandle = `ta${testId % 1000000000}`
  const createdHandles: string[] = [testHandle, activationFlowHandle]
  const initialPassword = 'InitialPassword123'
  const controlKey = `auth-cleanup-control:${testId}`
  let controlCreated = false

  // Record the identifier/IP combinations from real requests; dispatch remains real.
  async function handleAuthRequest(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname
    if (request.method === 'POST') {
      const body: unknown = await request.clone().json().catch(() => null)
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        const ip = getClientIp(request.headers)
        if (pathname === '/api/auth/entrar') {
          const identifier = 'identificador' in body && typeof body.identificador === 'string'
            ? body.identificador.trim().toLowerCase() : ''
          // The account buckets are keyed by the resolved e-mail, so both spellings are recorded.
          const resolved = await resolveIdentifier(identifier)
          createdRateLimitKeys.push(
            `signin:ip:${ip}`,
            `signin:id:${identifier}`,
            `signin:idip:${identifier}:${ip}`,
            `signin:id:${resolved.email}`,
            `signin:idip:${resolved.email}:${ip}`,
          )
        }
        if (pathname.startsWith('/api/auth/email-otp/') && 'email' in body && typeof body.email === 'string') {
          createdRateLimitKeys.push(`otp:ip:${ip}`, `otp:email:${body.email.trim().toLowerCase()}`)
        }
      }
    }
    return dispatchAuthRequest(request)
  }

  function ownedRateLimitKeys(): string[] {
    return [
      ...createdRateLimitKeys,
      ...allTestIps.flatMap((ip) => [`otp:ip:${ip}`, `signin:ip:${ip}`]),
      ...createdEmails.flatMap((e) => [
        `otp:email:${e.toLowerCase().trim()}`,
        `otp-verify:email:${e.toLowerCase().trim()}`,
        `signin:id:${e.toLowerCase().trim()}`,
        `setpw:email:${e.toLowerCase().trim()}`,
      ]),
      ...createdHandles.map((h) => `signin:id:${h.toLowerCase().trim()}`),
    ]
  }

  async function createActiveMember(opts: {
    email: string
    handle: string
    password?: string
    name?: string
  }): Promise<{ email: string; handle: string; password: string }> {
    const password = opts.password ?? initialPassword
    createdEmails.push(opts.email)
    createdHandles.push(opts.handle)

    await db.insert(schema.allowed_emails).values({
      email: opts.email,
      note: 'TASK-027 active member fixture',
    })

    await db.insert(schema.users).values({
      email: opts.email,
      handle: opts.handle,
      display_name: opts.name ?? 'Test Member',
      profile_visibility: 'publico',
    })

    const signUpRes = await auth.api.signUpEmail({
      body: {
        name: opts.name ?? 'Test Member',
        email: opts.email,
        password,
      },
      asResponse: true,
    })
    if (signUpRes.status !== 200) {
      throw new Error(`Falha ao registrar usuário activeMember: status ${signUpRes.status}`)
    }

    return { email: opts.email, handle: opts.handle, password }
  }

  beforeAll(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    schema = await import('../../server/db/schema')
    const [controlHash] = await rateLimitHashes([controlKey])
    await db.execute(sql`INSERT INTO rate_limit (key, count, window_start) VALUES (${controlHash}, 1, date_trunc('hour', now()))`)
    controlCreated = true

    process.env.EMAIL_FROM = 'test-remetente@gmail.com'
    process.env.GMAIL_APP_PASSWORD = 'test-app-password'

    const mockTransport = {
      sendMail: async (mailOptions: { to: string; subject: string; text: string }) => {
        // Slower than the handler's work after the callback, so a send that is not awaited
        // is still pending when the response resolves (see the first-access activation test).
        await new Promise((resolve) => setTimeout(resolve, 100))
        sentEmails.push(mailOptions)
        return { messageId: 'mock-msg-id' }
      },
    } as unknown as Transporter

    setTransport(mockTransport)

    await db.insert(schema.allowed_emails).values([
      { email: allowedEmail, note: 'TASK-027 integration test' },
      { email: activationEmail, note: 'TASK-027 first-access test' },
      { email: pendingEmail, note: 'A-1 invited, never activated' },
      { email: activationFlowEmail, note: 'TASK-027 activation flow' },
    ])

    await db.insert(schema.users).values([
      {
        email: allowedEmail,
        handle: testHandle,
        display_name: 'Test Auth User',
      },
      {
        email: activationFlowEmail,
        handle: activationFlowHandle,
        display_name: 'Activation Flow User',
      },
    ])

    const initSignUp = await auth.api.signUpEmail({
      body: {
        name: 'Test Auth User',
        email: allowedEmail,
        password: initialPassword,
      },
      asResponse: true,
    })
    if (initSignUp.status !== 200) {
      throw new Error(`Falha ao inicializar allowedEmail com senha: status ${initSignUp.status}`)
    }

    await purgeTestRateLimits()
  }, 30000)

  async function countSessionsFor(email: string): Promise<number> {
    const [row] = await db.execute(sql<{ n: number }>`
      SELECT count(s.*)::int AS n
      FROM "session" s
      JOIN ba_user u ON u.id = s."userId"
      WHERE u.email = ${email}
    `)
    return Number(row?.n ?? -1)
  }

  async function waitForEmail(index = 0, timeoutMs = 5000): Promise<{ to: string; subject: string; text: string }> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const mail = sentEmails[index]
      if (mail) return mail
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error(`Nenhum e-mail no índice ${index} após ${timeoutMs}ms.`)
  }

  afterEach(() => {
    sentEmails.length = 0
  })

  async function purgeTestRateLimits() {
    await deleteRateLimits(ownedRateLimitKeys())
  }

  afterAll(async () => {
    setTransport(null)

    await purgeTestRateLimits()

    for (const email of createdEmails) {
      await db.execute(sql`DELETE FROM verification WHERE identifier LIKE ${`%${email}%`}`)
    }

    const baUsers = await db.execute(sql<{ id: string }>`
      SELECT id FROM ba_user WHERE email IN (${sql.join(createdEmails.map((e) => sql`${e}`), sql`, `)})
    `)
    const userIds = baUsers.map((u) => u.id)
    if (userIds.length > 0) {
      await db.execute(sql`DELETE FROM session WHERE "userId" IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`)
      await db.execute(sql`DELETE FROM account WHERE "userId" IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`)
      await db.execute(sql`DELETE FROM ba_user WHERE id IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`)
    }

    await db.delete(schema.allowed_emails).where(inArray(schema.allowed_emails.email, createdEmails))
    await db.delete(schema.users).where(inArray(schema.users.email, createdEmails))

    await purgeTestRateLimits()
    const hashes = await rateLimitHashes(ownedRateLimitKeys())
    try {
      const remaining = await db.execute(sql`SELECT key FROM rate_limit WHERE key IN (${sql.join(hashes.map((key) => sql`${key}`), sql`, `)})`)
      expect(Array.from(remaining), 'Auth fixtures must leave no rate-limit buckets').toEqual([])
      if (controlCreated) {
        const [controlHash] = await rateLimitHashes([controlKey])
        const control = await db.execute(sql`SELECT count FROM rate_limit WHERE key = ${controlHash}`)
        expect(Array.from(control), 'Cleanup must preserve an unrelated bucket').toEqual([{ count: 1 }])
      }
    } finally {
      await deleteRateLimits([controlKey])
    }
  }, 30000)

  it('first access works for an invitee who has no profile row yet', async () => {

    const noProfileBefore = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, activationEmail))
    expect(noProfileBefore).toHaveLength(0)

    const codeRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': activationIp },
        body: JSON.stringify({ email: activationEmail, type: 'sign-in' }),
      }),
    )
    expect(codeRes.status).toBe(200)

    const mail = await waitForEmail()
    expect(mail.to).toBe(activationEmail)
    const otp = mail.text.match(/\b\d{6}\b/)?.[0]
    expect(otp).toBeTruthy()

    const verifyRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': activationIp },
        body: JSON.stringify({ email: activationEmail, otp }),
      }),
    )
    expect(verifyRes.status).toBe(200)
    const cookie = cookieHeaderFrom(verifyRes)
    expect(cookie).toBeTruthy()

    const noProfileAfterCode = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, activationEmail))
    expect(noProfileAfterCode).toHaveLength(0)

    const setPwRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/set-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cookie': cookie!,
          'x-forwarded-for': activationIp,
        },
        body: JSON.stringify({ newPassword: 'PrimeiroAcesso2026' }),
      }),
    )
    expect(setPwRes.status).toBe(200)

    const signInRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': activationIp },
        body: JSON.stringify({ identificador: activationEmail, senha: 'PrimeiroAcesso2026' }),
      }),
    )
    expect(signInRes.status).toBe(200)
    expect(cookieHeaderFrom(signInRes)).toBeTruthy()
  }, 30000)

  it('first access activation: allowlisted address receives code, sets password, and signs in', async () => {
    const req = new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': testIp,
      },
      body: JSON.stringify({ email: activationFlowEmail, type: 'sign-in' }),
    })

    const res = await handleAuthRequest(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    // The send is awaited (auth.ts), so the mail is recorded before the response resolves.
    expect(sentEmails.length).toBe(1)

    const emailData = await waitForEmail()
    expect(emailData.to).toBe(activationFlowEmail)

    const match = emailData.text.match(/\b\d{6}\b/)
    expect(match).not.toBeNull()
    const otp = match![0]

    const verifyReq = new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': testIp,
      },
      body: JSON.stringify({ email: activationFlowEmail, otp }),
    })

    const verifyRes = await handleAuthRequest(verifyReq)
    expect(verifyRes.status).toBe(200)
    const verifyBody = (await verifyRes.json()) as Record<string, unknown>
    expect(verifyBody).not.toHaveProperty('token')
    const cookie = cookieHeaderFrom(verifyRes)
    expect(cookie).toBeTruthy()

    const setPwReq = new Request('http://localhost:3000/api/auth/set-password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cookie': cookie!,
        'x-forwarded-for': testIp,
      },
      body: JSON.stringify({ newPassword: initialPassword }),
    })

    const setPwRes = await handleAuthRequest(setPwReq)
    expect(setPwRes.status).toBe(200)
    const setPwBody = await setPwRes.json()
    expect(setPwBody.success).toBe(true)
  }, 20000)

  it('an activation request for an already-activated address sends zero emails and returns generic response', async () => {
    const req = new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': testIp,
      },
      body: JSON.stringify({ email: allowedEmail, type: 'sign-in' }),
    })

    const res = await handleAuthRequest(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    expect(sentEmails.length).toBe(0)
  }, 20000)

  it('an activation request for a non-allowlisted address sends zero emails and returns generic response', async () => {
    const req = new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': testIp,
      },
      body: JSON.stringify({ email: nonAllowedEmail, type: 'sign-in' }),
    })

    const res = await handleAuthRequest(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    expect(sentEmails.length).toBe(0)
  }, 20000)

  it('sign-in with handle + password succeeds and sets session cookie', async () => {
    createdRateLimitKeys.push(`signin:id:${testHandle}`)

    const req = new Request('http://localhost:3000/api/auth/entrar', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': testIp,
      },
      body: JSON.stringify({
        identificador: testHandle,
        senha: initialPassword,
      }),
    })

    const res = await handleAuthRequest(req)
    expect(res.status).toBe(200)

    const rawSetCookie = res.headers.getSetCookie().join(' | ').toLowerCase()
    expect(rawSetCookie).toContain('httponly')
    expect(rawSetCookie).toContain('samesite=lax')
    const cookie = cookieHeaderFrom(res)
    expect(cookie).toBeTruthy()

    const headers = new Headers()
    headers.set('cookie', cookie!)
    const sessionUser = await getSessionUserByHeaders(headers)
    expect(sessionUser).not.toBeNull()
    expect(sessionUser?.email).toBe(allowedEmail)
  }, 20000)

  it('sign-in with email + password succeeds and sets session cookie', async () => {
    createdRateLimitKeys.push(`signin:id:${allowedEmail.toLowerCase()}`)

    const req = new Request('http://localhost:3000/api/auth/entrar', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': testIp,
      },
      body: JSON.stringify({
        identificador: allowedEmail,
        senha: initialPassword,
      }),
    })

    const res = await handleAuthRequest(req)
    expect(res.status).toBe(200)
    const cookie = cookieHeaderFrom(res)
    expect(cookie).toBeTruthy()

    const headers = new Headers()
    headers.set('cookie', cookie!)
    const sessionUser = await getSessionUserByHeaders(headers)
    expect(sessionUser).not.toBeNull()
    expect(sessionUser?.email).toBe(allowedEmail)
  }, 20000)

  it('TASK-065 - session token is omitted from /entrar and /get-session response bodies while preserving cookies', async () => {
    createdRateLimitKeys.push(`signin:id:${testHandle}`)

    const signInRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': testIp,
        },
        body: JSON.stringify({
          identificador: testHandle,
          senha: initialPassword,
        }),
      }),
    )
    expect(signInRes.status).toBe(200)
    expect(signInRes.headers.getSetCookie().length).toBeGreaterThan(0)
    const signInBody = (await signInRes.json()) as Record<string, unknown>
    expect(signInBody).toHaveProperty('user')
    expect(signInBody).not.toHaveProperty('token')

    const cookie = cookieHeaderFrom(signInRes)
    expect(cookie).toBeTruthy()

    const getSessionRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/get-session', {
        method: 'GET',
        headers: {
          cookie: cookie!,
          'x-forwarded-for': testIp,
        },
      }),
    )
    expect(getSessionRes.status).toBe(200)
    const sessionBody = (await getSessionRes.json()) as {
      user?: unknown
      session?: Record<string, unknown>
      token?: unknown
    }
    expect(sessionBody).toHaveProperty('user')
    expect(sessionBody).toHaveProperty('session')
    expect(sessionBody.session).not.toHaveProperty('token')
    expect(sessionBody).not.toHaveProperty('token')
  }, 20000)

  it('TASK-065 - unauthenticated /get-session passes through unchanged', async () => {
    const getSessionRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/get-session', {
        method: 'GET',
        headers: {
          'x-forwarded-for': testIp,
        },
      }),
    )
    expect(getSessionRes.status).toBe(200)
    const text = await getSessionRes.text()
    expect(text === 'null' || text === '').toBe(true)
  }, 20000)

  it('wrong password and unknown handle return byte-identical bodies and status 400', async () => {
    const unknownHandle = `unk_${testId % 1000000}`
    createdRateLimitKeys.push(`signin:id:${testHandle}`)
    createdRateLimitKeys.push(`signin:id:${unknownHandle}`)

    const wrongPwReq = new Request('http://localhost:3000/api/auth/entrar', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify({ identificador: testHandle, senha: 'wrongPassword999' }),
    })
    const wrongPwRes = await handleAuthRequest(wrongPwReq)
    expect(wrongPwRes.status).toBe(400)
    const wrongPwText = await wrongPwRes.text()

    const unknownHandleReq = new Request('http://localhost:3000/api/auth/entrar', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify({ identificador: unknownHandle, senha: 'wrongPassword999' }),
    })
    const unknownHandleRes = await handleAuthRequest(unknownHandleReq)
    expect(unknownHandleRes.status).toBe(400)
    const unknownHandleText = await unknownHandleRes.text()

    expect(wrongPwText).toBe(unknownHandleText)
    const parsed = JSON.parse(wrongPwText)
    expect(parsed.error).toBe('validacao')
    expect(parsed.message).toBe('E-mail, usuário ou senha incorretos.')
  }, 20000)

  it('timing between unknown-identifier and wrong-password does not differ by an order of magnitude', async () => {
    const timingUnknownHandle = `unk_time_${testId % 1000000}`
    createdRateLimitKeys.push(`signin:id:${testHandle}`)
    createdRateLimitKeys.push(`signin:id:${timingUnknownHandle}`)

    const t0 = performance.now()
    await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ identificador: testHandle, senha: 'wrongPasswordTest' }),
      }),
    )
    const wrongPwDuration = performance.now() - t0

    const t1 = performance.now()
    await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ identificador: timingUnknownHandle, senha: 'wrongPasswordTest' }),
      }),
    )
    const unknownHandleDuration = performance.now() - t1

    const ratio = Math.max(wrongPwDuration, unknownHandleDuration) / Math.min(wrongPwDuration, unknownHandleDuration)
    expect(ratio).toBeLessThan(10)
  }, 20000)

  it('the 11th sign-in attempt for one identifier within an hour returns 429', async () => {
    const rateLimitHandle = `rl_${testId % 1000000}`
    createdRateLimitKeys.push(`signin:id:${rateLimitHandle}`)

    for (let i = 0; i < 10; i++) {
      const res = await handleAuthRequest(
        new Request('http://localhost:3000/api/auth/entrar', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': signInIdIp },
          body: JSON.stringify({ identificador: rateLimitHandle, senha: 'wrongPassword' }),
        }),
      )
      expect(res.status).toBe(400)
    }

    const eleventhRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': signInIdIp },
        body: JSON.stringify({ identificador: rateLimitHandle, senha: 'wrongPassword' }),
      }),
    )
    expect(eleventhRes.status).toBe(429)
    const body = await eleventhRes.json()
    expect(body.error).toBe('muitas_tentativas')
  }, 20000)

  it('the 31st sign-in attempt from one IP within an hour returns 429', async () => {

    const rawIpKey = `signin:ip:${signInIpLimitIp}`
    const hashedIpKey = createHash('sha256').update(rawIpKey).digest('hex')

    await db.execute(sql`
      INSERT INTO rate_limit (key, count, window_start)
      VALUES (${hashedIpKey}, 29, date_trunc('hour', now()))
      ON CONFLICT (key, window_start) DO UPDATE SET count = 29
    `)

    const unknownHandleId = `spray_${testId % 100000}_30`
    const unknownHandleId31 = `spray_${testId % 100000}_31`
    createdRateLimitKeys.push(
      `signin:id:${unknownHandleId}`,
      `signin:idip:${unknownHandleId}:${signInIpLimitIp}`,
      `signin:id:${unknownHandleId31}`,
      `signin:idip:${unknownHandleId31}:${signInIpLimitIp}`,
    )
    const thirtieth = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': signInIpLimitIp },
        body: JSON.stringify({ identificador: unknownHandleId, senha: 'wrongPassword' }),
      }),
    )

    expect(thirtieth.status).toBe(400)

    const [counter] = await db.execute(sql<{ count: number }>`
      SELECT count FROM rate_limit
      WHERE key = ${hashedIpKey}
        AND window_start = date_trunc('hour', now())
    `)
    expect(Number(counter?.count)).toBe(30)

    const thirtyFirstRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': signInIpLimitIp },
        body: JSON.stringify({ identificador: unknownHandleId31, senha: 'wrongPassword' }),
      }),
    )
    expect(thirtyFirstRes.status).toBe(429)
    const body = await thirtyFirstRes.json()
    expect(body.error).toBe('muitas_tentativas')
  }, 20000)

  it('password reset flow: sends code, resets password, invalidates old sessions, single-use code', async () => {
    const resetEmail = `test-reset-${Date.now()}@example.com`
    const resetHandle = `tr_${Date.now() % 10000000}`
    const resetUser = await createActiveMember({
      email: resetEmail,
      handle: resetHandle,
      password: initialPassword,
      name: 'Reset Flow User',
    })
    createdRateLimitKeys.push(`signin:id:${resetUser.handle}`)
    createdRateLimitKeys.push(`signin:id:${resetUser.email}`)

    const loginRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ identificador: resetUser.handle, senha: initialPassword }),
      }),
    )
    const oldSessionCookie = cookieHeaderFrom(loginRes)
    const oldHeaders = new Headers({ cookie: oldSessionCookie })
    expect(await getSessionUserByHeaders(oldHeaders)).not.toBeNull()

    const resetReq = new Request('http://localhost:3000/api/auth/forget-password/email-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify({ email: resetUser.email }),
    })
    const resetRes = await handleAuthRequest(resetReq)
    expect(resetRes.status).toBe(200)

    const emailData = await waitForEmail()
    expect(emailData.to).toBe(resetUser.email)
    const match = emailData.text.match(/\b\d{6}\b/)
    expect(match).not.toBeNull()
    const resetCode = match![0]

    const newPassword = 'ResetPassword456'
    const completeResetReq = new Request('http://localhost:3000/api/auth/email-otp/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify({ email: resetUser.email, otp: resetCode, password: newPassword }),
    })
    const completeResetRes = await handleAuthRequest(completeResetReq)
    expect(completeResetRes.status).toBe(200)

    expect(await countSessionsFor(resetUser.email)).toBe(0)

    const oldPwLogin = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ identificador: resetUser.handle, senha: initialPassword }),
      }),
    )
    expect(oldPwLogin.status).toBe(400)

    const newPwLogin = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ identificador: resetUser.handle, senha: newPassword }),
      }),
    )
    expect(newPwLogin.status).toBe(200)

    const replayRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: resetUser.email, otp: resetCode, password: 'AnotherPassword999' }),
      }),
    )
    expect(replayRes.status).toBe(400)
    const replayBody = await replayRes.json()
    expect(replayBody.error).toBe('validacao')
  }, 20000)

  it('change-password without currentPassword is rejected, and with valid currentPassword revokes other sessions', async () => {
    const currentPassword = 'CurrentPassword123'
    const newPassword = 'ChangedPassword789'
    const changeEmail = `test-change-${Date.now()}@example.com`
    const changeHandle = `tc_${Date.now() % 10000000}`
    const changeUser = await createActiveMember({
      email: changeEmail,
      handle: changeHandle,
      password: currentPassword,
      name: 'Change Password User',
    })
    createdRateLimitKeys.push(`signin:id:${changeUser.handle}`)
    createdRateLimitKeys.push(`signin:id:${changeUser.email}`)

    const loginResA = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ identificador: changeUser.handle, senha: currentPassword }),
      }),
    )

    expect(loginResA.status).toBe(200)
    const cookieA = cookieHeaderFrom(loginResA)
    const headersA = new Headers({ cookie: cookieA })

    const loginResB = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ identificador: changeUser.handle, senha: currentPassword }),
      }),
    )

    expect(loginResB.status).toBe(200)
    expect(cookieHeaderFrom(loginResB)).toBeTruthy()

    const noCurrentPwRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/change-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cookie': cookieA,
          'x-forwarded-for': testIp,
        },
        body: JSON.stringify({ currentPassword: '', newPassword }),
      }),
    )
    expect(noCurrentPwRes.status).toBe(400)
    const noCurrentBody = await noCurrentPwRes.json()
    expect(noCurrentBody.error).toBe('validacao')

    const userA = await getSessionUserByHeaders(headersA)
    expect(userA).not.toBeNull()
    createdRateLimitKeys.push(`pwchange:user:${userA!.id}`)

    const changePwRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/change-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cookie': cookieA,
          'x-forwarded-for': testIp,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    )
    expect(changePwRes.status).toBe(200)
    expect(changePwRes.headers.getSetCookie().length).toBeGreaterThan(0)
    const changePwBody = (await changePwRes.json()) as Record<string, unknown>
    expect(changePwBody).not.toHaveProperty('token')

    const updatedCookieA = cookieHeaderFrom(changePwRes) || cookieA
    const survivingHeaders = new Headers({ cookie: updatedCookieA })
    const userAfter = await getSessionUserByHeaders(survivingHeaders)
    expect(userAfter).not.toBeNull()

    expect(await countSessionsFor(changeUser.email)).toBe(1)
  }, 20000)

  it('passwords under 8 characters and senha123 are rejected server-side', async () => {

    const anonRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/set-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ newPassword: 'short' }),
      }),
    )
    expect(anonRes.status).toBe(401)

    const shortRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: allowedEmail, otp: '123456', password: 'curta7' }),
      }),
    )
    expect(shortRes.status).toBe(400)
    const shortBody = await shortRes.json()
    expect(shortBody.error).toBe('validacao')

    const forbiddenRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: allowedEmail, otp: '123456', password: 'senha123' }),
      }),
    )
    expect(forbiddenRes.status).toBe(400)
    const forbiddenBody = await forbiddenRes.json()
    expect(forbiddenBody.error).toBe('validacao')
  }, 20000)

  it('unallowed auth routes (including request-email-change) return 404', async () => {
    const unallowedRoutes = [
      '/api/auth/email-otp/request-password-reset',
      '/api/auth/email-otp/request-email-change',
      '/api/auth/request-email-change',

      '/api/auth/sign-in/email',
      '/api/auth/unknown-route',
    ]

    for (const route of unallowedRoutes) {
      const res = await handleAuthRequest(
        new Request(`http://localhost:3000${route}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
          body: JSON.stringify({ email: allowedEmail, type: 'sign-in' }),
        }),
      )
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBe('nao_encontrado')
    }
  }, 20000)

  it('a verified identity with no users row is not a session: getSessionUser returns null', async () => {
    const unprofiledEmail = `test-unprof-${testId}@example.com`
    createdEmails.push(unprofiledEmail)
    await db.insert(schema.allowed_emails).values({ email: unprofiledEmail, note: 'Unprofiled test' })

    await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': gateIp },
        body: JSON.stringify({ email: unprofiledEmail, type: 'sign-in' }),
      }),
    )

    const match = (await waitForEmail()).text.match(/\b\d{6}\b/)
    expect(match).not.toBeNull()

    const verifyRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': gateIp },
        body: JSON.stringify({ email: unprofiledEmail, otp: match![0] }),
      }),
    )

    expect(verifyRes.status).toBe(200)
    const cookie = cookieHeaderFrom(verifyRes)
    expect(cookie).toBeTruthy()

    const headers = new Headers()
    headers.set('cookie', cookie!)
    expect(await getSessionUserByHeaders(headers)).toBeNull()
  }, 20000)

  type MalformedVariant = {
    label: string
    headers: Record<string, string>
    body: (email: string) => BodyInit
  }

  async function answerFor(
    path: string,
    email: string,
    variant: MalformedVariant,
  ): Promise<{ status: number; text: string }> {
    const res = await handleAuthRequest(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: 'POST',
        headers: { ...variant.headers, 'x-forwarded-for': enumerationIp },
        body: variant.body(email),
      }),
    )
    return { status: res.status, text: await res.text() }
  }

  it('a malformed activation request answers the same for an invitee who never activated and for an unknown address', async () => {
    await purgeTestRateLimits()

    const variants: MalformedVariant[] = [
      {
        label: 'text/plain',
        headers: { 'content-type': 'text/plain' },
        body: (email) => JSON.stringify({ email, type: 'sign-in' }),
      },
      {
        label: 'no content-type',
        headers: {},
        body: (email) => new Blob([JSON.stringify({ email, type: 'sign-in' })]),
      },
      {
        label: 'JSON without type',
        headers: { 'content-type': 'application/json' },
        body: (email) => JSON.stringify({ email }),
      },
      {
        label: 'JSON with type change-email',
        headers: { 'content-type': 'application/json' },
        body: (email) => JSON.stringify({ email, type: 'change-email' }),
      },
    ]

    for (const variant of variants) {
      const invited = await answerFor('/email-otp/send-verification-otp', pendingEmail, variant)
      const unknown = await answerFor('/email-otp/send-verification-otp', nonAllowedEmail, variant)
      expect(invited, variant.label).toEqual(unknown)
    }

    expect(sentEmails.length).toBe(0)
  }, 20000)

  it('a malformed reset request answers the same for an active member and for an unknown address', async () => {
    await purgeTestRateLimits()

    const variants: MalformedVariant[] = [
      {
        label: 'text/plain',
        headers: { 'content-type': 'text/plain' },
        body: (email) => JSON.stringify({ email }),
      },
      {
        label: 'no content-type',
        headers: {},
        body: (email) => new Blob([JSON.stringify({ email })]),
      },
    ]

    for (const variant of variants) {
      const member = await answerFor('/forget-password/email-otp', allowedEmail, variant)
      const unknown = await answerFor('/forget-password/email-otp', nonAllowedEmail, variant)
      expect(member, variant.label).toEqual(unknown)
    }

    expect(sentEmails.length).toBe(0)
  }, 20000)

  it('a JSON body that is not an object is a 400 with no stack, on every route that parses one', async () => {
    const routes = [
      '/api/auth/email-otp/send-verification-otp',
      '/api/auth/forget-password/email-otp',
      '/api/auth/entrar',
      '/api/auth/email-otp/reset-password',
    ]

    for (const route of routes) {
      for (const rawBody of ['null', '[]', '42']) {
        const res = await handleAuthRequest(
          new Request(`http://localhost:3000${route}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-forwarded-for': enumerationIp },
            body: rawBody,
          }),
        )
        expect(res.status, `${route} ${rawBody}`).toBe(400)
        const text = await res.text()
        expect(text).not.toMatch(/TypeError|\bat\s+\S+:\d+/)
        const body = JSON.parse(text)
        expect(typeof body.error).toBe('string')
        expect(typeof body.message).toBe('string')
      }
    }

    expect(sentEmails.length).toBe(0)
  }, 20000)

  it('TASK-069 item 2 - a member whose handle is the password gets the same answer as an address that is not invited', async () => {
    const forgetRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/forget-password/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: allowedEmail }),
      }),
    )
    expect(forgetRes.status).toBe(200)
    const realCode = (await waitForEmail()).text.match(/\b\d{6}\b/)![0]
    // Any code other than the real one: the request carries no valid code.
    const wrongCode = wrongOtpFor(realCode)

    const memberRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: allowedEmail, otp: wrongCode, password: testHandle }),
      }),
    )
    const strangerRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: nonAllowedEmail, otp: wrongCode, password: testHandle }),
      }),
    )

    expect(memberRes.status).toBe(400)
    const memberBody = await memberRes.json()
    expect(memberBody).toEqual({ error: 'validacao', message: 'Código inválido ou expirado.' })
    expect(strangerRes.status).toBe(400)
    expect(await strangerRes.json()).toEqual(memberBody)
  }, 20000)

  it('TASK-069 - a sign-in code issued before the invite was removed does not sign the person in', async () => {
    const revokedEmail = `test-revogado-sign-${testId}@example.com`
    createdEmails.push(revokedEmail)
    await db.insert(schema.allowed_emails).values({ email: revokedEmail, note: 'TASK-069 invite removed after code' })

    const sendRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: revokedEmail, type: 'sign-in' }),
      }),
    )
    expect(sendRes.status).toBe(200)
    const otp = (await waitForEmail()).text.match(/\b\d{6}\b/)![0]

    await db.delete(schema.allowed_emails).where(eq(schema.allowed_emails.email, revokedEmail))

    const verifyRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: revokedEmail, otp }),
      }),
    )
    expect(verifyRes.status).toBe(400)
    expect(await verifyRes.json()).toEqual({ error: 'validacao', message: 'Código inválido ou expirado.' })
    expect(cookieHeaderFrom(verifyRes)).toBe('')
    expect(await countSessionsFor(revokedEmail)).toBe(0)
  }, 20000)

  it('TASK-069 - a reset code issued before removeInvite does not set a password', async () => {
    const removedEmail = `test-revogado-reset-${testId}@example.com`
    const removedHandle = `trv${testId % 1000000000}`
    await createActiveMember({ email: removedEmail, handle: removedHandle, name: 'Removed Member' })

    const forgetRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/forget-password/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: removedEmail }),
      }),
    )
    expect(forgetRes.status).toBe(200)
    const otp = (await waitForEmail()).text.match(/\b\d{6}\b/)![0]

    await removeInvite(allowedEmail, removedEmail)

    const resetRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: removedEmail, otp, password: 'NovaSenha2026' }),
      }),
    )
    expect(resetRes.status).toBe(400)
    expect(await resetRes.json()).toEqual({ error: 'validacao', message: 'Código inválido ou expirado.' })

    const [credential] = await db.execute(sql<{ n: number }>`
      SELECT count(a.*)::int AS n
      FROM account a
      JOIN ba_user u ON u.id = a."userId"
      WHERE u.email = ${removedEmail} AND a."providerId" = 'credential'
    `)
    expect(Number(credential?.n ?? -1)).toBe(0)
  }, 20000)

  it('TASK-069 - name and image in a sign-in body do not reach the new account', async () => {
    const fieldsEmail = `test-campos-${testId}@example.com`
    createdEmails.push(fieldsEmail)
    await db.insert(schema.allowed_emails).values({ email: fieldsEmail, note: 'TASK-069 body fields' })

    await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: fieldsEmail, type: 'sign-in' }),
      }),
    )
    const otp = (await waitForEmail()).text.match(/\b\d{6}\b/)![0]

    const verifyRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: fieldsEmail, otp, name: 'x', image: 'https://evil.test/a.png' }),
      }),
    )
    expect(verifyRes.status).toBe(200)

    const [row] = await db.execute(sql<{ name: string; image: string | null }>`
      SELECT name, image FROM ba_user WHERE email = ${fieldsEmail}
    `)
    // better-auth gives a new user an empty name when none is sent (routes.mjs), and no image.
    expect(row?.name).toBe('')
    expect(row?.image).toBeNull()
  }, 20000)

  it('TASK-069 item 4 - the sixth attempt on an exhausted code answers 429 muitas_tentativas, on sign-in and on reset', async () => {
    const lockedEmail = `test-bloqueio-${testId}@example.com`
    createdEmails.push(lockedEmail)
    await db.insert(schema.allowed_emails).values({ email: lockedEmail, note: 'TASK-069 exhausted code' })
    await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: lockedEmail, type: 'sign-in' }),
      }),
    )
    const signInOtp = (await waitForEmail()).text.match(/\b\d{6}\b/)![0]

    for (let attempt = 1; attempt <= 5; attempt++) {
      const wrong = await handleAuthRequest(
        new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
          body: JSON.stringify({ email: lockedEmail, otp: wrongOtpFor(signInOtp) }),
        }),
      )
      expect(wrong.status, `erro ${attempt}`).toBe(400)
      expect(await wrong.json()).toEqual({ error: 'validacao', message: 'Código inválido ou expirado.' })
    }

    // The code is exhausted: even the right one is refused with 429.
    const exhausted = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: lockedEmail, otp: signInOtp }),
      }),
    )
    expect(exhausted.status).toBe(429)
    expect(await exhausted.json()).toEqual(OTP_VERIFY_LIMIT_BODY)

    const resetMember = await createActiveMember({
      email: `test-bloqueio-reset-${testId}@example.com`,
      handle: `tbr${testId % 1000000000}`,
    })
    // waitForEmail reads index 0, so the earlier sign-in code must be cleared before the second send.
    sentEmails.length = 0
    await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/forget-password/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: resetMember.email }),
      }),
    )
    const resetOtp = (await waitForEmail()).text.match(/\b\d{6}\b/)![0]

    for (let attempt = 1; attempt <= 5; attempt++) {
      const wrong = await handleAuthRequest(
        new Request('http://localhost:3000/api/auth/email-otp/reset-password', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
          body: JSON.stringify({ email: resetMember.email, otp: wrongOtpFor(resetOtp), password: 'NovaSenha2026' }),
        }),
      )
      expect(wrong.status, `erro ${attempt}`).toBe(400)
    }
    const exhaustedReset = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: resetMember.email, otp: resetOtp, password: 'NovaSenha2026' }),
      }),
    )
    expect(exhaustedReset.status).toBe(429)
    expect((await exhaustedReset.json()).error).toBe('muitas_tentativas')
  }, 60000)

  it('TASK-067 + item 6 - 50 attempts by handle and the 51st by e-mail, from other IPs, answer 429', async () => {
    const account = await createActiveMember({
      email: `test-conta-${testId}@example.com`,
      handle: `tcn${testId % 1000000000}`,
    })

    for (let attempt = 1; attempt <= 50; attempt++) {
      const res = await handleAuthRequest(
        new Request('http://localhost:3000/api/auth/entrar', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': uniqueTestIp() },
          body: JSON.stringify({ identificador: account.handle, senha: 'senhaErrada2026' }),
        }),
      )
      expect(res.status, `tentativa ${attempt} pelo handle`).toBe(400)
    }

    const byEmail = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': uniqueTestIp() },
        body: JSON.stringify({ identificador: account.email, senha: 'senhaErrada2026' }),
      }),
    )
    expect(byEmail.status).toBe(429)
    expect((await byEmail.json()).error).toBe('muitas_tentativas')
  }, 90000)

  it('H1 item 2 - 20 parallel wrong codes on one reset: exactly 5 are checked, the rest get 429, and the right code after them is refused', async () => {
    const parallelEmail = `test-paralelo-${testId}@example.com`
    const parallelIp = uniqueTestIp()
    const member = await createActiveMember({
      email: parallelEmail,
      handle: `tpa${testId % 1000000000}`,
      name: 'Parallel Member',
    })

    const forgetRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/forget-password/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': parallelIp },
        body: JSON.stringify({ email: member.email }),
      }),
    )
    expect(forgetRes.status).toBe(200)
    const otp = (await waitForEmail()).text.match(/\b\d{6}\b/)![0]

    const newPassword = 'NovaSenhaParalela2026'
    const resetWith = (code: string) =>
      handleAuthRequest(
        new Request('http://localhost:3000/api/auth/email-otp/reset-password', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': parallelIp },
          body: JSON.stringify({ email: member.email, otp: code, password: newPassword }),
        }),
      )

    const guesses = await Promise.all(Array.from({ length: 20 }, () => resetWith(wrongOtpFor(otp))))
    const statuses = guesses.map((res) => res.status)
    const checked = statuses.filter((status) => status === 400).length
    expect(checked, 'tentativas que chegaram ao better-auth').toBe(5)
    expect(statuses.filter((status) => status === 429).length).toBe(20 - checked)
    for (const res of guesses.filter((res) => res.status === 429)) {
      expect(await res.json()).toEqual(OTP_VERIFY_LIMIT_BODY)
    }

    // The right code, sent after the burst but still inside the hour, is refused too.
    const rightRes = await resetWith(otp)
    expect(rightRes.status).toBe(429)
    expect(await rightRes.json()).toEqual(OTP_VERIFY_LIMIT_BODY)

    // The password did not change: the old one still works and the new one does not.
    const oldLogin = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': parallelIp },
        body: JSON.stringify({ identificador: member.email, senha: initialPassword }),
      }),
    )
    expect(oldLogin.status).toBe(200)

    const newLogin = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': parallelIp },
        body: JSON.stringify({ identificador: member.email, senha: newPassword }),
      }),
    )
    expect(newLogin.status).toBe(400)
  }, 60000)

  it('H1 item 2 - an address with no invite gets the same 429 body on its sixth attempt as an invitee', async () => {
    const strangerEmail = `test-desconhecido-${testId}@example.com`
    createdEmails.push(strangerEmail)

    const verify = () =>
      handleAuthRequest(
        new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
          body: JSON.stringify({ email: strangerEmail, otp: '000000' }),
        }),
      )

    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await verify()
      expect(res.status, `tentativa ${attempt}`).toBe(400)
      expect(await res.json()).toEqual(INVALID_OTP_BODY)
    }

    const sixth = await verify()
    expect(sixth.status).toBe(429)
    expect(await sixth.json()).toEqual(OTP_VERIFY_LIMIT_BODY)
  }, 20000)

  it('H1 item 3 - a reset that finishes after its invite was removed ends with no credential and no session', async () => {
    const raceEmail = `test-corrida-${testId}@example.com`
    const raceHandle = `tco${testId % 1000000000}`
    const member = await createActiveMember({ email: raceEmail, handle: raceHandle, name: 'Race Member' })

    // Signed in before the reset, so there is a session that could survive it.
    const loginRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ identificador: member.email, senha: initialPassword }),
      }),
    )
    expect(loginRes.status).toBe(200)
    expect(await countSessionsFor(member.email)).toBeGreaterThan(0)

    const forgetRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/forget-password/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: member.email }),
      }),
    )
    expect(forgetRes.status).toBe(200)
    const otp = (await waitForEmail()).text.match(/\b\d{6}\b/)![0]

    // The admin takes the address off the allowlist after the allowlist check, while better-auth is
    // setting the password. better-auth then succeeds, and only the post-check can notice.
    const realHandler = auth.handler
    const handlerSpy = vi.spyOn(auth, 'handler').mockImplementation(async (request: Request) => {
      if (new URL(request.url).pathname.endsWith('/email-otp/reset-password')) {
        await db.delete(schema.allowed_emails).where(eq(schema.allowed_emails.email, raceEmail))
      }
      return realHandler.call(auth, request)
    })

    let resetRes: Response
    try {
      resetRes = await handleAuthRequest(
        new Request('http://localhost:3000/api/auth/email-otp/reset-password', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
          body: JSON.stringify({ email: member.email, otp, password: 'NovaSenhaCorrida2026' }),
        }),
      )
    } finally {
      handlerSpy.mockRestore()
    }

    expect(resetRes.status).toBe(400)
    expect(await resetRes.json()).toEqual(INVALID_OTP_BODY)
    expect(await countSessionsFor(member.email)).toBe(0)

    const [credential] = await db.execute(sql<{ n: number }>`
      SELECT count(a.*)::int AS n
      FROM account a
      JOIN ba_user u ON u.id = a."userId"
      WHERE u.email = ${member.email} AND a."providerId" = 'credential'
    `)
    expect(Number(credential?.n ?? -1)).toBe(0)
  }, 30000)

  it('H1 item 5 - the 11th password change within an hour returns 429 muitas_tentativas', async () => {
    const changeEmail = `test-limite-troca-${testId}@example.com`
    const member = await createActiveMember({
      email: changeEmail,
      handle: `tlt${testId % 1000000000}`,
      name: 'Change Limit User',
    })
    const ip = uniqueTestIp()

    const loginRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ identificador: member.email, senha: initialPassword }),
      }),
    )
    expect(loginRes.status).toBe(200)
    const cookie = cookieHeaderFrom(loginRes)
    const sessionUser = await getSessionUserByHeaders(new Headers({ cookie }))
    expect(sessionUser).not.toBeNull()
    createdRateLimitKeys.push(`pwchange:user:${sessionUser!.id}`)

    const changeWith = (currentPassword: string) =>
      handleAuthRequest(
        new Request('http://localhost:3000/api/auth/change-password', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'cookie': cookie, 'x-forwarded-for': ip },
          body: JSON.stringify({ currentPassword, newPassword: 'TrocaLimite2026' }),
        }),
      )

    for (let attempt = 1; attempt <= 10; attempt++) {
      const res = await changeWith('senhaErrada2026')
      expect(res.status, `troca ${attempt}`).toBe(400)
    }

    const eleventh = await changeWith(initialPassword)
    expect(eleventh.status).toBe(429)
    expect(await eleventh.json()).toEqual({
      error: 'muitas_tentativas',
      message: 'Muitas tentativas. Aguarde uma hora e tente novamente.',
    })
  }, 30000)

  it('H1 item 5 - the sixth code request for one e-mail within an hour returns 429', async () => {
    const requestEmail = `test-limite-pedido-${testId}@example.com`
    const ip = uniqueTestIp()

    // No invite for this address: the request limit runs before the allowlist check, so it applies anyway.
    const request = () =>
      handleAuthRequest(
        new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
          body: JSON.stringify({ email: requestEmail, type: 'sign-in' }),
        }),
      )

    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await request()
      expect(res.status, `pedido ${attempt}`).toBe(200)
    }

    const sixth = await request()
    expect(sixth.status).toBe(429)
    expect((await sixth.json()).error).toBe('muitas_tentativas')
  }, 20000)

  it('H1 item 5 - the 21st code request from one IP, for different e-mails, returns 429', async () => {
    const ip = uniqueTestIp()

    const request = (index: number) =>
      handleAuthRequest(
        new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
          body: JSON.stringify({ email: `test-ip-${testId}-${index}@example.com`, type: 'sign-in' }),
        }),
      )

    for (let index = 1; index <= 20; index++) {
      const res = await request(index)
      expect(res.status, `pedido ${index}`).toBe(200)
    }

    const twentyFirst = await request(21)
    expect(twentyFirst.status).toBe(429)
    expect((await twentyFirst.json()).error).toBe('muitas_tentativas')
  }, 30000)

  it('TASK-070 - the auth route keeps the Response (status and set-cookie) and turns a throw into 500 { error, message, requestId }', async () => {
    const routeIp = uniqueTestIp()
    createdRateLimitKeys.push(
      `signin:ip:${routeIp}`,
      `signin:id:${allowedEmail}`,
      `signin:idip:${allowedEmail}:${routeIp}`,
    )
    const { default: authRoute } = await import('../../server/api/auth/[...all]')
    const app = createApp()
    app.use(authRoute)
    const handler = toWebHandler(app)

    const okRes = await handler(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': routeIp },
        body: JSON.stringify({ identificador: allowedEmail, senha: initialPassword }),
      }),
    )
    expect(okRes.status).toBe(200)
    const cookies = okRes.headers.getSetCookie()
    expect(cookies.length).toBeGreaterThan(0)
    expect(cookies.every((cookie) => cookie.includes('better-auth'))).toBe(true)

    const leaked = 'password authentication failed for user "meuslivros_app" at 10.0.0.7'
    // A fresh module registry, so the route is evaluated again against the mocked service.
    vi.resetModules()
    vi.doMock('../../server/services/auth', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../../server/services/auth')>()),
      handleAuthRequest: async () => {
        throw new Error(leaked)
      },
    }))
    try {
      const { default: throwingRoute } = await import('../../server/api/auth/[...all]')
      const throwingApp = createApp()
      throwingApp.use(throwingRoute)
      const errorRes = await toWebHandler(throwingApp)(
        new Request('http://localhost:3000/api/auth/entrar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ identificador: 'x', senha: 'y' }),
        }),
      )
      expect(errorRes.status).toBe(500)
      const text = await errorRes.text()
      const body = JSON.parse(text) as Record<string, unknown>
      expect(Object.keys(body).sort()).toEqual(['error', 'message', 'requestId'])
      expect(text).not.toContain('meuslivros_app')
      expect(text).not.toContain('authentication failed')
      expect(text).not.toMatch(/\n\s+at\s/)
    } finally {
      vi.doUnmock('../../server/services/auth')
    }
  }, 30000)

  it('the 11th set-password within an hour for one session returns 429 muitas_tentativas', async () => {
    const rlEmail = `test-rl-setpw-${testId}@example.com`
    createdEmails.push(rlEmail)
    createdRateLimitKeys.push(`setpw:email:${rlEmail}`)
    await db.insert(schema.allowed_emails).values({ email: rlEmail, note: 'TASK-064 RL' })

    await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: rlEmail, type: 'sign-in' }),
      }),
    )

    const match = (await waitForEmail()).text.match(/\b\d{6}\b/)
    expect(match).not.toBeNull()

    const verifyRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: rlEmail, otp: match![0] }),
      }),
    )
    expect(verifyRes.status).toBe(200)
    const cookie = cookieHeaderFrom(verifyRes)
    expect(cookie).toBeTruthy()

    for (let i = 0; i < 10; i++) {
      const res = await handleAuthRequest(
        new Request('http://localhost:3000/api/auth/set-password', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'cookie': cookie!,
            'x-forwarded-for': testIp,
          },
          body: JSON.stringify({ newPassword: 'FirstValidPassword123' }),
        }),
      )
      expect(res.status).toBeLessThan(429)
    }

    const eleventhRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/set-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cookie': cookie!,
          'x-forwarded-for': testIp,
        },
        body: JSON.stringify({ newPassword: 'FirstValidPassword123' }),
      }),
    )
    expect(eleventhRes.status).toBe(429)
    const body = await eleventhRes.json()
    expect(body.error).toBe('muitas_tentativas')
    expect(body.message).toBe('Muitas tentativas. Aguarde uma hora e tente novamente.')
  }, 30000)

  it('set-password for a session whose address already has a password returns 400 validacao without reaching better-auth setPassword', async () => {
    const existingPwEmail = `test-existing-pw-${testId}@example.com`
    createdEmails.push(existingPwEmail)
    createdRateLimitKeys.push(`setpw:email:${existingPwEmail}`)
    await db.insert(schema.allowed_emails).values({ email: existingPwEmail, note: 'TASK-064 existing PW' })

    await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: existingPwEmail, type: 'sign-in' }),
      }),
    )

    const match = (await waitForEmail()).text.match(/\b\d{6}\b/)
    expect(match).not.toBeNull()

    const verifyRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: existingPwEmail, otp: match![0] }),
      }),
    )
    expect(verifyRes.status).toBe(200)
    const cookie = cookieHeaderFrom(verifyRes)
    expect(cookie).toBeTruthy()

    const firstSetRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/set-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cookie': cookie!,
          'x-forwarded-for': testIp,
        },
        body: JSON.stringify({ newPassword: 'OriginalPassword123' }),
      }),
    )
    expect(firstSetRes.status).toBe(200)

    const [accountBefore] = await db.execute(sql<{ password: string; updatedAt: Date }>`
      SELECT a.password, a."updatedAt"
      FROM account a
      JOIN ba_user u ON u.id = a."userId"
      WHERE u.email = ${existingPwEmail}
    `)
    expect(accountBefore?.password).toBeTruthy()

    const setPasswordSpy = vi.spyOn(auth.api, 'setPassword')

    const secondSetRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/set-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cookie': cookie!,
          'x-forwarded-for': testIp,
        },
        body: JSON.stringify({ newPassword: 'AttemptNewPassword999' }),
      }),
    )

    expect(secondSetRes.status).toBe(400)
    const secondSetBody = await secondSetRes.json()
    expect(secondSetBody.error).toBe('validacao')
    expect(secondSetBody.message).toBe('Não foi possível definir a senha.')

    expect(setPasswordSpy).not.toHaveBeenCalled()
    setPasswordSpy.mockRestore()

    const [accountAfter] = await db.execute(sql<{ password: string; updatedAt: Date }>`
      SELECT a.password, a."updatedAt"
      FROM account a
      JOIN ba_user u ON u.id = a."userId"
      WHERE u.email = ${existingPwEmail}
    `)
    expect(accountAfter?.password).toBe(accountBefore?.password)
  }, 30000)
})
