export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  app: {
    head: {
      htmlAttrs: {
        lang: 'pt-BR'
      },
      title: 'Meus Livros',
      link: [
        { rel: 'icon', href: '/favicon.ico?v=3', sizes: 'any' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg?v=3' },
        { rel: 'preconnect', href: 'https://covers.openlibrary.org', crossorigin: '' },
        { rel: 'preconnect', href: 'https://m.media-amazon.com', crossorigin: '' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:ital,wght@0,500;0,600;0,700;1,400;1,600&display=swap' },
      ]
    }
  },
  modules: ['@nuxt/eslint'],
  css: ['~/assets/css/tokens.css', '~/assets/css/forms.css'],
  routeRules: {
    '/**': {
      headers: {
        'Content-Security-Policy': [
          "default-src 'self'",
          "img-src 'self' https: data:",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com data:",
          "object-src 'none'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; '),
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    },
  },
  typescript: {
    strict: true,
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
