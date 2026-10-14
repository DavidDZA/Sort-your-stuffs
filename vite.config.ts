import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH vaut "/Sort-your-stuffs/" sur GitHub Pages, "/" en local.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Sort my stuffs',
        short_name: 'Sort my stuffs',
        description: 'Trier les films et séries que tu as vus.',
        lang: 'fr',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#12121a',
        theme_color: '#12121a',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            // Les affiches sont gardées en cache pour un affichage rapide et hors ligne.
            urlPattern: /^https:\/\/image\.tmdb\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'posters',
              expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
