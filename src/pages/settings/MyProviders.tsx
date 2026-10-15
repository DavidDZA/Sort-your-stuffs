import { useEffect, useState } from 'react';
import { getMyProviderFamilies, getMyProviders, getToken, setMyProviderFamilies, setMyProviders } from '../../lib/settings';
import { fetchProviderOptions, providerLogo } from '../../lib/tmdb';
import { groupProviders, type ProviderGroup } from '../../lib/providers';

const VISIBLE = 16;

/**
 * Choix des plateformes auxquelles on est abonné (pour filtrer la wishlist et « Ce soir »).
 * Une case par plateforme : ses variantes (offre avec pub, via Amazon / Apple…) sont incluses.
 */
export function MyProviders() {
  const [groups, setGroups] = useState<ProviderGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<string[]>(getMyProviderFamilies());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!getToken()) return;
    fetchProviderOptions()
      .then((options) => {
        const grouped = groupProviders(options);
        setGroups(grouped);
        // Ancien format (identifiants) : converti une fois en familles.
        const legacy = getMyProviders();
        if (legacy.length) {
          const converted = grouped.filter((g) => g.ids.some((id) => legacy.includes(id))).map((g) => g.key);
          const next = [...new Set([...getMyProviderFamilies(), ...converted])];
          setMyProviderFamilies(next);
          setMyProviders([]);
          setMine(next);
        }
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const toggle = (key: string) => {
    const next = mine.includes(key) ? mine.filter((x) => x !== key) : [...mine, key];
    setMine(next);
    setMyProviderFamilies(next);
  };

  const shown = groups && (showAll ? groups : groups.filter((g, i) => i < VISIBLE || mine.includes(g.key)));

  return (
    <section className="card">
      <h3>📺 Mes abonnements</h3>
      <p className="muted small">Coche tes plateformes : la wishlist pourra n’afficher que ce qui est dispo chez toi.</p>
      {error && <p className="error small">{error}</p>}
      {!getToken() && <p className="muted small">Renseigne d’abord ta clé TMDB.</p>}
      {getToken() && !groups && !error && <p className="muted small">Chargement…</p>}
      {shown && (
        <div className="provider-picker">
          {shown.map((g) => {
            const active = mine.includes(g.key);
            const variants = g.names.length > 1 ? ` (inclut : ${g.names.filter((n) => n !== g.label).join(', ')})` : '';
            return (
              <button
                key={g.key}
                className={`provider-option ${active ? 'active' : ''}`}
                onClick={() => toggle(g.key)}
                title={`${active ? `Retirer ${g.label}` : `Je suis abonné à ${g.label}`}${variants}`}
              >
                {g.logo && <img src={providerLogo(g.logo) ?? ''} alt="" />}
                <span>{g.label}</span>
              </button>
            );
          })}
        </div>
      )}
      {groups && groups.length > VISIBLE && (
        <button className="btn small" onClick={() => setShowAll((v) => !v)} title="Afficher toutes les plateformes disponibles en France">
          {showAll ? 'Moins de plateformes' : `Toutes les plateformes (${groups.length})`}
        </button>
      )}
    </section>
  );
}
