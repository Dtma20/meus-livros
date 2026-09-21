// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  app: {
    head: {
      htmlAttrs: {
        lang: 'pt-BR'
      },
      // Covers come from third-party hosts, so the LCP image pays DNS+TCP+TLS
      // before its first byte. These two serve 72 of the 86 covers in the real
      // corpus (openlibrary is BookCover's fallback for the 39 works without a
      // cover_url of their own); the remaining ten hosts have one or two covers
      // each and are not worth a hint. Deliberately not `preload`: which cover
      // comes first is per-profile data, and an unused preload is a wasted
      // request.
      link: [
        { rel: 'preconnect', href: 'https://covers.openlibrary.org', crossorigin: '' },
        { rel: 'preconnect', href: 'https://m.media-amazon.com', crossorigin: '' },
      ]
    }
  },
  modules: ['@nuxt/eslint'],
  css: ['~/assets/css/tokens.css'],
  typescript: {
    strict: true,
    // `npm run typecheck` is the gate: CLAUDE.md requires it to pass before
    // every commit. Keeping it in the build too type-checks the project twice
    // per deploy and on every dev server start.
    typeCheck: false
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
