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
    hookTimeout: 30_000,
    // Node é o padrão: só os testes de componente pagam o custo do DOM,
    // via `// @vitest-environment happy-dom` no topo do arquivo.
    environment: 'node'
  }
})
