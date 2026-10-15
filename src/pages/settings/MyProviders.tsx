import { useEffect, useState } from 'react';
import { getMyProviders, getToken, setMyProviders } from '../../lib/settings';
import { fetchProviderOptions, providerLogo, type ProviderOption } from '../../lib/tmdb';

/** Choix des plateformes auxquelles on est abonné (pour filtrer la wishlist). */
export function MyProviders() {
  const [options, setOptions] = useState<ProviderOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<number[]>(getMyProviders());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!getToken()) return;
    fetchProviderOptions()
      .then(setOptions)
      .catch((e) => setError((e as Error).message));
  }, []);

  const toggle = (id: number) => {
    const next = mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id];
    setMine(next);
    setMyProviders(next);
  };

  const shown = options && (showAll ? options : options.filter((o, i) => i < 16 || mine.includes(o.id)));

  return (
    <section className="card">
      <h3>📺 Mes abonnements</h3>
      <p className="muted small">Coche tes plateformes : la wishlist pourra n’afficher que ce qui est dispo chez toi.</p>
      {error && <p className="error small">{error}</p>}
      {!getToken() && <p className="muted small">Renseigne d’abord ta clé TMDB.</p>}
      {getToken() && !options && !error && <p className="muted small">Chargement…</p>}
      {shown && (
        <div className="provider-picker">
          {shown.map((p) => (
            <button
              key={p.id}
              className={`provider-option ${mine.includes(p.id) ? 'active' : ''}`}
              onClick={() => toggle(p.id)}
              title={mine.includes(p.id) ? `Retirer ${p.name}` : `Je suis abonné à ${p.name}`}
            >
              {p.logo && <img src={providerLogo(p.logo) ?? ''} alt="" />}
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      )}
      {options && options.length > 16 && (
        <button className="btn small" onClick={() => setShowAll((v) => !v)} title="Afficher toutes les plateformes disponibles en France">
          {showAll ? 'Moins de plateformes' : `Toutes les plateformes (${options.length})`}
        </button>
      )}
    </section>
  );
}
