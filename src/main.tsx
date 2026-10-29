import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/fredoka';
import App from './App';
import { startCloud } from './lib/cloud';
import { migrateMinVotes } from './lib/settings';
import { splitAnimeRankings } from './lib/ranking';
import './styles/index.css';

registerSW({ immediate: true });

// Avant l'affichage : seuils repris de l'ancien stockage, animes sortis des classements de séries.
Promise.allSettled([migrateMinVotes(), splitAnimeRankings()]).finally(() => {
  startCloud();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
