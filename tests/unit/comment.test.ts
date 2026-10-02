import { describe, expect, it } from 'vitest'
import { commentInputSchema, commentQuerySchema } from '../../shared/schemas/comment'

const blockId = '123e4567-e89b-42d3-a456-426614174000'

describe('Comment input and query schemas', () => {
  it('trims plain text and defaults to the review conversation', () => {
    expect(commentInputSchema.parse({ body: '  <b>Ótimo</b>  ' })).toEqual({ body: '<b>Ótimo</b>' })
    expect(commentInputSchema.parse({ body: 'Trecho', block_id: blockId }).block_id).toBe(blockId)
    expect(commentInputSchema.parse({ body: 'Resenha', block_id: null }).block_id).toBeNull()
  })

  it.each(['', ' \n\t ', 'x'.repeat(2001)])('rejects empty or oversized comments', (body) => {
    expect(commentInputSchema.safeParse({ body }).success).toBe(false)
  })

  it('checks the length after trimming and rejects invalid targets', () => {
    expect(commentInputSchema.safeParse({ body: ` ${'x'.repeat(2000)} ` }).success).toBe(true)
    expect(commentInputSchema.safeParse({ body: 'texto', block_id: 'outro' }).success).toBe(false)
  })

  it('bounds page size and validates chronological cursors', () => {
    expect(commentQuerySchema.parse({})).toEqual({ limit: 50 })
    expect(commentQuerySchema.parse({ limit: '100', block_id: blockId })).toEqual({ limit: 100, block_id: blockId })
    for (const limit of ['0', '101', '1.5']) expect(commentQuerySchema.safeParse({ limit }).success).toBe(false)
    const cursor = JSON.stringify({ created_at: '2026-10-01T12:00:00.123456+00:00', id: blockId })
    expect(commentQuerySchema.parse({ cursor }).cursor).toEqual(JSON.parse(cursor))
    for (const invalid of ['oops', '{}', JSON.stringify({ created_at: 'yesterday', id: blockId })]) {
      expect(commentQuerySchema.safeParse({ cursor: invalid }).success).toBe(false)
    }
  })
})
