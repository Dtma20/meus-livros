import { z } from 'zod'

export const memberRecentCoverSchema = z.object({
  work_title: z.string(),
  cover_url: z.string().nullable(),
})

export const memberViewSchema = z.object({
  handle: z.string(),
  display_name: z.string(),
  bio: z.string().nullable(),
  visible_log_count: z.number().int().nonnegative(),
  last_activity_at: z.string().nullable(),
  recent_covers: z.array(memberRecentCoverSchema),
})

export const membersResponseSchema = z.object({
  members: z.array(memberViewSchema),
})

export type MemberRecentCover = z.infer<typeof memberRecentCoverSchema>
export type MemberView = z.infer<typeof memberViewSchema>
export type MembersResponse = z.infer<typeof membersResponseSchema>
