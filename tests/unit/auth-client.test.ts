import { describe, expect, it, vi } from 'vitest'

const createAuthClient = vi.hoisted(() => vi.fn(() => ({})))

vi.mock('better-auth/vue', () => ({ createAuthClient }))
vi.mock('better-auth/client/plugins', () => ({
  emailOTPClient: () => ({ id: 'email-otp' }),
}))

describe('authClient', () => {
  it('sets a 15 second fetch timeout so a stalled auth call cannot hang the form', async () => {
    await import('../../app/utils/auth-client')

    expect(createAuthClient).toHaveBeenCalledWith(
      expect.objectContaining({
        fetchOptions: { timeout: 15_000 },
      }),
    )
  })
})
