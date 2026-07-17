// ESLint mínimo enfocado en lo que nos importa: la regla
// `react-hooks/rules-of-hooks`, que caza los hooks condicionales que dejaban la
// pantalla en blanco (p.ej. un useCallback dentro de un renderItem/JSX, o un
// hook después de un return temprano). No usamos el plugin general de React
// (incompatible con ESLint nuevo); solo el parser de TS + las reglas de hooks.
const tseslint = require('typescript-eslint')
const reactHooks = require('eslint-plugin-react-hooks')

module.exports = [
  { ignores: ['dist/**', '.expo/**', 'node_modules/**', 'plugins/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, '@typescript-eslint': tseslint.plugin },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]
