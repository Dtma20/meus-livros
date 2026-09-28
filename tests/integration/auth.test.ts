import type { Transporter } from 'nodemailer'
import { eq, inArray, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getSessionUserByHeaders, handleAuthRequest } from '../../server/services/auth'
import { setTransport } from '../../server/utils/email'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)

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
  const testIp = `192.0.2.${(testId % 200) + 1}`
  const activationIp = `192.0.2.${((testId + 3) % 200) + 1}`
  const enumerationIp = `198.18.0.${(testId % 200) + 1}`

  const sentEmails: Array<{ to: string; subject: string; text: string }> = []
  const createdEmails: string[] = [allowedEmail, nonAllowedEmail, activationEmail, pendingEmail]
  const customIp = `198.51.100.${(testId % 200) + 1}`
  const gateIp = `203.0.113.${(testId % 200) + 1}`
  const signInIdIp = `192.0.2.${((testId + 1) % 200) + 1}`
  const signInIpLimitIp = `192.0.2.${((testId + 2) % 200) + 1}`
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
  const initialPassword = 'InitialPassword123'

  beforeAll(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    schema = await import('../../server/db/schema')

    process.env.EMAIL_FROM = 'test-remetente@gmail.com'
    process.env.GMAIL_APP_PASSWORD = 'test-app-password'

    const mockTransport = {
      sendMail: async (mailOptions: { to: string; subject: string; text: string }) => {
        sentEmails.push(mailOptions)
        return { messageId: 'mock-msg-id' }
      },
    } as unknown as Transporter

    setTransport(mockTransport)

    await db.insert(schema.allowed_emails).values([
      { email: allowedEmail, note: 'TASK-027 integration test' },

      { email: activationEmail, note: 'TASK-027 first-access test' },

      { email: pendingEmail, note: 'A-1 invited, never activated' },
    ])

    await db.insert(schema.users).values({
      email: allowedEmail,
      handle: testHandle,
      display_name: 'Test Auth User',
    })

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

    const exact = [...createdRateLimitKeys, `signin:id:${testHandle}`]
    const patterns = [
      ...createdEmails.map((e) => `%${e}%`),
      `signin:id:spray_${testId % 100000}_%`,
    ]
    await db.execute(sql`
      DELETE FROM rate_limit
      WHERE key IN (${sql.join(exact.map((k) => sql`${k}`), sql`, `)})
         OR ${sql.join(patterns.map((pat) => sql`key LIKE ${pat}`), sql` OR `)}
    `)
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
      body: JSON.stringify({ email: allowedEmail, type: 'sign-in' }),
    })

    const res = await handleAuthRequest(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    const emailData = await waitForEmail()
    expect(emailData.to).toBe(allowedEmail)

    const match = emailData.text.match(/\b\d{6}\b/)
    expect(match).not.toBeNull()
    const otp = match![0]

    const verifyReq = new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': testIp,
      },
      body: JSON.stringify({ email: allowedEmail, otp }),
    })

    const verifyRes = await handleAuthRequest(verifyReq)
    expect(verifyRes.status).toBe(200)
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

    await db.execute(sql`
      INSERT INTO rate_limit (key, count, window_start)
      VALUES (${`signin:ip:${signInIpLimitIp}`}, 29, date_trunc('hour', now()))
      ON CONFLICT (key, window_start) DO UPDATE SET count = 29
    `)

    const unknownHandleId = `spray_${testId % 100000}_30`
    createdRateLimitKeys.push(`signin:id:${unknownHandleId}`)
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
      WHERE key = ${`signin:ip:${signInIpLimitIp}`}
        AND window_start = date_trunc('hour', now())
    `)
    expect(Number(counter?.count)).toBe(30)

    const thirtyFirstRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': signInIpLimitIp },
        body: JSON.stringify({ identificador: `spray_${testId % 100000}_31`, senha: 'wrongPassword' }),
      }),
    )
    expect(thirtyFirstRes.status).toBe(429)
    const body = await thirtyFirstRes.json()
    expect(body.error).toBe('muitas_tentativas')
  }, 20000)

  it('password reset flow: sends code, resets password, invalidates old sessions, single-use code', async () => {

    const loginRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ identificador: testHandle, senha: initialPassword }),
      }),
    )
    const oldSessionCookie = cookieHeaderFrom(loginRes)
    const oldHeaders = new Headers({ cookie: oldSessionCookie })
    expect(await getSessionUserByHeaders(oldHeaders)).not.toBeNull()

    const resetReq = new Request('http://localhost:3000/api/auth/forget-password/email-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify({ email: allowedEmail }),
    })
    const resetRes = await handleAuthRequest(resetReq)
    expect(resetRes.status).toBe(200)

    const emailData = await waitForEmail()
    expect(emailData.to).toBe(allowedEmail)
    const match = emailData.text.match(/\b\d{6}\b/)
    expect(match).not.toBeNull()
    const resetCode = match![0]

    const newPassword = 'ResetPassword456'
    const completeResetReq = new Request('http://localhost:3000/api/auth/email-otp/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify({ email: allowedEmail, otp: resetCode, password: newPassword }),
    })
    const completeResetRes = await handleAuthRequest(completeResetReq)
    expect(completeResetRes.status).toBe(200)

    expect(await countSessionsFor(allowedEmail)).toBe(0)

    const oldPwLogin = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ identificador: testHandle, senha: initialPassword }),
      }),
    )
    expect(oldPwLogin.status).toBe(400)

    const newPwLogin = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ identificador: testHandle, senha: newPassword }),
      }),
    )
    expect(newPwLogin.status).toBe(200)

    const replayRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: allowedEmail, otp: resetCode, password: 'AnotherPassword999' }),
      }),
    )
    expect(replayRes.status).toBe(400)
    const replayBody = await replayRes.json()
    expect(replayBody.error).toBe('validacao')
  }, 20000)

  it('change-password without currentPassword is rejected, and with valid currentPassword revokes other sessions', async () => {

    const currentPassword = 'ResetPassword456'
    const newPassword = 'ChangedPassword789'

    const loginResA = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ identificador: testHandle, senha: currentPassword }),
      }),
    )

    expect(loginResA.status).toBe(200)
    const cookieA = cookieHeaderFrom(loginResA)
    const headersA = new Headers({ cookie: cookieA })

    const loginResB = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ identificador: testHandle, senha: currentPassword }),
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

    const updatedCookieA = cookieHeaderFrom(changePwRes) || cookieA
    const survivingHeaders = new Headers({ cookie: updatedCookieA })
    const userAfter = await getSessionUserByHeaders(survivingHeaders)
    expect(userAfter).not.toBeNull()

    expect(await countSessionsFor(allowedEmail)).toBe(1)
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
})
