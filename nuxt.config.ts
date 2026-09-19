// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  modules: ['@nuxt/eslint'],
  css: ['~/assets/css/tokens.css'],
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
