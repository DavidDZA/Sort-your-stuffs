import { useState } from 'react';
import { getUserToken, hasBuiltInToken, setToken } from '../../lib/settings';
import { tmdb } from '../../lib/tmdb';

/** Réglages → Clé TMDB : une clé personnelle, prioritaire sur celle intégrée au site. */
export function TokenSetting() {
  const [token, setTokenInput] = useState(getUserToken() ?? '');
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setMsg('Vérification…');
    try {
      await tmdb('/authentication', {}, token.trim());
      setToken(token);
      setMsg('✓ Clé valide et enregistrée.');
    } catch (e) {
      setMsg(`✕ ${(e as Error).message}`);
    }
  };

  return (
    <section className="card" id="tmdb">
      <h3>🔑 Clé TMDB</h3>
      <p className="muted small">Le « jeton d’accès en lecture » de ton compte themoviedb.org (Paramètres → API). Il reste uniquement dans ce navigateur.</p>
      {hasBuiltInToken && <p className="small">✓ Une clé est intégrée au site : rien à saisir. Remplis ce champ seulement pour utiliser une autre clé.</p>}
      <input className="input" type="password" value={token} onChange={(e) => setTokenInput(e.target.value)} placeholder={hasBuiltInToken ? 'Clé intégrée utilisée' : 'eyJhbGciOi…'} autoComplete="off" />
      <button className="btn primary" onClick={save} disabled={!token.trim()} title="Vérifier la clé auprès de TMDB puis l’enregistrer">
        Enregistrer
      </button>
      {msg && <p className="small">{msg}</p>}
    </section>
  );
}
