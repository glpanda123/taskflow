// Same guardrails as the API: a forgotten `await` on a network call is the bug that hurts most here.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['eslint.config.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // stdout is the MCP channel: anything printed there breaks the protocol.
      'no-console': ['error', { allow: ['error'] }],
    },
  },
);
