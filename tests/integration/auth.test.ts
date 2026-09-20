import type { Transporter } from 'nodemailer'
import { inArray, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getSessionUserByHeaders, handleAuthRequest } from '../../server/services/auth'
import { setTransport } from '../../server/utils/email'

/**
 * Every test here makes several sequential round-trips to a remote Postgres, so
 * the 5s default is not a meaningful budget - it measures Neon's latency on the
 * night the suite happens to run, not the code. The explicit 20s timeouts are
 * there so a slow link fails the run for a real reason or not at all.
 */
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDatabaseUrl)('TASK-007 — Authentication integration (better-auth + email OTP + allowlist)', () => {
  let db: typeof import('../../server/db')['db']
  let schema: typeof import('../../server/db/schema')
  const testId = Date.now()
  const allowedEmail = `test-auth-${testId}@example.com`
  const nonAllowedEmail = `test-blocked-${testId}@example.com`
  const testIp = `192.0.2.${(testId % 200) + 1}`

  const sentEmails: Array<{ to: string; subject: string; text: string }> = []
  const createdEmails = [allowedEmail, nonAllowedEmail]
  // Both IPs are derived from testId, so two runs inside the same hour can reuse
  // one. Left behind, the 20/hour IP counter trips and fails a later run for a
  // reason that has nothing to do with the code. Register them for cleanup.
  const customIp = `198.51.100.${(testId % 200) + 1}`
  const gateIp = `203.0.113.${(testId % 200) + 1}`
  const createdRateLimitKeys: string[] = [`otp:ip:${testIp}`, `otp:ip:${customIp}`, `otp:ip:${gateIp}`]
  beforeAll(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    schema = await import('../../server/db/schema')

    process.env.EMAIL_FROM = 'test-remetente@gmail.com'
    process.env.GMAIL_APP_PASSWORD = 'test-app-password'

    // Mock nodemailer transport so zero real emails are ever sent
    const mockTransport = {
      sendMail: async (mailOptions: { to: string; subject: string; text: string }) => {
        sentEmails.push(mailOptions)
        return { messageId: 'mock-msg-id' }
      },
    } as unknown as Transporter

    setTransport(mockTransport)

    // Insert test address into allowed_emails table
    await db.insert(schema.allowed_emails).values({
      email: allowedEmail,
      note: 'TASK-007 integration test',
    })

    // Insert user into users table so getSessionUserByHeaders resolves a valid user UUID
    await db.insert(schema.users).values({
      email: allowedEmail,
      handle: `ta${testId % 1000000000}`,
      display_name: 'Test Auth User',
    })
  })

  /**
   * The server answers the OTP request without waiting for SMTP — that is what
   * keeps the allowlisted and non-allowlisted paths indistinguishable in time.
   * The consequence here is that the mock transport receives the mail a tick
   * after the response, so a test must wait for it rather than assume it has
   * already arrived.
   */
  async function waitForEmail(index = 0, timeoutMs = 5000): Promise<{ to: string, subject: string, text: string }> {
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

  afterAll(async () => {
    // Clean up all rows created during testing
    setTransport(null)

    // 1. Delete verification entries
    for (const email of createdEmails) {
      await db.execute(sql`DELETE FROM verification WHERE identifier LIKE ${`%${email}%`}`)
    }

    // 2. Delete better-auth sessions and accounts for test users
    const baUsers = await db.execute(sql<{ id: string }>`
      SELECT id FROM ba_user WHERE email IN (${sql.join(createdEmails.map((e) => sql`${e}`), sql`, `)})
    `)
    const userIds = baUsers.map((u) => u.id)
    if (userIds.length > 0) {
      await db.execute(sql`DELETE FROM session WHERE "userId" IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`)
      await db.execute(sql`DELETE FROM account WHERE "userId" IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`)
      await db.execute(sql`DELETE FROM ba_user WHERE id IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`)
    }

    // 3. Delete allowlist and user entries
    await db.delete(schema.allowed_emails).where(inArray(schema.allowed_emails.email, createdEmails))
    await db.delete(schema.users).where(inArray(schema.users.email, createdEmails))

    // 4. Delete rate limit entries
    for (const email of createdEmails) {
      await db.execute(sql`DELETE FROM rate_limit WHERE key LIKE ${`%${email}%`}`)
    }
    if (createdRateLimitKeys.length > 0) {
      for (const k of createdRateLimitKeys) {
        await db.execute(sql`DELETE FROM rate_limit WHERE key = ${k}`)
      }
    }
  })

  it('an allowlisted address receives a 6-digit code and completes sign-in', async () => {
    // 1. Request OTP
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

    // Verify email was sent via mock transport
    expect(sentEmails.length).toBe(1)
    const emailData = await waitForEmail()
    expect(emailData.to).toBe(allowedEmail)

    // Extract the 6-digit code
    const match = emailData.text.match(/\b\d{6}\b/)
    expect(match).not.toBeNull()
    const otp = match![0]

    // 2. Verify OTP / Sign-in
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

    // 3. Check session cookie attributes: httpOnly, Secure, SameSite=Lax
    const setCookie = verifyRes.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()
    expect(setCookie?.toLowerCase()).toContain('httponly')
    expect(setCookie?.toLowerCase()).toContain('samesite=lax')
    expect(setCookie?.toLowerCase()).toContain('secure')

    // 4. Validate that getSessionUserByHeaders resolves the session user
    const headers = new Headers()
    headers.set('cookie', setCookie!)
    const sessionUser = await getSessionUserByHeaders(headers)
    expect(sessionUser).not.toBeNull()
    expect(sessionUser?.email).toBe(allowedEmail)
    expect(sessionUser?.id).toBeTypeOf('string')
  }, 20000)

  it('a non-allowlisted address gets an identical response and zero emails are sent', async () => {
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

    // Zero emails sent!
    expect(sentEmails.length).toBe(0)
  }, 20000)

  it('timing between allowlisted and non-allowlisted paths does not differ by an order of magnitude', async () => {
    const timingAllowedEmail = `test-time-a-${testId}@example.com`
    const timingBlockedEmail = `test-time-b-${testId}@example.com`
    createdEmails.push(timingAllowedEmail, timingBlockedEmail)

    await db.insert(schema.allowed_emails).values({
      email: timingAllowedEmail,
      note: 'Timing test',
    })

    const t0 = performance.now()
    await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: timingAllowedEmail, type: 'sign-in' }),
      }),
    )
    const allowedDuration = performance.now() - t0

    const t1 = performance.now()
    await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: timingBlockedEmail, type: 'sign-in' }),
      }),
    )
    const blockedDuration = performance.now() - t1

    // Ratio should not exceed 10x
    const ratio = Math.max(allowedDuration, blockedDuration) / Math.min(allowedDuration, blockedDuration)
    expect(ratio).toBeLessThan(10)
  }, 20000)

  it('an incorrect code returns 400 with { error: "validacao" }', async () => {
    // Generate a fresh OTP
    await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: allowedEmail, type: 'sign-in' }),
      }),
    )

    const verifyReq = new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify({ email: allowedEmail, otp: '000000' }),
    })

    const res = await handleAuthRequest(verifyReq)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('validacao')
  }, 20000)

  it('a code fails after 5 incorrect attempts', async () => {
    const freshEmail = `test-attempts-${testId}@example.com`
    createdEmails.push(freshEmail)
    await db.insert(schema.allowed_emails).values({ email: freshEmail, note: 'Attempts test' })

    // 1. Request code
    await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: freshEmail, type: 'sign-in' }),
      }),
    )

    const match = (await waitForEmail()).text.match(/\b\d{6}\b/)
    expect(match).not.toBeNull()
    const validCode = match![0]

    // 2. Submit 5 incorrect codes
    for (let i = 0; i < 5; i++) {
      const badReq = new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: freshEmail, otp: '111111' }),
      })
      const badRes = await handleAuthRequest(badReq)
      expect(badRes.status).toBe(400)
      const b = await badRes.json()
      expect(b.error).toBe('validacao')
    }

    // 3. On 6th attempt, even the CORRECT code must fail
    const sixthReq = new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify({ email: freshEmail, otp: validCode }),
    })
    const sixthRes = await handleAuthRequest(sixthReq)
    expect(sixthRes.status).toBe(400)
    const sixthBody = await sixthRes.json()
    expect(sixthBody.error).toBe('validacao')
  }, 20000)

  it('a verified code cannot be used a second time', async () => {
    const reuseEmail = `test-reuse-${testId}@example.com`
    createdEmails.push(reuseEmail)
    await db.insert(schema.allowed_emails).values({ email: reuseEmail, note: 'Reuse test' })

    await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: reuseEmail, type: 'sign-in' }),
      }),
    )

    const match = (await waitForEmail()).text.match(/\b\d{6}\b/)
    expect(match).not.toBeNull()
    const validCode = match![0]

    // First use: success
    const firstRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: reuseEmail, otp: validCode }),
      }),
    )
    expect(firstRes.status).toBe(200)

    // Second use: fails with 400 { error: 'validacao' }
    const secondRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: reuseEmail, otp: validCode }),
      }),
    )
    expect(secondRes.status).toBe(400)
    const b = await secondRes.json()
    expect(b.error).toBe('validacao')
  }, 20000)

  it('a code older than 10 minutes fails', async () => {
    const expireEmail = `test-expire-${testId}@example.com`
    createdEmails.push(expireEmail)
    await db.insert(schema.allowed_emails).values({ email: expireEmail, note: 'Expire test' })

    await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: expireEmail, type: 'sign-in' }),
      }),
    )

    const match = (await waitForEmail()).text.match(/\b\d{6}\b/)
    expect(match).not.toBeNull()
    const validCode = match![0]

    // Manually expire the code in the DB (set expiresAt to 15 minutes ago)
    await db.execute(sql`
      UPDATE verification
      SET "expiresAt" = now() - interval '15 minutes'
      WHERE identifier LIKE ${`%${expireEmail}%`}
    `)

    const res = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: expireEmail, otp: validCode }),
      }),
    )
    expect(res.status).toBe(400)
    const b = await res.json()
    expect(b.error).toBe('validacao')
  }, 20000)

  it('the 6th request in one hour for one email returns 429', async () => {
    const rateLimitEmail = `test-ratelimit-${testId}@example.com`
    createdEmails.push(rateLimitEmail)
    await db.insert(schema.allowed_emails).values({ email: rateLimitEmail, note: 'Rate limit test' })

    // customIp is dedicated to this test so the email limit (5) trips before the
    // IP limit (20).

    // 5 allowed requests
    for (let i = 0; i < 5; i++) {
      const res = await handleAuthRequest(
        new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': customIp },
          body: JSON.stringify({ email: rateLimitEmail, type: 'sign-in' }),
        }),
      )
      expect(res.status).toBe(200)
    }

    // 6th request must trip the limit -> 429 { error: 'muitas_tentativas' }
    const sixthRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': customIp },
        body: JSON.stringify({ email: rateLimitEmail, type: 'sign-in' }),
      }),
    )
    expect(sixthRes.status).toBe(429)
    const b = await sixthRes.json()
    expect(b.error).toBe('muitas_tentativas')
  }, 20000)

  it('deleting the session row logs the user out on the next request', async () => {
    const revokeEmail = `test-revoke-${testId}@example.com`
    createdEmails.push(revokeEmail)
    await db.insert(schema.allowed_emails).values({ email: revokeEmail, note: 'Revoke test' })
    await db.insert(schema.users).values({
      email: revokeEmail,
      handle: `tr${testId % 1000000000}`,
      display_name: 'Test Revoke User',
    })

    await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: revokeEmail, type: 'sign-in' }),
      }),
    )

    const match = (await waitForEmail()).text.match(/\b\d{6}\b/)
    expect(match).not.toBeNull()
    const code = match![0]

    const verifyRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ email: revokeEmail, otp: code }),
      }),
    )
    const cookie = verifyRes.headers.get('set-cookie')!
    const headers = new Headers()
    headers.set('cookie', cookie)

    // User is currently authenticated
    const userBefore = await getSessionUserByHeaders(headers)
    expect(userBefore).not.toBeNull()

    // Delete session row in database
    await db.execute(sql`
      DELETE FROM session
      WHERE "userId" = (SELECT id FROM ba_user WHERE email = ${revokeEmail})
    `)

    // User is immediately logged out (sessions are database-backed and revocable)
    const userAfter = await getSessionUserByHeaders(headers)
    expect(userAfter).toBeNull()
  }, 20000)

  it('unallowed auth routes return 404 and do not send emails', async () => {
    const unallowedRoutes = [
      '/api/auth/email-otp/request-password-reset',
      '/api/auth/forget-password/email-otp',
      '/api/auth/email-otp/request-email-change',
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

    expect(sentEmails.length).toBe(0)
  }, 20000)

  it('a verified identity with no users row is not a session: getSessionUser returns null', async () => {
    // The registration gate, from security.md: "no `users` row means every
    // service query returns nothing". The better-auth identity exists the moment
    // the code verifies; the profile does not, and TASK-008 is what creates it.
    // Between those two moments the person must read as anonymous.
    const gateEmail = `test-gate-${testId}@example.com`
    createdEmails.push(gateEmail)
    await db.insert(schema.allowed_emails).values({ email: gateEmail, note: 'Gate test' })

    await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': gateIp },
        body: JSON.stringify({ email: gateEmail, type: 'sign-in' }),
      }),
    )

    const match = (await waitForEmail()).text.match(/\b\d{6}\b/)
    expect(match).not.toBeNull()

    const verifyRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': gateIp },
        body: JSON.stringify({ email: gateEmail, otp: match![0] }),
      }),
    )

    // better-auth signed the person in: the identity is real and the cookie is set.
    expect(verifyRes.status).toBe(200)
    const cookie = verifyRes.headers.get('set-cookie')
    expect(cookie).toBeTruthy()

    // No `users` row was ever created, so the application sees nobody.
    const headers = new Headers()
    headers.set('cookie', cookie!)
    expect(await getSessionUserByHeaders(headers)).toBeNull()
  }, 20000)
})
