import { defineConfig } from '@playwright/test';

/**
 * Tests de bout en bout (npm run e2e) : l'appli construite, ouverte dans le Chrome installé,
 * au format téléphone (tactile) et PC. Les tests sur le vrai projet Supabase (marqués @live : comptes créés puis supprimés) ne tournent qu'avec npm run e2e:live.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 2,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', channel: 'chrome', locale: 'fr-FR' },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: 'téléphone', use: { viewport: { width: 393, height: 760 }, isMobile: true, hasTouch: true } },
    { name: 'pc', use: { viewport: { width: 1280, height: 860 } } },
  ],
});
