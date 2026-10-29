import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getMeta, requestPersistentStorage } from '../../lib/db';
import { DEFAULT_MIN_VOTES, getMinVotes, getShowAnime, getToken, setMinVotes, setShowAnime, type MinVotes } from '../../lib/settings';
import { OLD_MOVIES_BEFORE, syncCatalogue } from '../../lib/sync';
import { isAnimeTitle } from '../../lib/category';
import { syncAndWait } from '../../lib/cloud';

const VOTE_KEYS = Object.keys(DEFAULT_MIN_VOTES) as (keyof MinVotes)[];
const asText = (v: MinVotes) => Object.fromEntries(VOTE_KEYS.map((k) => [k, String(v[k])])) as Record<keyof MinVotes, string>;

/** Champs des seuils, par ligne : un titre est gardé s'il passe l'un des seuils qui le concernent. */
const VOTE_ROWS: { title: string; fields: [keyof MinVotes, string][] }[] = [
  { title: 'Votes minimum :', fields: [['movie', '🎬 Films'], ['tv', '📺 Séries'], ['anime', '🎌 Animes']] },
  { title: '🇫🇷 Titres en français (langue originale) :', fields: [['frMovie', '🎬 Films'], ['frTv', '📺 Séries']] },
  { title: `🎞️ Films sortis avant ${OLD_MOVIES_BEFORE} :`, fields: [['oldMovie', '🎬 Films']] },
];

/** Réglages → Catalogue : seuils de votes, catégorie Animes, téléchargement depuis TMDB. */
export function CatalogueSetting() {
  // Seuils enregistrés (et mis à jour par la synchro tant qu'on ne les a pas modifiés ici).
  const saved = useLiveQuery(getMinVotes);
  const showAnime = useLiveQuery(getShowAnime);
  // Saisie brute (le champ peut être vidé pendant la frappe) ; valeur par défaut remise à la sortie du champ.
  const [votes, setVotes] = useState<Record<keyof MinVotes, string>>(() => asText(DEFAULT_MIN_VOTES));
  const edited = useRef(false);
  useEffect(() => {
    if (saved && !edited.current) setVotes(asText(saved));
  }, [saved && JSON.stringify(saved)]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const info = useLiveQuery(async () => ({
    movies: await db.titles.where('type').equals('movie').count(),
    series: await db.titles.where('type').equals('tv').count(),
    animes: await db.titles.where('type').equals('tv').filter(isAnimeTitle).count(),
    lastSync: await getMeta<number | null>('lastSync', null),
  }));

  const editVotes = (field: keyof MinVotes, value: string) => {
    edited.current = true;
    setVotes((v) => ({ ...v, [field]: value }));
  };
  const minVotes = (field: keyof MinVotes) => {
    const n = Math.floor(Number(votes[field]));
    return votes[field].trim() !== '' && n >= 1 ? n : DEFAULT_MIN_VOTES[field];
  };
  const resetIfInvalid = (field: keyof MinVotes) => setVotes((v) => ({ ...v, [field]: String(minVotes(field)) }));

  const sync = async () => {
    setSyncing(true);
    setSyncMsg('Démarrage…');
    await requestPersistentStorage();
    try {
      // Sans saisie ici : les seuils du compte, à jour (ceux d'un autre appareil ont pu changer).
      if (!edited.current) await syncAndWait();
      const chosen = edited.current ? (Object.fromEntries(VOTE_KEYS.map((k) => [k, minVotes(k)])) as unknown as MinVotes) : await getMinVotes();
      setVotes(asText(chosen));
      edited.current = false;
      await setMinVotes(chosen);
      const { movie, tv, anime, removed } = await syncCatalogue(chosen, setSyncMsg);
      const n = (x: number) => x.toLocaleString('fr-FR');
      setSyncMsg(
        `✓ Terminé : ${n(movie)} films, ${n(tv)} séries et ${n(anime)} animes à jour.` +
          (removed ? ` ${removed.toLocaleString('fr-FR')} titres absents du nouveau catalogue supprimés.` : ''),
      );
    } catch (e) {
      setSyncMsg(`✕ ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const toggleShowAnime = () => {
    if (showAnime === undefined) return;
    setShowAnime(!showAnime);
    setSyncMsg(showAnime ? 'Catégorie Animes masquée : les animes restent au catalogue, sans apparaître dans les séries.' : '🎌 Catégorie Animes affichée.');
  };

  return (
    <section className="card" id="catalogue">
      <h3>📦 Catalogue</h3>
      <p className="muted small">
        {info ? `${info.movies.toLocaleString('fr-FR')} films · ${(info.series - info.animes).toLocaleString('fr-FR')} séries · ${info.animes.toLocaleString('fr-FR')} animes` : '…'}
        <br />
        {info?.lastSync ? `Dernière mise à jour : ${new Date(info.lastSync).toLocaleString('fr-FR')}` : 'Jamais téléchargé'}
      </p>
      <p className="muted small">
        Seuls les titres ayant un minimum de votes sur TMDB sont récupérés (pour éviter les titres introuvables). Baisse ces seuils pour en avoir plus. Les titres en français et les vieux films ont moins de votes : ils ont leur propre seuil, plus bas. Avec un compte, ils sont les mêmes sur tous tes appareils.
      </p>
      {VOTE_ROWS.map((row) => (
        <div key={row.title} className="vote-row">
          <p className="small">{row.title}</p>
          <div className="row">
            {row.fields.map(([key, label]) => (
              <label key={key} className="field">
                {label}
                <input className="input" type="number" min={1} value={votes[key]} onChange={(e) => editVotes(key, e.target.value)} onBlur={() => resetIfInvalid(key)} />
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="chips">
        <button
          className={`chip ${showAnime ? 'active' : ''}`}
          onClick={toggleShowAnime}
          disabled={showAnime === undefined}
          title="Afficher les tuiles et onglets Animes (séries d’animation japonaises). Masquée, la catégorie reste au catalogue."
        >
          🎌 Afficher la catégorie Animes
        </button>
      </div>
      <button className="btn primary" onClick={sync} disabled={syncing || !getToken()} title="Récupérer les films et séries depuis TMDB (environ 1 minute)">
        {syncing ? 'Mise à jour en cours…' : info?.lastSync ? 'Mettre à jour le catalogue' : 'Télécharger le catalogue'}
      </button>
      {syncMsg && <p className="small">{syncMsg}</p>}
      <p className="muted small">Les titres absents du nouveau catalogue sont retirés, sauf ceux que tu as vus ou mis dans ta wishlist : eux restent, avec leur place dans tes classements.</p>
    </section>
  );
}
