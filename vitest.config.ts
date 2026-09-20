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
    // Node é o padrão: só os testes de componente pagam o custo do DOM,
    // via `// @vitest-environment happy-dom` no topo do arquivo.
    environment: 'node'
  }
})
