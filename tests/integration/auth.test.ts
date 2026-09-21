import type { Transporter } from 'nodemailer'
import { eq, inArray, sql } from 'drizzle-orm'
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

describe.skipIf(!hasDatabaseUrl)('TASK-027 — Password authentication + activation/reset OTP flows', () => {
  let db: typeof import('../../server/db')['db']
  let schema: typeof import('../../server/db/schema')
  const testId = Date.now()
  const allowedEmail = `test-auth-${testId}@example.com`
  const nonAllowedEmail = `test-blocked-${testId}@example.com`
  // An invitee with NO `users` profile row, which is what genuine first access
  // looks like: the profile is created at /app/bem-vindo, after the password is
  // set. `allowedEmail` below gets a profile in beforeAll because the sign-in
  // and change-password tests need one, and that is exactly what hid the 401.
  const activationEmail = `test-ativar-${testId}@example.com`
  const testIp = `192.0.2.${(testId % 200) + 1}`
  const activationIp = `192.0.2.${((testId + 3) % 200) + 1}`

  const sentEmails: Array<{ to: string; subject: string; text: string }> = []
  const createdEmails: string[] = [allowedEmail, nonAllowedEmail, activationEmail]
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
  ]

  const testHandle = `ta${testId % 1000000000}`
  const initialPassword = 'InitialPassword123'

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

    // Insert test addresses into allowed_emails table
    await db.insert(schema.allowed_emails).values([
      { email: allowedEmail, note: 'TASK-027 integration test' },
      // Allowlisted and deliberately given no `users` row: this is the invitee
      // the first-access test uses.
      { email: activationEmail, note: 'TASK-027 first-access test' },
    ])

    // `allowedEmail` gets a profile because the sign-in, change-password and
    // reset tests below all need one. Note what this does NOT buy: it is not a
    // precondition of activation, and treating it as one is what let a 401 on
    // /set-password ship. `activationEmail` has no row here on purpose.
    await db.insert(schema.users).values({
      email: allowedEmail,
      handle: testHandle,
      display_name: 'Test Auth User',
    })

    // Start from a clean counter. A run that crashed inside this hour would
    // otherwise hand its leftovers to this one.
    await purgeTestRateLimits()
  }, 30000)

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

  /**
   * Rate-limit rows are the one piece of state that outlives a failed run: they
   * are keyed by (key, hour window), so a counter left behind by a crashed run
   * makes the *next* run inside the same hour fail for a reason that has nothing
   * to do with the code. Two defences: purge before as well as after, and match
   * the spray keys by prefix rather than trusting that every one was pushed.
   */
  async function purgeTestRateLimits() {
    // One statement, not a loop. Each round-trip to Neon costs enough that a
    // dozen of them pushes afterAll past the 10s default hook timeout, and a
    // hook that times out leaves exactly the rows this function exists to drop.
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

    // Purge counters first. Everything below can throw on a half-created
    // fixture, and if it does, the rate-limit rows must already be gone.
    await purgeTestRateLimits()

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

    // 4. Delete rate limit entries created after the first purge above.
    await purgeTestRateLimits()
  }, 30000)

  it('first access works for an invitee who has no profile row yet', async () => {
    // The regression this exists for: /set-password used to gate on
    // getSessionUserByHeaders, which resolves the *app profile* and returns null
    // without a `users` row. A real invitee has no such row -- it is created at
    // /app/bem-vindo, after the password is set -- so every genuine activation
    // answered 401. The test that should have caught it inserted the profile in
    // beforeAll and called that first access.
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
    const cookie = verifyRes.headers.get('set-cookie')
    expect(cookie).toBeTruthy()

    // Still no profile: verifying the code does not create one, which is the
    // whole point. If this ever starts returning a row, the assertion above
    // stops meaning anything and this test silently becomes the old one.
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

    // And the password works: sign-in by email, since no handle exists yet.
    const signInRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': activationIp },
        body: JSON.stringify({ identificador: activationEmail, senha: 'PrimeiroAcesso2026' }),
      }),
    )
    expect(signInRes.status).toBe(200)
    expect(signInRes.headers.get('set-cookie')).toBeTruthy()
  }, 30000)

  it('first access activation: allowlisted address receives code, sets password, and signs in', async () => {
    // 1. Request activation code
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
    const emailData = await waitForEmail()
    expect(emailData.to).toBe(allowedEmail)

    const match = emailData.text.match(/\b\d{6}\b/)
    expect(match).not.toBeNull()
    const otp = match![0]

    // 2. Verify OTP
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
    const cookie = verifyRes.headers.get('set-cookie')
    expect(cookie).toBeTruthy()

    // 3. Set password
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

    // Zero emails sent!
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
    const cookie = res.headers.get('set-cookie')
    expect(cookie).toBeTruthy()
    expect(cookie?.toLowerCase()).toContain('httponly')
    expect(cookie?.toLowerCase()).toContain('samesite=lax')

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
    const cookie = res.headers.get('set-cookie')
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

    // 10 attempts
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

    // 11th attempt returns 429
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
    // Driving all 30 attempts through the route costs ~620ms each against Neon
    // — 19s, against a 20s timeout, so it failed roughly half the time for a
    // reason that had nothing to do with the limit. Seed the counter to 29 and
    // spend the two remaining round-trips on what is actually being asserted:
    // that an unknown handle still increments the *IP* counter (the whole point
    // of counting before resolving the identifier), and that 31 trips it.
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
    // Unknown handle: still a plain rejection, and still counted.
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
    // 1. Establish an active session before reset to verify revocation
    const loginRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ identificador: testHandle, senha: initialPassword }),
      }),
    )
    const oldSessionCookie = loginRes.headers.get('set-cookie')!
    const oldHeaders = new Headers({ cookie: oldSessionCookie })
    expect(await getSessionUserByHeaders(oldHeaders)).not.toBeNull()

    // 2. Request reset code
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

    // 3. Reset password
    const newPassword = 'ResetPassword456'
    const completeResetReq = new Request('http://localhost:3000/api/auth/email-otp/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify({ email: allowedEmail, otp: resetCode, password: newPassword }),
    })
    const completeResetRes = await handleAuthRequest(completeResetReq)
    expect(completeResetRes.status).toBe(200)

    // 4. Old session is deleted (revoked)
    const oldSessionAfter = await getSessionUserByHeaders(oldHeaders)
    expect(oldSessionAfter).toBeNull()

    // 5. Old password no longer works
    const oldPwLogin = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ identificador: testHandle, senha: initialPassword }),
      }),
    )
    expect(oldPwLogin.status).toBe(400)

    // 6. New password works
    const newPwLogin = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ identificador: testHandle, senha: newPassword }),
      }),
    )
    expect(newPwLogin.status).toBe(200)

    // 7. Reset code cannot be replayed
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
    // Current password is now ResetPassword456
    const currentPassword = 'ResetPassword456'
    const newPassword = 'ChangedPassword789'

    // Sign in to get session A
    const loginResA = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ identificador: testHandle, senha: currentPassword }),
      }),
    )
    const cookieA = loginResA.headers.get('set-cookie')!
    const headersA = new Headers({ cookie: cookieA })

    // Sign in to get session B (other session)
    const loginResB = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ identificador: testHandle, senha: currentPassword }),
      }),
    )
    const cookieB = loginResB.headers.get('set-cookie')!
    const headersB = new Headers({ cookie: cookieB })

    // 1. Missing current password returns 400
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

    // 2. Change password with session A
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

    // The session performing the change (session A) receives updated cookie and survives
    const updatedCookieA = changePwRes.headers.get('set-cookie') || cookieA
    const survivingHeaders = new Headers({ cookie: updatedCookieA })
    const userAfter = await getSessionUserByHeaders(survivingHeaders)
    expect(userAfter).not.toBeNull()

    // Session B is revoked
    const sessionBAfter = await getSessionUserByHeaders(headersB)
    expect(sessionBAfter).toBeNull()
  }, 20000)

  it('passwords under 8 characters and senha123 are rejected server-side', async () => {
    // set-password authenticates before it validates, and that order is
    // deliberate: an anonymous caller must not learn whether the password rules
    // were even reached. 401, not 400.
    const anonRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/set-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: JSON.stringify({ newPassword: 'short' }),
      }),
    )
    expect(anonRes.status).toBe(401)

    // 1. Short password (< 8 chars). Asserted on reset-password because the
    // floor runs there before the OTP is looked at, so no session is needed.
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

    // 2. Forbidden password ('senha123') on reset-password
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
      // better-auth's own password sign-in. /entrar calls it internally; it is
      // not reachable from outside, because its name promises an email and the
      // field accepts a handle. Asserted so it is not quietly reopened.
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
    const cookie = verifyRes.headers.get('set-cookie')
    expect(cookie).toBeTruthy()

    const headers = new Headers()
    headers.set('cookie', cookie!)
    expect(await getSessionUserByHeaders(headers)).toBeNull()
  }, 20000)
})
