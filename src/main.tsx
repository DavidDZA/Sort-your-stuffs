import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/fredoka';
import App from './App';
import { startCloud } from './lib/cloud';
import { migrateMinVotes } from './lib/settings';
import './styles/index.css';

registerSW({ immediate: true });
migrateMinVotes().finally(startCloud);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
