import { useState } from 'react';
import { clearChoices } from '../../lib/db';
import { useCloud } from '../../lib/cloud';

/** Réglages → Zone dangereuse : effacer tous ses choix (pas le catalogue). */
export function DangerZone() {
  const [msg, setMsg] = useState<string | null>(null);
  const signedIn = !!useCloud().user;

  const clear = async () => {
    if (
      !confirm(
        `Êtes-vous sûr ? Tous tes choix (titres vus et pas vus, wishlist, classements, activité) seront définitivement effacés${signedIn ? ', sur cet appareil et sur ton compte (donc sur tous tes appareils)' : ''}. Le catalogue est conservé.\n\nPense à exporter une sauvegarde avant si tu veux pouvoir les récupérer.`,
      )
    )
      return;
    try {
      await clearChoices();
      setMsg('✓ Tous tes choix ont été effacés. Le catalogue est intact : tu peux recommencer à swiper.');
    } catch (e) {
      setMsg(`✕ ${(e as Error).message}`);
    }
  };

  return (
    <section className="card danger-zone">
      <h3>⚠️ Zone dangereuse</h3>
      <p className="muted small">Efface tous tes choix : titres vus et pas vus, wishlist, classements et activité. Le catalogue et ta clé TMDB sont conservés.</p>
      <button className="btn danger" onClick={clear} title="Effacer tous tes choix sans toucher au catalogue (demande confirmation)">
        🗑️ Effacer tous mes choix
      </button>
      {msg && <p className="small">{msg}</p>}
    </section>
  );
}
