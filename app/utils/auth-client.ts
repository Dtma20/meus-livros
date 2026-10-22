import { createAuthClient } from 'better-auth/vue'
import { emailOTPClient } from 'better-auth/client/plugins'

// Without a timeout a stalled request keeps the submit button disabled forever.
// better-fetch aborts after `timeout` ms and the rejection reaches the caller's catch.
export const authClient = createAuthClient({
  plugins: [
    emailOTPClient(),
  ],
  fetchOptions: {
    timeout: 15_000,
  },
})
