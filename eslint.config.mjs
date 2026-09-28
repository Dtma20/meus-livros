import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['**/*.vue'],
    rules: {
      'vue/no-v-html': 'error'
    }
  },
  {
    files: ['app/**/*.{js,mjs,ts,vue}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '~~/server/*',
                '~/server/*',
                '@@/server/*',
                '@/server/*',
                '**/server/*',
                '../../server/*',
                '../../../server/*',
                '../../../../server/*',
              ],
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
                '~/server/db',
                '~/server/db/index',
                '@@/server/db',
                '@@/server/db/index',
                '@/server/db',
                '@/server/db/index',
                '**/server/db',
                '**/server/db/index',
                '../db',
                '../db/index',
                '../../db',
                '../../db/index',
                '../../../db',
                '../../../db/index',
              ],
              message:
                'O handle de banco de dados só pode ser importado dentro de server/services/**',
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
