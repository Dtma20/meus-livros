import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
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
    exclude: [...configDefaults.exclude, '.claude/**'],
    globals: true,
    globalSetup: ['./tests/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    projects: [
      {
        test: {
          name: 'dom',
          environment: 'happy-dom',
          globals: true,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          include: [
            '**/tests/unit/*{add-book-form,components,empty-error-loading,log-form,log,profile-components,profile-page,reading-map,routes,work,edition-editor,home-layout,use-book-filters,new-posts-pill,use-feed-new-posts,back-home-copy,book-card,book-cover,book-page-delete-undo,book-page-layout,dashboard-empty-rows,diary,header-search,rating-histogram,rating-input,reading-blocks-section,reading-map-fold,sign-in-page,stats-components,stats-pages}*.test.ts',
            '**/tests/integration/*{axe,empty-error-states}*.test.ts',
          ],
        },
      },
      {
        test: {
          name: 'node',
          environment: 'node',
          globals: true,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          exclude: [
            ...configDefaults.exclude,
            '.claude/**',
            '**/tests/unit/*{add-book-form,components,empty-error-loading,log-form,log,profile-components,profile-page,reading-map,routes,work,edition-editor,home-layout,use-book-filters,new-posts-pill,use-feed-new-posts,back-home-copy,book-card,book-cover,book-page-delete-undo,book-page-layout,dashboard-empty-rows,diary,header-search,rating-histogram,rating-input,reading-blocks-section,reading-map-fold,sign-in-page,stats-components,stats-pages}*.test.ts',
            '**/tests/integration/*{axe,empty-error-states}*.test.ts',
          ],
        },
      },
    ],
  },
})
