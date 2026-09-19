import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    files: ['**/*.vue'],
    rules: {
      'vue/no-v-html': 'error'
    }
  },
  {
    files: ['**/*.{js,mjs,ts,vue}'],
    ignores: ['server/services/**', 'server/db/**'],
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
