import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/.next/**', '**/e2e/**', '**/*.spec.ts'],
    include: ['**/*.test.ts', '**/*.test.tsx'],
    passWithNoTests: true,
  },
});
