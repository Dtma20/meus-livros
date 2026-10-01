import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

const excluded = [...configDefaults.exclude, '.claude/**']
const domUnits = '**/tests/unit/*{add-book-form,components,empty-error-loading,log-form,log,profile-components,profile-page,reading-map,routes,work,edition-editor,home-layout,use-book-filters,new-posts-pill,use-feed-new-posts,back-home-copy,book-card,book-cover,book-page-delete-undo,book-page-layout,dashboard-empty-rows,diary,header-search,rating-histogram,rating-input,reading-blocks-section,reading-map-fold,sign-in-page,stats-components,stats-pages,keyboard-shortcut-preferences,scroll-reveal,form-draft,author-input,edition-picker,delayed-delete,share-feedback,accessibility-states,json-import-section,entry-error,entry-delete-undo,edit-page}*.test.ts'
const domIntegrations = '**/tests/integration/*{axe,empty-error-states}*.test.ts'
const sharedTestOptions = { globals: true, testTimeout: 30_000, hookTimeout: 60_000 }

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
          include: [domUnits],
        },
      },
      {
        test: {
          ...sharedTestOptions,
          name: 'unit-node',
          environment: 'node',
          include: ['**/tests/unit/**/*.test.ts'],
          exclude: [...excluded, domUnits],
        },
      },
      {
        test: {
          ...sharedTestOptions,
          name: 'integration-dom',
          environment: 'happy-dom',
          include: [domIntegrations],
          globalSetup: ['./tests/global-setup.ts'],
        },
      },
      {
        test: {
          ...sharedTestOptions,
          name: 'integration-node',
          environment: 'node',
          include: ['**/tests/integration/**/*.test.ts'],
          exclude: [...excluded, domIntegrations],
          globalSetup: ['./tests/global-setup.ts'],
        },
      },
    ],
  },
})
