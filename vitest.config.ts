import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      '~~': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    globals: true,
    // Builds the bundle before any worker starts. Doing it from a test file's
    // beforeAll rewrites .nuxt while other workers are resolving against it.
    globalSetup: ['./tests/global-setup.ts'],
    // The suite talks to a remote Postgres and to a test HTTP server, so
    // vitest's 5s default measures Neon's latency on the night it runs and
    // fails a different test each time -- four runs today failed four
    // different sets. Prazo generoso não deixa teste que passa mais lento:
    // só muda quanto tempo um teste travado espera antes de reportar.
    testTimeout: 30_000,
    // beforeAll/afterAll seed and clean fixtures over the same round trips,
    // and vitest defaults these to 10s.
    //
    // 60s, not 30s, and the number is measured rather than picked: round-trip
    // latency from a development machine to Neon is ~70ms median with peaks
    // over 200ms — production is Vercel gru1 to Neon sa-east-1, same region and
    // an order of magnitude better, but the suite never runs there. feed.test's
    // beforeAll seeds nine works through createWork, which is dozens of
    // sequential round trips serialised behind `max: 1`, and it crossed 30s.
    //
    // Hooks get the bigger budget on purpose: a test that times out fails
    // loudly, while a *hook* that times out skips its whole file and abandons
    // the fixtures it had already inserted. Three stray users and nine stray
    // works in the real database came from exactly that.
    hookTimeout: 60_000,
    // Node é o padrão: só os testes de componente pagam o custo do DOM,
    // via `// @vitest-environment happy-dom` no topo do arquivo.
    environment: 'node'
  }
})
