import { createServer, type Server } from 'node:http'
import { createApp, createError, createRouter, toNodeListener } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import getComments from '../../server/api/logs/[id]/comments/index.get'
import postComment from '../../server/api/logs/[id]/comments/index.post'
import deleteComment from '../../server/api/logs/[id]/comments/[commentId].delete'

const services = vi.hoisted(() => ({
  getCommentsForLog: vi.fn(),
  createComment: vi.fn(),
  deleteComment: vi.fn(),
  user: null as { id: string } | null,
}))

vi.mock('../../server/services/comments', () => services)
vi.mock('../../server/utils/session', () => ({
  getSessionUser: async () => services.user,
  requireSessionUser: async () => {
    if (!services.user) throw createError({ statusCode: 401, data: { error: 'nao_autenticado' } })
    return services.user
  },
}))

const id = '123e4567-e89b-42d3-a456-426614174000'
const commentId = '123e4567-e89b-42d3-a456-426614174001'
const blockId = '123e4567-e89b-42d3-a456-426614174002'

describe('Comment HTTP routes', () => {
  let server: Server
  let url: string

  beforeAll(async () => {
    const app = createApp()
    const router = createRouter()
    router.get('/api/logs/:id/comments', getComments)
    router.post('/api/logs/:id/comments', postComment)
    router.delete('/api/logs/:id/comments/:commentId', deleteComment)
    app.use(router)
    server = createServer(toNodeListener(app))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing HTTP address')
    url = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })

  beforeEach(() => {
    vi.clearAllMocks()
    services.user = null
    services.getCommentsForLog.mockResolvedValue({ comments: [] })
    services.createComment.mockResolvedValue({ id: commentId, body: 'Texto', block_id: null })
    services.deleteComment.mockResolvedValue(undefined)
  })

  it('reads anonymous review and block conversations with validated query', async () => {
    const response = await fetch(`${url}/api/logs/${id}/comments?block_id=${blockId}&limit=10`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ comments: [] })
    expect(services.getCommentsForLog).toHaveBeenCalledWith(id, null, { block_id: blockId, limit: 10 })
  })

  it('requires login before accepting a comment body', async () => {
    const response = await fetch(`${url}/api/logs/${id}/comments`, { method: 'POST', body: 'not json' })
    expect(response.status).toBe(401)
    expect(services.createComment).not.toHaveBeenCalled()
  })

  it('returns the created comment and passes trimmed text and member identity', async () => {
    services.user = { id: commentId }
    const response = await fetch(`${url}/api/logs/${id}/comments`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: ' Texto ', block_id: blockId }),
    })
    expect(response.status).toBe(200)
    expect((await response.json()).id).toBe(commentId)
    expect(services.createComment).toHaveBeenCalledWith(id, commentId, { body: 'Texto', block_id: blockId })
  })

  it('rejects blank text and invalid query cursors with 400', async () => {
    services.user = { id: commentId }
    const response = await fetch(`${url}/api/logs/${id}/comments`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: '  ' }),
    })
    expect(response.status).toBe(400)
    expect(services.createComment).not.toHaveBeenCalled()
    const query = await fetch(`${url}/api/logs/${id}/comments?cursor=broken`)
    expect(query.status).toBe(400)
    expect(services.getCommentsForLog).not.toHaveBeenCalled()
  })

  it('validates both nested identifiers on deletion', async () => {
    services.user = { id: blockId }
    for (const path of [`bad/comments/${commentId}`, `${id}/comments/bad`]) {
      const response = await fetch(`${url}/api/logs/${path}`, { method: 'DELETE' })
      expect(response.status).toBe(404)
    }
    expect(services.deleteComment).not.toHaveBeenCalled()
    const response = await fetch(`${url}/api/logs/${id}/comments/${commentId}`, { method: 'DELETE' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(services.deleteComment).toHaveBeenCalledWith(id, commentId, blockId)
  })

  it('preserves indistinguishable hidden resource errors from services', async () => {
    services.getCommentsForLog.mockRejectedValue(createError({
      statusCode: 404, data: { error: 'nao_encontrado', message: 'Conversa não encontrada.' },
    }))
    const response = await fetch(`${url}/api/logs/${id}/comments`)
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: 'nao_encontrado', message: 'Conversa não encontrada.' })
  })
})
