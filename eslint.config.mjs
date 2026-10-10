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

// HTML sinks banned in scripts and templates. Each one is matched in dot form and in computed form
// (`el['innerHTML']`, `` el[`outerHTML`] ``), because both are the same write. Reads are not banned, as before.
const HTML_SINK_MESSAGE = 'Do not write innerHTML or outerHTML. Reviews are plain text and v-html is banned (CLAUDE.md, Security). Use textContent or Vue interpolation.'
const HTML_SINKS = [
  {
    selector: 'AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]',
    message: HTML_SINK_MESSAGE,
  },
  {
    selector: 'AssignmentExpression > MemberExpression.left[computed=true][property.value=/^(innerHTML|outerHTML)$/]',
    message: HTML_SINK_MESSAGE,
  },
  {
    selector: 'AssignmentExpression > MemberExpression.left[computed=true][property.quasis.0.value.raw=/^(innerHTML|outerHTML)$/]',
    message: HTML_SINK_MESSAGE,
  },
  {
    // Any reference, not only a call, so `const f = el['insertAdjacentHTML']; f.call(...)` is caught too.
    selector: 'MemberExpression[property.name="insertAdjacentHTML"]',
    message: 'Do not use insertAdjacentHTML. Reviews are plain text and v-html is banned (CLAUDE.md, Security). Use textContent or Vue interpolation.',
  },
  {
    selector: 'MemberExpression[computed=true][property.value="insertAdjacentHTML"]',
    message: 'Do not use insertAdjacentHTML. Reviews are plain text and v-html is banned (CLAUDE.md, Security). Use textContent or Vue interpolation.',
  },
  {
    selector: 'MemberExpression[computed=true][property.quasis.0.value.raw="insertAdjacentHTML"]',
    message: 'Do not use insertAdjacentHTML. Reviews are plain text and v-html is banned (CLAUDE.md, Security). Use textContent or Vue interpolation.',
  },
  {
    // Covers h() props, domProps and Object.assign(el, { outerHTML: x }).
    selector: 'Property:matches([key.name=/^(innerHTML|outerHTML)$/], [key.value=/^(innerHTML|outerHTML)$/])',
    message: 'Do not pass innerHTML or outerHTML as a property (h() props, domProps, Object.assign). Reviews are plain text and v-html is banned (CLAUDE.md, Security). Use text children.',
  },
  {
    selector: 'CallExpression[callee.object.name="Reflect"][callee.property.name="set"][arguments.1.value=/^(innerHTML|outerHTML)$/]',
    message: HTML_SINK_MESSAGE,
  },
  {
    selector: 'CallExpression[callee.object.name="Reflect"][callee.property.name="set"][arguments.1.quasis.0.value.raw=/^(innerHTML|outerHTML)$/]',
    message: HTML_SINK_MESSAGE,
  },
]

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
    // Template bindings: the same sinks as scripts, plus the dashed and v-bind-object forms that Vue
    // normalises to innerHTML. Tests are excluded, as in the script block below.
    files: ['**/*.vue'],
    ignores: ['tests/**'],
    rules: {
      'vue/no-restricted-v-bind': ['error', {
        argument: '/^(innerHTML|outerHTML|inner-html|outer-html|inner-h-t-m-l|outer-h-t-m-l)$/',
        message: HTML_SINK_MESSAGE,
      }],
      'vue/no-restricted-syntax': ['error', ...HTML_SINKS],
    },
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
      'no-restricted-syntax': ['error', ...HTML_SINKS],
    },
  },
).prepend({
  ignores: ['legacy/**']
})
