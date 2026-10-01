import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

const excluded = [...configDefaults.exclude, '.claude/**', '.agents/**']

// The file directive is the source of truth; adding a DOM test needs no allowlist edit.
const unitDir = fileURLToPath(new URL('./tests/unit', import.meta.url))
const domUnitGlobs = fs.readdirSync(unitDir, { recursive: true })
  .filter((name): name is string => typeof name === 'string' && name.endsWith('.test.ts'))
  .filter((name) => /^\/\/ @vitest-environment happy-dom\r?\n/.test(fs.readFileSync(path.join(unitDir, name), 'utf8')))
  .map((name) => `**/tests/unit/${name.replaceAll('\\', '/')}`)
const sharedTestOptions = {
  globals: true,
  testTimeout: 30_000,
  hookTimeout: 60_000,
  ...(process.platform === 'win32' ? { maxWorkers: 4 } : {}),
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      '~~': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    ...sharedTestOptions,
    exclude: excluded,
    projects: [
      {
        test: {
          ...sharedTestOptions,
          name: 'unit-dom',
          environment: 'happy-dom',
          include: domUnitGlobs,
        },
      },
      {
        test: {
          ...sharedTestOptions,
          name: 'unit-node',
          environment: 'node',
          include: ['**/tests/unit/**/*.test.ts'],
          exclude: [...excluded, ...domUnitGlobs],
        },
      },
      {
        test: {
          ...sharedTestOptions,
          name: 'integration-dom',
          environment: 'happy-dom',
          include: ['**/tests/integration/empty-error-states.test.ts'],
          globalSetup: ['./tests/integration-setup.ts'],
        },
      },
      {
        test: {
          ...sharedTestOptions,
          name: 'integration-node',
          environment: 'node',
          include: ['**/tests/integration/**/*.test.ts'],
          exclude: [
            ...excluded,
            '**/tests/integration/empty-error-states.test.ts',
            '**/tests/integration/routes.test.ts',
            '**/tests/integration/axe.test.ts',
          ],
          globalSetup: ['./tests/integration-setup.ts'],
        },
      },
      {
        test: {
          ...sharedTestOptions,
          name: 'ssr-node',
          environment: 'node',
          include: ['**/tests/integration/routes.test.ts'],
          globalSetup: ['./tests/integration-setup.ts', './tests/global-setup.ts'],
        },
      },
      {
        test: {
          ...sharedTestOptions,
          name: 'ssr-dom',
          environment: 'happy-dom',
          include: ['**/tests/integration/axe.test.ts'],
          globalSetup: ['./tests/integration-setup.ts', './tests/global-setup.ts'],
        },
      },
    ],
  },
})
