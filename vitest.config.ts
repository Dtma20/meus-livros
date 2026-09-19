// Carrega DATABASE_URL do .env para o process.env do runner.
// Sem isso, tests/integration/db.test.ts é pulado sem aviso.
import 'dotenv/config'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node'
  }
})
