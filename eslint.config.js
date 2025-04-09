import typescriptParser from '@typescript-eslint/parser';
import typescriptPlugin from '@typescript-eslint/eslint-plugin';
import prettierPlugin from 'eslint-plugin-prettier';

export default [
  {
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2020
      },
      globals: {
        node: true,
        es6: true
      }
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin,
      prettier: prettierPlugin
    },
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off'
    }
  },
  {
    files: ['**/*.ts'],
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended']
  }
];
