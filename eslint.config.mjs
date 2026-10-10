import withNuxt from './.nuxt/eslint.config.mjs'

// app/ must not reach the server layer, and nothing outside server/services/** may import the db handle.
// Both lists apply to app/**, so the general db block below excludes app/** to keep its options from replacing these.
const SERVER_IMPORT_PATTERN = {
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
}

const DB_IMPORT_PATTERN = {
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
          patterns: [SERVER_IMPORT_PATTERN, DB_IMPORT_PATTERN],
        },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,ts,vue}'],
    ignores: ['server/services/**', 'server/db/**', 'scripts/**', 'app/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [DB_IMPORT_PATTERN]
        }
      ]
    }
  },
  {
    // Reviews are plain text and v-html is banned (CLAUDE.md, Security). Scripts must not inject HTML either.
    // Tests reset the DOM with innerHTML and build their own fixtures, so they are not covered.
    files: ['**/*.{ts,js,mjs,vue}'],
    ignores: ['tests/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]',
          message: 'Do not assign innerHTML or outerHTML. Reviews are plain text and v-html is banned (CLAUDE.md, Security). Use textContent or Vue interpolation.',
        },
        {
          selector: 'CallExpression[callee.property.name="insertAdjacentHTML"]',
          message: 'Do not call insertAdjacentHTML. Reviews are plain text and v-html is banned (CLAUDE.md, Security). Use textContent or Vue interpolation.',
        },
        {
          selector: 'Property:matches([key.name="innerHTML"], [key.value="innerHTML"])',
          message: 'Do not pass innerHTML as a property (h() props, domProps). Reviews are plain text and v-html is banned (CLAUDE.md, Security). Use text children.',
        },
      ],
    },
  },
).prepend({
  ignores: ['legacy/**']
})
