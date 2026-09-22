import { readBody } from 'h3'
import { z } from 'zod'
import { importExternalWork } from '../../services/works'
import { defineApiHandler, parseOrThrow } from '../../utils/api'
import { requireSessionUser } from '../../utils/session'

const importExternalSchema = z.object({
  ol_work_key: z.string().nullish(),
  title: z.string().min(1).max(300),
  authors: z.array(z.string()).default([]),
  first_publish_year: z.number().int().nullish(),
  cover_url: z.string().nullish(),
  ol_cover_id: z.number().int().nullish(),
  language: z.string().nullish(),
})

export default defineApiHandler(async (event) => {
  const user = await requireSessionUser(event)
  const body = await readBody(event)
  const input = parseOrThrow(importExternalSchema, body)

  return await importExternalWork(input, user.id)
})
