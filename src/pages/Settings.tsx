import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getMeta, requestPersistentStorage } from '../db';
import { getMinVotes, getToken, setMinVotes, setToken, type MinVotes } from '../settings';
import { syncCatalogue } from '../sync';
import { tmdb } from '../tmdb';
import { exportData, importData } from '../backup';
import { TopBar } from '../components/common';

export default function Settings() {
  const [token, setTokenInput] = useState(getToken() ?? '');
  const [tokenMsg, setTokenMsg] = useState<string | null>(null);
  const [votes, setVotes] = useState<MinVotes>(getMinVotes());
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const info = useLiveQuery(async () => ({
    movies: await db.titles.where('type').equals('movie').count(),
    series: await db.titles.where('type').equals('tv').count(),
    lastSync: await getMeta<number | null>('lastSync', null),
  }));

  const saveToken = async () => {
    setTokenMsg('Vérification…');
    try {
      await tmdb('/authentication', {}, token.trim());
      setToken(token);
      setTokenMsg('✓ Clé valide et enregistrée.');
    } catch (e) {
      setTokenMsg(`✕ ${(e as Error).message}`);
    }
  };

  const sync = async () => {
    setMinVotes(votes);
    setSyncing(true);
    setSyncMsg('Démarrage…');
    await requestPersistentStorage();
    try {
      const { movie, tv } = await syncCatalogue(votes, setSyncMsg);
      setSyncMsg(`✓ Terminé : ${movie.toLocaleString('fr-FR')} films et ${tv.toLocaleString('fr-FR')} séries à jour.`);
    } catch (e) {
      setSyncMsg(`✕ ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    if (!confirm('Remplacer toutes tes réponses et classements actuels par cette sauvegarde ?')) return;
    try {
      const n = await importData(file);
      setBackupMsg(`✓ ${n} réponses restaurées.`);
    } catch (e) {
      setBackupMsg(`✕ ${(e as Error).message}`);
    }
  };

  return (
    <main className="page">
      <TopBar title="Réglages" />

      <section className="card">
        <h3>Clé TMDB</h3>
        <p className="muted small">
          Le « jeton d’accès en lecture » de ton compte themoviedb.org (Paramètres → API). Il reste uniquement dans ce navigateur.
        </p>
        <input className="input" type="password" value={token} onChange={(e) => setTokenInput(e.target.value)} placeholder="eyJhbGciOi…" autoComplete="off" />
        <button className="btn primary" onClick={saveToken} disabled={!token.trim()}>
          Enregistrer
        </button>
        {tokenMsg && <p className="small">{tokenMsg}</p>}
      </section>

      <section className="card">
        <h3>Catalogue</h3>
        <p className="muted small">
          {info ? `${info.movies.toLocaleString('fr-FR')} films · ${info.series.toLocaleString('fr-FR')} séries` : '…'}
          <br />
          {info?.lastSync ? `Dernière mise à jour : ${new Date(info.lastSync).toLocaleString('fr-FR')}` : 'Jamais téléchargé'}
        </p>
        <p className="muted small">
          Seuls les titres ayant un minimum de votes sur TMDB sont récupérés (pour éviter les titres introuvables). Baisse ces seuils pour en avoir plus.
        </p>
        <div className="row">
          <label className="field">
            Films : votes min.
            <input className="input" type="number" min={1} value={votes.movie} onChange={(e) => setVotes({ ...votes, movie: Number(e.target.value) || 1 })} />
          </label>
          <label className="field">
            Séries : votes min.
            <input className="input" type="number" min={1} value={votes.tv} onChange={(e) => setVotes({ ...votes, tv: Number(e.target.value) || 1 })} />
          </label>
        </div>
        <button className="btn primary" onClick={sync} disabled={syncing || !getToken()}>
          {syncing ? 'Mise à jour en cours…' : info?.lastSync ? 'Mettre à jour le catalogue' : 'Télécharger le catalogue'}
        </button>
        {syncMsg && <p className="small">{syncMsg}</p>}
        <p className="muted small">La mise à jour ne touche jamais à tes réponses ni à tes classements.</p>
      </section>

      <section className="card">
        <h3>Sauvegarde</h3>
        <p className="muted small">Tes données ne sont stockées que dans ce navigateur. Exporte-les régulièrement.</p>
        <div className="row">
          <button className="btn" onClick={() => exportData()}>
            Exporter
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()}>
            Importer
          </button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
        </div>
        {backupMsg && <p className="small">{backupMsg}</p>}
      </section>

      <p className="muted small center">
        Données et affiches fournies par TMDB.
        <br />
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </main>
  );
}
