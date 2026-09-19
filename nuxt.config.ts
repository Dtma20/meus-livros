// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  modules: ['@nuxt/eslint'],
  typescript: {
    strict: true,
    typeCheck: true
  },
  nitro: {
    preset: 'vercel',
    vercel: {
      functions: {
        regions: ['gru1']
      }
    }
  }
})
