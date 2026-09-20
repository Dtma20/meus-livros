import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    files: ['**/*.vue'],
    rules: {
      'vue/no-v-html': 'error'
    }
  },
  {
    // `app/` is the client bundle. Nothing under `server/` belongs in it, not even
    // a type: reaching across couples a page to a server module's internals, and
    // the day someone drops the `type` keyword it stops being erased. The response
    // contract both sides speak lives in `shared/`.
    files: ['app/**/*.{js,mjs,ts,vue}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['~~/server/*', '@@/server/*', '**/server/*', '../../server/*', '../../../server/*', '../../../../server/*'],
              message:
                'Código em app/ não importa de server/. O contrato compartilhado vive em shared/.',
              allowTypeImports: false,
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,ts,vue}'],
    ignores: ['server/services/**', 'server/db/**', 'scripts/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '~~/server/db',
                '~~/server/db/index',
                '@@/server/db',
                '@@/server/db/index',
                '**/server/db',
                '**/server/db/index',
                '../db',
                '../db/index'
              ],
              message:
                'O handle de banco de dados só pode ser importado dentro de server/services/**',
              // Types carry no runtime handle, and from TASK-003 onward the row types are
              // inferred from the Drizzle schema and imported across every layer.
              allowTypeImports: true
            }
          ]
        }
      ]
    }
  }
).prepend({
  ignores: ['legacy/**']
})
