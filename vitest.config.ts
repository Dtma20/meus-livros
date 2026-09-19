// Carrega DATABASE_URL do .env para o process.env do runner.
// Sem isso, tests/integration/db.test.ts é pulado sem aviso.
import 'dotenv/config'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    // Node é o padrão: só os testes de componente pagam o custo do DOM,
    // via `// @vitest-environment happy-dom` no topo do arquivo.
    environment: 'node'
  }
})
