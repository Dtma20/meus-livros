import { and, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { alias, pgTable, text } from 'drizzle-orm/pg-core'
import { createError } from 'h3'
import type { AddInviteInput, InviteView } from '../../shared/schemas/invites'
import { db } from '../db'
import { allowed_emails, users } from '../db/schema'

const baUser = pgTable('ba_user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
})

const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  password: text('password'),
})

const inviter = alias(users, 'inviter')
const profile = alias(users, 'profile')

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown; cause?: { code?: unknown } } | null)?.code
    ?? (error as { cause?: { code?: unknown } } | null)?.cause?.code
  return code === '23505'
}

export async function getAdminUser(
  userId: string,
): Promise<{ id: string; email: string } | null> {
  const [row] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.is_admin, true)))
    .limit(1)

  return row ?? null
}

export async function listInvites(forEmail?: string): Promise<InviteView[]> {
  const query = db
    .select({
      email: allowed_emails.email,
      note: allowed_emails.note,
      created_at: allowed_emails.created_at,
      invited_by_handle: inviter.handle,
      has_profile: sql<boolean>`${profile.id} IS NOT NULL`,
      has_password: sql<boolean>`${account.password} IS NOT NULL`,
    })
    .from(allowed_emails)
    .leftJoin(inviter, eq(allowed_emails.invited_by, inviter.id))
    .leftJoin(profile, eq(allowed_emails.email, profile.email))
    .leftJoin(baUser, eq(allowed_emails.email, baUser.email))
    .leftJoin(account, and(eq(account.userId, baUser.id), isNotNull(account.password)))
    .orderBy(desc(allowed_emails.created_at))

  const rows = forEmail
    ? await query.where(eq(allowed_emails.email, forEmail.trim().toLowerCase()))
    : await query

  return rows.map((row) => ({
    email: row.email,
    note: row.note ?? null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    invited_by_handle: row.invited_by_handle ?? null,
    status: row.has_password ? 'ativado' : 'pendente',
    has_profile: Boolean(row.has_profile),
  }))
}

export async function getInviteByEmail(email: string): Promise<InviteView | null> {
  const rows = await listInvites(email)
  return rows[0] ?? null
}

export async function addInvite(
  adminId: string,
  input: AddInviteInput,
): Promise<InviteView> {
  const email = input.email.trim().toLowerCase()
  const note = input.note ? input.note.trim() : null

  try {
    await db.insert(allowed_emails).values({
      email,
      invited_by: adminId,
      note,
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw createError({
        statusCode: 409,
        data: {
          error: 'convite_existente',
          message: 'Este e-mail já está na lista de convites.',
        },
      })
    }
    throw error
  }

  const invite = await getInviteByEmail(email)
  if (!invite) {
    throw createError({
      statusCode: 500,
      data: {
        error: 'erro_inesperado',
        message: 'Não foi possível recuperar o convite criado.',
      },
    })
  }

  return invite
}

export async function removeInvite(
  adminEmail: string,
  emailToRemove: string,
): Promise<void> {
  const normalizedAdminEmail = adminEmail.trim().toLowerCase()
  const normalizedEmailToRemove = emailToRemove.trim().toLowerCase()

  if (normalizedAdminEmail === normalizedEmailToRemove) {
    throw createError({
      statusCode: 400,
      data: {
        error: 'convite_proprio',
        message: 'Você não pode remover o seu próprio convite.',
      },
    })
  }

  const deleted = await db
    .delete(allowed_emails)
    .where(eq(allowed_emails.email, normalizedEmailToRemove))
    .returning({ email: allowed_emails.email })

  if (deleted.length === 0) {
    throw createError({
      statusCode: 404,
      data: {
        error: 'nao_encontrado',
        message: 'Convite não encontrado.',
      },
    })
  }
}
