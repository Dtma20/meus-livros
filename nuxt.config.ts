export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      htmlAttrs: {
        lang: 'pt-BR'
      },
      title: 'Livrolas',
      meta: [
        { name: 'theme-color', content: '#14181c' },
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico?v=4', sizes: '16x16 32x32 48x48' },
        { rel: 'icon', type: 'image/png', sizes: '512x512', href: '/brand/logo-512.png?v=4' },
        { rel: 'apple-touch-icon', href: '/brand/apple-touch-icon.png?v=4' },
        { rel: 'preconnect', href: 'https://covers.openlibrary.org' },
        { rel: 'preconnect', href: 'https://m.media-amazon.com' },
      ]
    }
  },
  modules: ['@nuxt/eslint'],
  css: ['~/assets/css/fonts.css', '~/assets/css/tokens.css', '~/assets/css/forms.css', '~/assets/css/paper.css'],
  routeRules: {
    '/**': {
      headers: {
        'Content-Security-Policy': [
          "default-src 'self'",
          "img-src 'self' https: data:",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "font-src 'self' data:",
          "object-src 'none'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; '),
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
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
