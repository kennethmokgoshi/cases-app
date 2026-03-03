import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exclude Playwright e2e tests from Vitest
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/*.spec.ts', // Playwright uses .spec.ts
      '**/playwright-report/**',
      '**/test-results/**',
    ],
    // Include only unit/integration tests
    include: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/__tests__/**/*.ts',
      '**/__tests__/**/*.tsx',
    ],
    // Don't fail if no tests found
    passWithNoTests: true,
  },
});
