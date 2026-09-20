import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createUser, getUserById, updateUserProfile } from '../../server/services/users'

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDatabaseUrl)('TASK-008 — User profile creation and management (integration)', () => {
  let db: typeof import('../../server/db')['db']
  let schema: typeof import('../../server/db/schema')

  const testId = Date.now()
  const createdEmails: string[] = []
  const createdUserIds: string[] = []

  beforeAll(async () => {
    const dbModule = await import('../../server/db')
    db = dbModule.db
    schema = await import('../../server/db/schema')
  })

  afterAll(async () => {
    // Clean up all rows created by this test run
    if (createdEmails.length > 0) {
      await db.delete(schema.users).where(inArray(schema.users.email, createdEmails))
      await db.delete(schema.allowed_emails).where(inArray(schema.allowed_emails.email, createdEmails))
    }
  })

  it('creates a users row with profile_visibility = "publico" and returns profile info', async () => {
    const email = `test-user-${testId}-1@example.com`
    const handle = `u1_${testId % 10000000}`
    createdEmails.push(email)

    // Add to allowlist first
    await db.insert(schema.allowed_emails).values({
      email,
      note: 'TASK-008 integration test 1',
    })

    const created = await createUser({
      email,
      handle,
      display_name: 'Usuário Teste Um',
    })

    expect(created.id).toBeDefined()
    createdUserIds.push(created.id)
    expect(created.email).toBe(email)
    expect(created.handle).toBe(handle)
    expect(created.display_name).toBe('Usuário Teste Um')
    expect(created.profile_visibility).toBe('publico')

    // Verify row in database
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, created.id))
      .limit(1)

    expect(row).toBeDefined()
    expect(row!.profile_visibility).toBe('publico')
  })

  it('creating a profile twice for the same user returns 409 and leaves exactly one row', async () => {
    const email = `test-user-${testId}-2@example.com`
    const handle = `u2_${testId % 10000000}`
    createdEmails.push(email)

    await db.insert(schema.allowed_emails).values({
      email,
      note: 'TASK-008 integration test 2',
    })

    const first = await createUser({
      email,
      handle,
      display_name: 'Usuário Teste Dois',
    })
    createdUserIds.push(first.id)

    // Second attempt must fail with 409
    let duplicateError: unknown
    try {
      await createUser({
        email,
        handle: `${handle}_alt`,
        display_name: 'Outro Nome',
      })
    } catch (err) {
      duplicateError = err
    }

    expect(duplicateError).toBeDefined()
    const errorObj = duplicateError as { statusCode?: number; data?: { error?: string } }
    expect(errorObj.statusCode).toBe(409)
    expect(errorObj.data?.error).toBe('conflito')

    // Verify exactly one row exists for this email
    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))

    expect(rows.length).toBe(1)
  })

  it('a taken handle returns 409 with a non-empty suggestions array', async () => {
    const emailA = `test-user-${testId}-3a@example.com`
    const emailB = `test-user-${testId}-3b@example.com`
    const takenHandle = `taken_${testId % 1000000}`
    createdEmails.push(emailA, emailB)

    await db.insert(schema.allowed_emails).values([
      { email: emailA, note: 'TASK-008 integration test 3a' },
      { email: emailB, note: 'TASK-008 integration test 3b' },
    ])

    const first = await createUser({
      email: emailA,
      handle: takenHandle,
      display_name: 'Primeiro Dono',
    })
    createdUserIds.push(first.id)

    // Second user attempts to register the same handle
    let collisionError: unknown
    try {
      await createUser({
        email: emailB,
        handle: takenHandle,
        display_name: 'Segundo Usuário',
      })
    } catch (err) {
      collisionError = err
    }

    expect(collisionError).toBeDefined()
    const errorObj = collisionError as {
      statusCode?: number
      data?: { error?: string; suggestions?: string[] }
    }

    expect(errorObj.statusCode).toBe(409)
    expect(errorObj.data?.error).toBe('conflito')
    expect(Array.isArray(errorObj.data?.suggestions)).toBe(true)
    expect(errorObj.data?.suggestions?.length).toBeGreaterThanOrEqual(1)

    // Verify that none of the suggestions match the taken handle
    for (const sug of errorObj.data?.suggestions ?? []) {
      expect(sug).not.toBe(takenHandle)
      expect(sug).toMatch(/^[a-z0-9_]{3,20}$/)
    }
  })

  it('a reserved handle returns 409 with suggestions', async () => {
    const email = `test-user-${testId}-4@example.com`
    createdEmails.push(email)

    await db.insert(schema.allowed_emails).values({
      email,
      note: 'TASK-008 integration test 4',
    })

    let reservedError: unknown
    try {
      await createUser({
        email,
        handle: 'admin',
        display_name: 'Admin Teste',
      })
    } catch (err) {
      reservedError = err
    }

    expect(reservedError).toBeDefined()
    const errorObj = reservedError as {
      statusCode?: number
      data?: { error?: string; suggestions?: string[] }
    }

    expect(errorObj.statusCode).toBe(409)
    expect(errorObj.data?.error).toBe('conflito')
    expect(Array.isArray(errorObj.data?.suggestions)).toBe(true)
    expect(errorObj.data?.suggestions?.length).toBeGreaterThanOrEqual(1)
  })

  it('PATCH cannot change the handle', async () => {
    const email = `test-user-${testId}-5@example.com`
    const originalHandle = `orig_${testId % 1000000}`
    createdEmails.push(email)

    await db.insert(schema.allowed_emails).values({
      email,
      note: 'TASK-008 integration test 5',
    })

    const user = await createUser({
      email,
      handle: originalHandle,
      display_name: 'Nome Original',
    })
    createdUserIds.push(user.id)

    // Attempt to update display_name, bio, profile_visibility, AND handle
    const updated = await updateUserProfile(user.id, {
      display_name: 'Nome Modificado',
      bio: 'Minha nova biografia de leitor.',
      profile_visibility: 'privado',
      handle: 'tentativa_troca_handle',
    })

    // Handle MUST remain unchanged
    expect(updated.handle).toBe(originalHandle)
    expect(updated.display_name).toBe('Nome Modificado')
    expect(updated.bio).toBe('Minha nova biografia de leitor.')
    expect(updated.profile_visibility).toBe('privado')

    // Verify in database that handle was not changed
    const freshUser = await getUserById(user.id)
    expect(freshUser?.handle).toBe(originalHandle)
    expect(freshUser?.display_name).toBe('Nome Modificado')
    expect(freshUser?.profile_visibility).toBe('privado')
  })

  it('rejects profile creation for emails not in allowlist with 404', async () => {
    const nonAllowedEmail = `blocked-${testId}@example.com`

    let error: unknown
    try {
      await createUser({
        email: nonAllowedEmail,
        handle: `block_${testId % 1000000}`,
        display_name: 'Usuário Bloqueado',
      })
    } catch (err) {
      error = err
    }

    expect(error).toBeDefined()
    const errorObj = error as { statusCode?: number; data?: { error?: string } }
    expect(errorObj.statusCode).toBe(404)
    expect(errorObj.data?.error).toBe('nao_encontrado')
  })
})
