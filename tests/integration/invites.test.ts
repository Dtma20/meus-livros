import { createServer, type Server } from 'node:http'
import { eq, sql } from 'drizzle-orm'
import { createApp, createRouter, defineEventHandler, getHeader, toNodeListener } from 'h3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { removeFixtures, trackSetup } from './fixtures'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
const MARKER = `zz-test-invites-${Date.now()}`

describe.skipIf(!hasDatabaseUrl)('TASK-038 - Admin invites integration tests', () => {
  let db: typeof import('../../server/db')['db']
  let client: typeof import('../../server/db')['client']
  let schema: typeof import('../../server/db/schema')
  let invitesService: typeof import('../../server/services/invites')
  let handleAuthRequest: typeof import('../../server/services/auth')['handleAuthRequest']

  let server: Server | null = null
  let apiUrl: string
  let meApiUrl: string

  let adminUserId: string
  const adminEmail = `${MARKER}-admin@example.com`
  const adminHandle = `adm${Date.now()}`.slice(0, 20)

  let regularUserId: string
  const regularEmail = `${MARKER}-user@example.com`
  const regularHandle = `reg${Date.now()}`.slice(0, 20)

  const setup = trackSetup()

  beforeAll(() => setup.run(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    client = dbModule.client
    schema = await import('../../server/db/schema')
    invitesService = await import('../../server/services/invites')
    const authModule = await import('../../server/services/auth')
    handleAuthRequest = authModule.handleAuthRequest

    const app = createApp()
    app.use(defineEventHandler((event) => {
      const id = getHeader(event, 'x-test-user-id')
      const email = getHeader(event, 'x-test-user-email')
      if (id) {
        event.context.user = { id, email }
      }
    }))

    const router = createRouter()
    const { default: getInvitesHandler } = await import('../../server/api/admin/convites/index.get')
    const { default: postInviteHandler } = await import('../../server/api/admin/convites/index.post')
    const { default: deleteInviteHandler } = await import('../../server/api/admin/convites/index.delete')
    const { default: meHandler } = await import('../../server/api/users/me.get')

    router.get('/api/admin/convites', getInvitesHandler)
    router.post('/api/admin/convites', postInviteHandler)
    router.delete('/api/admin/convites', deleteInviteHandler)
    router.get('/api/users/me', meHandler)
    app.use(router)

    server = createServer(toNodeListener(app))
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    apiUrl = `http://127.0.0.1:${port}/api/admin/convites`
    meApiUrl = `http://127.0.0.1:${port}/api/users/me`

    const [adminUser] = await db
      .insert(schema.users)
      .values({
        email: adminEmail,
        handle: adminHandle,
        display_name: 'Admin Teste',
        is_admin: true,
      })
      .returning({ id: schema.users.id })

    const [regularUser] = await db
      .insert(schema.users)
      .values({
        email: regularEmail,
        handle: regularHandle,
        display_name: 'Usuário Comum Teste',
        is_admin: false,
      })
      .returning({ id: schema.users.id })

    if (!adminUser || !regularUser) {
      throw new Error('Falha ao criar usuários de teste.')
    }

    adminUserId = adminUser.id
    regularUserId = regularUser.id

    await db.insert(schema.allowed_emails).values([
      { email: adminEmail, note: `${MARKER} admin invite`, invited_by: adminUserId },
      { email: regularEmail, note: `${MARKER} regular invite`, invited_by: adminUserId },
    ])
  }))

  afterAll(async () => {
    await setup.settled()
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
    }
    try {
      if (db) {
        await db.execute(sql`
          DELETE FROM "session" WHERE "userId" IN (SELECT id FROM ba_user WHERE email LIKE ${`%${MARKER}%`})
        `)
        await db.execute(sql`
          DELETE FROM account WHERE "userId" IN (SELECT id FROM ba_user WHERE email LIKE ${`%${MARKER}%`})
        `)
        await db.execute(sql`
          DELETE FROM ba_user WHERE email LIKE ${`%${MARKER}%`}
        `)
      }
      await removeFixtures(MARKER)
    } finally {
      await client?.end()
    }
  }, 30_000)

  it('anonymous gets 401 on GET, POST and DELETE', async () => {
    const getRes = await fetch(apiUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    })
    expect(getRes.status).toBe(401)
    const getBody = (await getRes.json()) as { error?: string }
    expect(getBody.error).toBe('nao_autenticado')

    const postRes = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `${MARKER}-anon@example.com` }),
      signal: AbortSignal.timeout(10_000),
    })
    expect(postRes.status).toBe(401)
    const postBody = (await postRes.json()) as { error?: string }
    expect(postBody.error).toBe('nao_autenticado')

    const delRes = await fetch(apiUrl, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `${MARKER}-anon@example.com` }),
      signal: AbortSignal.timeout(10_000),
    })
    expect(delRes.status).toBe(401)
    const delBody = (await delRes.json()) as { error?: string }
    expect(delBody.error).toBe('nao_autenticado')
  }, 30_000)

  it('non-admin gets 404 on GET, POST and DELETE, and POST did not insert', async () => {
    const regularHeaders = {
      'x-test-user-id': regularUserId,
      'x-test-user-email': regularEmail,
      'content-type': 'application/json',
    }
    const targetEmail = `${MARKER}-blocked@example.com`

    const getRes = await fetch(apiUrl, {
      method: 'GET',
      headers: regularHeaders,
      signal: AbortSignal.timeout(10_000),
    })
    expect(getRes.status).toBe(404)
    const getBody = (await getRes.json()) as { error?: string }
    expect(getBody.error).toBe('nao_encontrado')

    const postRes = await fetch(apiUrl, {
      method: 'POST',
      headers: regularHeaders,
      body: JSON.stringify({ email: targetEmail, note: `${MARKER} blocked` }),
      signal: AbortSignal.timeout(10_000),
    })
    expect(postRes.status).toBe(404)
    const postBody = (await postRes.json()) as { error?: string }
    expect(postBody.error).toBe('nao_encontrado')

    const insertedRows = await db
      .select({ email: schema.allowed_emails.email })
      .from(schema.allowed_emails)
      .where(eq(schema.allowed_emails.email, targetEmail))
    expect(insertedRows).toHaveLength(0)

    const delRes = await fetch(apiUrl, {
      method: 'DELETE',
      headers: regularHeaders,
      body: JSON.stringify({ email: targetEmail }),
      signal: AbortSignal.timeout(10_000),
    })
    expect(delRes.status).toBe(404)
    const delBody = (await delRes.json()) as { error?: string }
    expect(delBody.error).toBe('nao_encontrado')
  }, 30_000)

  it('admin adds invite and it is listed with status pendente; duplicate returns 409', async () => {
    const adminHeaders = {
      'x-test-user-id': adminUserId,
      'x-test-user-email': adminEmail,
      'content-type': 'application/json',
    }
    const newInviteEmail = `${MARKER}-invite-1@example.com`
    const noteText = `${MARKER} teste nota convite`

    const postRes = await fetch(apiUrl, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        email: `  ${newInviteEmail.toUpperCase()}  `,
        note: `  ${noteText}  `,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    expect(postRes.status).toBe(201)
    const postBody = (await postRes.json()) as {
      invite: {
        email: string
        note: string | null
        status: string
        has_profile: boolean
        invited_by_handle: string | null
      }
    }
    expect(postBody.invite).toBeDefined()
    expect(postBody.invite.email).toBe(newInviteEmail)
    expect(postBody.invite.note).toBe(noteText)
    expect(postBody.invite.status).toBe('pendente')
    expect(postBody.invite.has_profile).toBe(false)
    expect(postBody.invite.invited_by_handle).toBe(adminHandle)

    const getRes = await fetch(apiUrl, {
      method: 'GET',
      headers: adminHeaders,
      signal: AbortSignal.timeout(10_000),
    })
    expect(getRes.status).toBe(200)
    const getBody = (await getRes.json()) as {
      invites: Array<{ email: string; note: string | null; status: string }>
    }
    const found = getBody.invites.find((i) => i.email === newInviteEmail)
    expect(found).toBeDefined()
    expect(found?.status).toBe('pendente')
    expect(found?.note).toBe(noteText)

    const dupRes = await fetch(apiUrl, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ email: newInviteEmail }),
      signal: AbortSignal.timeout(10_000),
    })
    expect(dupRes.status).toBe(409)
    const dupBody = (await dupRes.json()) as { error?: string }
    expect(dupBody.error).toBe('convite_existente')
  }, 30_000)

  it('rejects invalid email with 400', async () => {
    const adminHeaders = {
      'x-test-user-id': adminUserId,
      'x-test-user-email': adminEmail,
      'content-type': 'application/json',
    }
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ email: 'email-invalido-sem-arroba' }),
      signal: AbortSignal.timeout(10_000),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toBe('requisicao_invalida')
  }, 30_000)

  it('admin removes another invite successfully, but removing own returns 400', async () => {
    const adminHeaders = {
      'x-test-user-id': adminUserId,
      'x-test-user-email': adminEmail,
      'content-type': 'application/json',
    }

    const ownRes = await fetch(apiUrl, {
      method: 'DELETE',
      headers: adminHeaders,
      body: JSON.stringify({ email: adminEmail }),
      signal: AbortSignal.timeout(10_000),
    })
    expect(ownRes.status).toBe(400)
    const ownBody = (await ownRes.json()) as { error?: string }
    expect(ownBody.error).toBe('convite_proprio')

    const toRemoveEmail = `${MARKER}-remove-me@example.com`
    await invitesService.addInvite(adminUserId, {
      email: toRemoveEmail,
      note: `${MARKER} remove me`,
    })

    const delRes = await fetch(apiUrl, {
      method: 'DELETE',
      headers: adminHeaders,
      body: JSON.stringify({ email: toRemoveEmail }),
      signal: AbortSignal.timeout(10_000),
    })
    expect(delRes.status).toBe(204)

    const remaining = await db
      .select()
      .from(schema.allowed_emails)
      .where(eq(schema.allowed_emails.email, toRemoveEmail))
    expect(remaining).toHaveLength(0)

    const delAgainRes = await fetch(apiUrl, {
      method: 'DELETE',
      headers: adminHeaders,
      body: JSON.stringify({ email: toRemoveEmail }),
      signal: AbortSignal.timeout(10_000),
    })
    expect(delAgainRes.status).toBe(404)
    const notFoundBody = (await delAgainRes.json()) as { error?: string }
    expect(notFoundBody.error).toBe('nao_encontrado')
  }, 30_000)

  it('status is ativado only when ba_user and account with password exist', async () => {
    const activatedEmail = `${MARKER}-activated@example.com`
    const baUserId = `ba-${Date.now()}`.slice(0, 30)
    const accountId = `acc-${Date.now()}`.slice(0, 30)

    await invitesService.addInvite(adminUserId, {
      email: activatedEmail,
      note: `${MARKER} will activate`,
    })

    const beforeActivation = await invitesService.getInviteByEmail(activatedEmail)
    expect(beforeActivation?.status).toBe('pendente')

    await db.execute(sql`
      INSERT INTO ba_user (id, name, email, "emailVerified", "createdAt", "updatedAt")
      VALUES (${baUserId}, 'User Activated', ${activatedEmail}, true, now(), now())
    `)

    const afterUserBeforePassword = await invitesService.getInviteByEmail(activatedEmail)
    expect(afterUserBeforePassword?.status).toBe('pendente')

    await db.execute(sql`
      INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      VALUES (${accountId}, ${activatedEmail}, 'credential', ${baUserId}, 'hashed_password_sample', now(), now())
    `)

    const afterPassword = await invitesService.getInviteByEmail(activatedEmail)
    expect(afterPassword?.status).toBe('ativado')
  }, 30_000)

  it('GET /api/users/me returns is_admin', async () => {
    const adminRes = await fetch(meApiUrl, {
      method: 'GET',
      headers: {
        'x-test-user-id': adminUserId,
        'x-test-user-email': adminEmail,
      },
      signal: AbortSignal.timeout(10_000),
    })
    expect(adminRes.status).toBe(200)
    const adminMe = (await adminRes.json()) as { is_admin?: boolean }
    expect(adminMe?.is_admin).toBe(true)

    const regularRes = await fetch(meApiUrl, {
      method: 'GET',
      headers: {
        'x-test-user-id': regularUserId,
        'x-test-user-email': regularEmail,
      },
      signal: AbortSignal.timeout(10_000),
    })
    expect(regularRes.status).toBe(200)
    const regularMe = (await regularRes.json()) as { is_admin?: boolean }
    expect(regularMe?.is_admin).toBe(false)
  }, 30_000)

  it('removing invite of activated member revokes sessions and credential account while keeping other member sessions', async () => {
    const adminHeaders = {
      'x-test-user-id': adminUserId,
      'x-test-user-email': adminEmail,
      'content-type': 'application/json',
    }

    const activatedEmail = `${MARKER}-act-revoke@example.com`
    const activatedHandle = `rev${Date.now()}`.slice(0, 20)
    const activatedBaUserId = `ba-rev-${Date.now()}`.slice(0, 30)
    const activatedAccountId = `acc-rev-${Date.now()}`.slice(0, 30)
    const session1Id = `sess1-${Date.now()}`.slice(0, 30)
    const session2Id = `sess2-${Date.now()}`.slice(0, 30)

    const otherEmail = `${MARKER}-other-keep@example.com`
    const otherHandle = `oth${Date.now()}`.slice(0, 20)
    const otherBaUserId = `ba-oth-${Date.now()}`.slice(0, 30)
    const otherAccountId = `acc-oth-${Date.now()}`.slice(0, 30)
    const otherSessionId = `sess-oth-${Date.now()}`.slice(0, 30)

    await invitesService.addInvite(adminUserId, {
      email: activatedEmail,
      note: `${MARKER} activated member to be revoked`,
    })
    await db.insert(schema.users).values({
      email: activatedEmail,
      handle: activatedHandle,
      display_name: 'Usuário Revogado',
      is_admin: false,
    })
    await db.execute(sql`
      INSERT INTO ba_user (id, name, email, "emailVerified", "createdAt", "updatedAt")
      VALUES (${activatedBaUserId}, 'Usuario Revogado', ${activatedEmail}, true, now(), now())
    `)
    await db.execute(sql`
      INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      VALUES (${activatedAccountId}, ${activatedEmail}, 'credential', ${activatedBaUserId}, 'hashed_sample', now(), now())
    `)
    await db.execute(sql`
      INSERT INTO "session" (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
      VALUES
        (${session1Id}, now() + interval '30 days', ${`tok1-${Date.now()}`}, now(), now(), ${activatedBaUserId}),
        (${session2Id}, now() + interval '30 days', ${`tok2-${Date.now()}`}, now(), now(), ${activatedBaUserId})
    `)

    await invitesService.addInvite(adminUserId, {
      email: otherEmail,
      note: `${MARKER} other member`,
    })
    await db.insert(schema.users).values({
      email: otherEmail,
      handle: otherHandle,
      display_name: 'Outro Usuario',
      is_admin: false,
    })
    await db.execute(sql`
      INSERT INTO ba_user (id, name, email, "emailVerified", "createdAt", "updatedAt")
      VALUES (${otherBaUserId}, 'Outro Usuario', ${otherEmail}, true, now(), now())
    `)
    await db.execute(sql`
      INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      VALUES (${otherAccountId}, ${otherEmail}, 'credential', ${otherBaUserId}, 'hashed_other', now(), now())
    `)
    await db.execute(sql`
      INSERT INTO "session" (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
      VALUES (${otherSessionId}, now() + interval '30 days', ${`tok-oth-${Date.now()}`}, now(), now(), ${otherBaUserId})
    `)

    const sessionsBefore = await db.execute(sql`
      SELECT s.id
      FROM "session" s
      JOIN ba_user u ON u.id = s."userId"
      WHERE u.email = ${activatedEmail}
    `)
    expect(sessionsBefore).toHaveLength(2)

    const accountsBefore = await db.execute(sql`
      SELECT a.id
      FROM account a
      JOIN ba_user u ON u.id = a."userId"
      WHERE u.email = ${activatedEmail} AND a."providerId" = 'credential'
    `)
    expect(accountsBefore).toHaveLength(1)

    const otherSessionsBefore = await db.execute(sql`
      SELECT s.id
      FROM "session" s
      JOIN ba_user u ON u.id = s."userId"
      WHERE u.email = ${otherEmail}
    `)
    expect(otherSessionsBefore).toHaveLength(1)

    const delRes = await fetch(apiUrl, {
      method: 'DELETE',
      headers: adminHeaders,
      body: JSON.stringify({ email: activatedEmail }),
      signal: AbortSignal.timeout(10_000),
    })
    expect(delRes.status).toBe(204)

    const inviteRow = await db
      .select()
      .from(schema.allowed_emails)
      .where(eq(schema.allowed_emails.email, activatedEmail))
    expect(inviteRow).toHaveLength(0)

    const sessionsAfter = await db.execute(sql`
      SELECT s.id
      FROM "session" s
      JOIN ba_user u ON u.id = s."userId"
      WHERE u.email = ${activatedEmail}
    `)
    expect(sessionsAfter).toHaveLength(0)

    const accountsAfter = await db.execute(sql`
      SELECT a.id
      FROM account a
      JOIN ba_user u ON u.id = a."userId"
      WHERE u.email = ${activatedEmail} AND a."providerId" = 'credential'
    `)
    expect(accountsAfter).toHaveLength(0)

    const userRow = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, activatedEmail))
    expect(userRow).toHaveLength(1)

    const otherSessionsAfter = await db.execute(sql`
      SELECT s.id
      FROM "session" s
      JOIN ba_user u ON u.id = s."userId"
      WHERE u.email = ${otherEmail}
    `)
    expect(otherSessionsAfter).toHaveLength(1)

    const signInRes = await handleAuthRequest(
      new Request('http://localhost:3000/api/auth/entrar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identificador: activatedHandle, senha: 'QualquerSenha123' }),
      }),
    )
    expect(signInRes.status).toBe(400)
    const signInBody = (await signInRes.json()) as { error?: string; message?: string }
    expect(signInBody.error).toBe('validacao')
    expect(signInBody.message).toBe('E-mail, usuário ou senha incorretos.')
  }, 30_000)

  it('removing a never-activated invite still works and deletes no session of anyone', async () => {
    const adminHeaders = {
      'x-test-user-id': adminUserId,
      'x-test-user-email': adminEmail,
      'content-type': 'application/json',
    }
    const neverActivatedEmail = `${MARKER}-never-act@example.com`

    await invitesService.addInvite(adminUserId, {
      email: neverActivatedEmail,
      note: `${MARKER} never activated invite`,
    })

    const bystanderEmail = `${MARKER}-bystander@example.com`
    const bystanderBaUserId = `ba-bys-${Date.now()}`.slice(0, 30)
    const bystanderSessionId = `sess-bys-${Date.now()}`
    await db.execute(sql`
      INSERT INTO ba_user (id, name, email, "emailVerified", "createdAt", "updatedAt")
      VALUES (${bystanderBaUserId}, 'Espectador', ${bystanderEmail}, true, now(), now())
    `)
    await db.execute(sql`
      INSERT INTO "session" (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
      VALUES (${bystanderSessionId}, now() + interval '30 days', ${`tok-bys-${Date.now()}`}, now(), now(), ${bystanderBaUserId})
    `)

    const delRes = await fetch(apiUrl, {
      method: 'DELETE',
      headers: adminHeaders,
      body: JSON.stringify({ email: neverActivatedEmail }),
      signal: AbortSignal.timeout(10_000),
    })
    expect(delRes.status).toBe(204)

    const remaining = await db
      .select()
      .from(schema.allowed_emails)
      .where(eq(schema.allowed_emails.email, neverActivatedEmail))
    expect(remaining).toHaveLength(0)

    const bystanderSessions = await db.execute<{ id: string }>(sql`
      SELECT id FROM "session" WHERE id = ${bystanderSessionId}
    `)
    expect(bystanderSessions).toHaveLength(1)
  }, 30_000)
})
