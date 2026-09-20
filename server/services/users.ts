import { eq, inArray } from 'drizzle-orm'
import { createError } from 'h3'
import { isReservedHandle, transliterateToHandle } from '../../shared/schemas/user'
import { db } from '../db'
import { users } from '../db/schema'
import type { User, Visibility } from '../db/types'
import { isEmailAllowed } from './auth'

export interface CreateUserData {
  email: string
  handle: string
  display_name: string
}

export interface UpdateUserData {
  display_name?: string
  bio?: string | null
  profile_visibility?: Visibility
  handle?: string // Explicitly ignored; handle is immutable
}

/**
 * Looks up a user by their primary UUID.
 */
export async function getUserById(id: string): Promise<User | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1)

  return row ?? null
}

/**
 * Looks up a user by email (case-insensitive citext).
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1)

  return row ?? null
}

/**
 * Looks up a user by handle (case-insensitive citext).
 */
export async function getUserByHandle(handle: string): Promise<User | null> {
  const normalized = handle.trim().toLowerCase()
  if (!normalized) return null

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.handle, normalized))
    .limit(1)

  return row ?? null
}

/**
 * Generates up to three verified available handle suggestions upon collision.
 * Checks candidate suggestions against both reserved words and the database.
 */
export async function getHandleSuggestions(handle: string, displayName?: string): Promise<string[]> {
  const base = handle.trim().toLowerCase()
  const rawCandidates: string[] = []

  // 1. Candidate derived from display name (e.g. "João Silva" -> "joao_silva")
  if (displayName) {
    const fromName = transliterateToHandle(displayName)
    if (fromName && fromName !== base && fromName.length >= 3 && fromName.length <= 20) {
      rawCandidates.push(fromName)
    }

    const nameParts = displayName.trim().split(/\s+/)
    if (nameParts.length > 1) {
      const lastName = transliterateToHandle(nameParts[nameParts.length - 1] ?? '')
      if (lastName) {
        const combined = `${base}_${lastName}`.slice(0, 20)
        if (combined.length >= 3 && combined !== base && !rawCandidates.includes(combined)) {
          rawCandidates.push(combined)
        }
      }
    }
  }

  // 2. Numeric and suffix variations
  const suffixCandidates = [
    `${base.slice(0, 19)}2`,
    `${base.slice(0, 19)}s`,
    `${base.slice(0, 19)}3`,
    `${base.slice(0, 18)}_1`,
    `${base.slice(0, 19)}4`,
    `${base.slice(0, 18)}_2`,
  ]

  for (const cand of suffixCandidates) {
    if (cand.length >= 3 && cand.length <= 20 && !rawCandidates.includes(cand)) {
      rawCandidates.push(cand)
    }
  }

  // Filter out invalid format and reserved handles
  const validCandidates = rawCandidates.filter(
    (c) => /^[a-z0-9_]{3,20}$/.test(c) && !isReservedHandle(c),
  )

  // Verify candidate availability against the database
  let available: string[] = []
  if (validCandidates.length > 0) {
    const existing = await db
      .select({ handle: users.handle })
      .from(users)
      .where(inArray(users.handle, validCandidates))

    const takenSet = new Set(existing.map((e) => e.handle.toLowerCase()))
    available = validCandidates.filter((c) => !takenSet.has(c))
  }

  // If we still have fewer than 3 suggestions, generate numeric suffixes in a single batch query
  if (available.length < 3) {
    const fallbackCandidates: string[] = []
    for (let n = 5; n < 100 && fallbackCandidates.length < 30; n++) {
      const cand = `${base.slice(0, 20 - String(n).length)}${n}`
      if (
        /^[a-z0-9_]{3,20}$/.test(cand) &&
        !isReservedHandle(cand) &&
        !available.includes(cand) &&
        !fallbackCandidates.includes(cand)
      ) {
        fallbackCandidates.push(cand)
      }
    }

    if (fallbackCandidates.length > 0) {
      const existing = await db
        .select({ handle: users.handle })
        .from(users)
        .where(inArray(users.handle, fallbackCandidates))

      const takenSet = new Set(existing.map((e) => e.handle.toLowerCase()))
      for (const cand of fallbackCandidates) {
        if (!takenSet.has(cand)) {
          available.push(cand)
          if (available.length >= 3) break
        }
      }
    }
  }

  return available.slice(0, 3)
}

/**
 * Creates a new profile in the `users` table.
 *
 * Rules:
 * - Email must be present in `allowed_emails`.
 * - User must not already have a `users` row.
 * - Handle must not be reserved.
 * - Handle must not be already registered.
 * - Profile visibility defaults to 'publico'.
 */
export async function createUser(data: CreateUserData): Promise<User> {
  const normalizedEmail = data.email.trim().toLowerCase()
  const normalizedHandle = data.handle.trim().toLowerCase()
  const displayName = data.display_name.trim()

  // 1. Verify allowlist membership (Requirement 6)
  const allowed = await isEmailAllowed(normalizedEmail)
  if (!allowed) {
    throw createError({
      statusCode: 404,
      data: {
        error: 'nao_encontrado',
        message: 'Não encontrado.',
      },
    })
  }

  // 2. Prevent duplicate profile row (Security requirement & Acceptance criterion)
  const existingUser = await getUserByEmail(normalizedEmail)
  if (existingUser) {
    throw createError({
      statusCode: 409,
      data: {
        error: 'conflito',
        message: 'Usuário já possui um perfil cadastrado.',
      },
    })
  }

  // 3. Reserved handle check (Requirement 3 & Acceptance criterion)
  if (isReservedHandle(normalizedHandle)) {
    const suggestions = await getHandleSuggestions(normalizedHandle, displayName)
    throw createError({
      statusCode: 409,
      data: {
        error: 'conflito',
        message: 'Este nome de usuário é reservado.',
        suggestions,
      },
    })
  }

  // 4. Handle collision check against existing users (Requirement 5)
  const takenUser = await getUserByHandle(normalizedHandle)
  if (takenUser) {
    const suggestions = await getHandleSuggestions(normalizedHandle, displayName)
    throw createError({
      statusCode: 409,
      data: {
        error: 'conflito',
        message: 'Este nome de usuário já está em uso.',
        suggestions,
      },
    })
  }

  // 5. Insert profile into `users` table with profile_visibility = 'publico' (Requirement 7)
  try {
    const [created] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        handle: normalizedHandle,
        display_name: displayName,
        profile_visibility: 'publico',
      })
      .returning()

    if (!created) {
      throw createError({
        statusCode: 500,
        data: {
          error: 'erro_interno',
          message: 'Não foi possível criar o perfil.',
        },
      })
    }

    return created
  } catch (err: unknown) {
    // Check for PostgreSQL unique constraint violations (code 23505)
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      const message = String((err as { message?: string }).message ?? '')
      if (message.includes('users_email') || message.includes('email')) {
        throw createError({
          statusCode: 409,
          data: {
            error: 'conflito',
            message: 'Usuário já possui um perfil cadastrado.',
          },
        })
      }

      const suggestions = await getHandleSuggestions(normalizedHandle, displayName)
      throw createError({
        statusCode: 409,
        data: {
          error: 'conflito',
          message: 'Este nome de usuário já está em uso.',
          suggestions,
        },
      })
    }

    throw err
  }
}

/**
 * Updates an existing user's profile.
 *
 * Rules:
 * - Updates display_name, bio (<= 500 chars), profile_visibility.
 * - The handle is immutable in MVP — any handle field in input is ignored.
 */
export async function updateUserProfile(userId: string, data: UpdateUserData): Promise<User> {
  const existing = await getUserById(userId)
  if (!existing) {
    throw createError({
      statusCode: 404,
      data: {
        error: 'nao_encontrado',
        message: 'Usuário não encontrado.',
      },
    })
  }

  const updateData: Partial<typeof users.$inferInsert> = {}

  if (data.display_name !== undefined) {
    updateData.display_name = data.display_name.trim()
  }

  if (data.bio !== undefined) {
    updateData.bio = data.bio === null ? null : data.bio.trim()
  }

  if (data.profile_visibility !== undefined) {
    updateData.profile_visibility = data.profile_visibility
  }

  // If no fields to update, return the current row
  if (Object.keys(updateData).length === 0) {
    return existing
  }

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId))
    .returning()

  if (!updated) {
    throw createError({
      statusCode: 404,
      data: {
        error: 'nao_encontrado',
        message: 'Usuário não encontrado.',
      },
    })
  }

  return updated
}
