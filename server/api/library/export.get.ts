import { setResponseHeader } from 'h3'
import { defineApiHandler } from '../../utils/api'
import { requireSessionUser } from '../../utils/session'
import { exportUserLibrary } from '../../services/library-transfer'

export default defineApiHandler(async (event) => {
  const user = await requireSessionUser(event)
  const books = await exportUserLibrary(user.id)

  setResponseHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setResponseHeader(event, 'Content-Disposition', 'attachment; filename="meus-livros-export.json"')

  return books
})
