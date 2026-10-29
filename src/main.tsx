import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/fredoka';
import App from './App';
import { startCloud } from './lib/cloud';
import { liveQuery } from 'dexie';
import { getIncludeAnime, migrateMinVotes } from './lib/settings';
import { setAnimeIncluded } from './lib/tmdb';
import './styles/index.css';

registerSW({ immediate: true });
migrateMinVotes().finally(startCloud);
// Réglage « Inclure les animes », suivi en direct (modifié ici ou reçu d'un autre appareil).
liveQuery(getIncludeAnime).subscribe({ next: setAnimeIncluded, error: () => undefined });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
