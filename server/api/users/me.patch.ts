import { readBody, setResponseStatus } from 'h3'
import { updateProfileSchema } from '../../../shared/schemas/user'
import { updateUserProfile } from '../../services/users'
import { defineApiHandler, parseOrThrow } from '../../utils/api'
import { requireSessionUser } from '../../utils/session'

export default defineApiHandler(async (event) => {
  const sessionUser = await requireSessionUser(event)
  const body = await readBody(event)
  const input = parseOrThrow(updateProfileSchema, body)

  const updated = await updateUserProfile(sessionUser.id, {
    display_name: input.display_name,
    bio: input.bio,
    profile_visibility: input.profile_visibility,
  })

  setResponseStatus(event, 200)
  return {
    id: updated.id,
    handle: updated.handle,
    display_name: updated.display_name,
    bio: updated.bio,
    profile_visibility: updated.profile_visibility,
  }
})
