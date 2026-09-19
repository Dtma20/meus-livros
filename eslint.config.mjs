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
