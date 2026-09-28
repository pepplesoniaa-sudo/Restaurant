import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/generated/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/generate-css-variables.js',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The example consumer is plain browser JavaScript, not part of the TypeScript app.
    files: ['consumer/**/*.js'],
    languageOptions: { globals: globals.browser, sourceType: 'module' },
  },
);
