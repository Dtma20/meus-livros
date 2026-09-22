import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteWork } from '../../server/services/catalog'

const mockWorkLimit = vi.fn()
const mockLogCountWhere = vi.fn()
const mockDelete = vi.fn()
const mockDeleteWhere = vi.fn()

vi.mock('../../server/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (...whereArgs: unknown[]) => ({
          limit: (...limitArgs: unknown[]) => mockWorkLimit(...limitArgs),
          then: (resolve: (val: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve(mockLogCountWhere(...whereArgs)).then(resolve, reject),
        }),
      }),
    }),
    delete: (...args: unknown[]) => {
      mockDelete(...args)
      return {
        where: (...whereArgs: unknown[]) => mockDeleteWhere(...whereArgs),
      }
    },
  },
}))

describe('deleteWork (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws 404 if work does not exist', async () => {
    mockWorkLimit.mockResolvedValueOnce([])

    await expect(deleteWork('11111111-1111-4111-8111-111111111111', 'user-123')).rejects.toMatchObject({
      statusCode: 404,
      data: { error: 'nao_encontrado' },
    })
  })

  it('throws 404 if work was created by a different user', async () => {
    mockWorkLimit.mockResolvedValueOnce([{ id: '11111111-1111-4111-8111-111111111111', created_by: 'another-user' }])

    await expect(deleteWork('11111111-1111-4111-8111-111111111111', 'user-123')).rejects.toMatchObject({
      statusCode: 404,
      data: { error: 'nao_encontrado' },
    })
  })

  it('throws 400 if work has existing reading logs', async () => {
    mockWorkLimit.mockResolvedValueOnce([{ id: '11111111-1111-4111-8111-111111111111', created_by: 'user-123' }])
    mockLogCountWhere.mockResolvedValueOnce([{ n: 3 }])

    await expect(deleteWork('11111111-1111-4111-8111-111111111111', 'user-123')).rejects.toMatchObject({
      statusCode: 400,
      data: { error: 'requisicao_invalida' },
    })
  })

  it('deletes the work when created by user and logCount is 0', async () => {
    mockWorkLimit.mockResolvedValueOnce([{ id: '11111111-1111-4111-8111-111111111111', created_by: 'user-123' }])
    mockLogCountWhere.mockResolvedValueOnce([{ n: 0 }])
    mockDeleteWhere.mockResolvedValueOnce([])

    await deleteWork('11111111-1111-4111-8111-111111111111', 'user-123')

    expect(mockDelete).toHaveBeenCalledTimes(1)
  })
})
