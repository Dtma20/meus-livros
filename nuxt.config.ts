// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  app: {
    head: {
      htmlAttrs: {
        lang: 'pt-BR'
      },
      title: 'Meus Livros',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://covers.openlibrary.org', crossorigin: '' },
        { rel: 'preconnect', href: 'https://m.media-amazon.com', crossorigin: '' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:ital,wght@0,500;0,600;0,700;1,400;1,600&display=swap' },
      ]
    }
  },
  modules: ['@nuxt/eslint'],
  css: ['~/assets/css/tokens.css'],
  routeRules: {
    // security.md asks for the CSP in route rules and has an acceptance
    // checkbox for it; it was never implemented. Headers only — no cache
    // directive, because CLAUDE.md rules out edge caching that would break
    // read-your-own-write.
    //
    // Two directives deviate from the policy written in security.md §4, and
    // both deviations are measured rather than assumed.
    //
    // `script-src` needs 'unsafe-inline'. The policy says `script-src 'self'`,
    // which breaks the application outright: Nuxt's production HTML ships an
    // inline `<script type="importmap">` and an inline bootstrap `<script>`,
    // verified by serving the real build and reading the markup. Without
    // 'unsafe-inline' the importmap is blocked and module resolution fails.
    // Nonces would be the correct answer and need a module this project has
    // not taken on. What the directive still buys: an injected
    // `<script src="//attacker/">` is refused, and the XSS route it would come
    // through is already shut — `v-html` is banned repo-wide and ESLint-
    // enforced, and reviews are plain text rendered through `{{ }}`.
    //
    // `img-src` is widened from `https://covers.openlibrary.org` to `https:`.
    // security.md predicted this exactly — "if arbitrary cover_url values are
    // ever allowed from outside Open Library, this must widen, and widening it
    // is a reviewable event" — and that condition has already been true for a
    // while without anyone noticing: coverUrlSchema accepts any https host, and
    // the real corpus draws 47 covers from eleven of them. The narrow policy
    // would have blanked 47 of 86 covers on the first deploy, silently.
    // Pinning the eleven hosts was rejected: any member can add a book, so a
    // new host means a cover that silently fails until someone edits this file.
    // Proxying covers through the app would restore `'self'`, and it would also
    // collapse the twelve TLS handshakes the profile page currently opens — it
    // is the right answer if the cohort ever grows, and it is infrastructure
    // this MVP does not need. What `https:` concedes: a member could point a
    // cover at their own server and learn who viewed that book. Real, small
    // inside an invite-only group, and the write-side `https:` validation
    // remains the actual control.
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
