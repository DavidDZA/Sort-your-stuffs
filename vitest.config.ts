import { defineConfig } from 'vitest/config';

// Configuration séparée de vite.config.ts : pas besoin du plugin PWA pour les tests.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
