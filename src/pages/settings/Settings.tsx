import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { clearChoices, db, getMeta, requestPersistentStorage } from '../../lib/db';
import { DEFAULT_MIN_VOTES, getIncludeAnime, getMinVotes, getToken, getUserToken, hasBuiltInToken, setIncludeAnime, setMinVotes, setToken, type MinVotes } from '../../lib/settings';
import { syncCatalogue } from '../../lib/sync';
import { isAnimeTitle, tmdb } from '../../lib/tmdb';
import { exportData, importData } from '../../lib/backup';
import { TopBar } from '../../components/common';
import { MyProviders } from './MyProviders';
import { SwipeModeSetting } from './SwipeModeSetting';
import { Account } from './Account';
import { syncAndWait, useCloud } from '../../lib/cloud';

/** `section` : rubrique à afficher directement (« #/settings/catalogue », « #/settings/tmdb »). */
export default function Settings({ section }: { section?: string }) {
  useScrollToSection(section);
  const [token, setTokenInput] = useState(getUserToken() ?? '');
  const [tokenMsg, setTokenMsg] = useState<string | null>(null);
  // Seuils enregistrés (et mis à jour par la synchro tant qu'on ne les a pas modifiés ici).
  const saved = useLiveQuery(getMinVotes);
  const includeAnime = useLiveQuery(getIncludeAnime);
  // Saisie brute (le champ peut être vidé pendant la frappe) ; valeur par défaut remise à la sortie du champ.
  const [votes, setVotes] = useState<Record<keyof MinVotes, string>>({ movie: '', tv: '' });
  const edited = useRef(false);
  useEffect(() => {
    if (saved && !edited.current) setVotes({ movie: String(saved.movie), tv: String(saved.tv) });
  }, [saved?.movie, saved?.tv]);
  const editVotes = (field: keyof MinVotes, value: string) => {
    edited.current = true;
    setVotes((v) => ({ ...v, [field]: value }));
  };
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [clearMsg, setClearMsg] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const signedIn = !!useCloud().user;

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
      const chosen = edited.current ? { movie: minVotes('movie'), tv: minVotes('tv') } : await getMinVotes();
      setVotes({ movie: String(chosen.movie), tv: String(chosen.tv) });
      edited.current = false;
      await setMinVotes(chosen);
      const { movie, tv, removed } = await syncCatalogue(chosen, setSyncMsg);
      setSyncMsg(
        `✓ Terminé : ${movie.toLocaleString('fr-FR')} films et ${tv.toLocaleString('fr-FR')} séries à jour.` +
          (removed ? ` ${removed.toLocaleString('fr-FR')} titres absents du nouveau catalogue supprimés.` : ''),
      );
    } catch (e) {
      setSyncMsg(`✕ ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const toggleAnime = async () => {
    const next = !includeAnime;
    if (!next) {
      // Animes déjà triés : ils partiront à la prochaine mise à jour du catalogue, avec leurs réponses.
      const keys = await db.answers.where('type').equals('tv').primaryKeys();
      const n = (await db.titles.bulkGet(keys)).filter((t) => t && isAnimeTitle(t)).length;
      const where = signedIn ? ', sur tous tes appareils' : '';
      if (n && !confirm(`Tu as déjà trié ${n} anime${n > 1 ? 's' : ''}. À la prochaine mise à jour du catalogue, ${n > 1 ? 'ils seront supprimés' : 'il sera supprimé'} avec tes réponses et tes classements${where}.

Ne plus inclure les animes ?`))
        return;
    }
    await setIncludeAnime(next);
    setSyncMsg(next ? '🎌 Animes inclus : mets à jour le catalogue pour les récupérer.' : 'Animes exclus : ils disparaîtront à la prochaine mise à jour du catalogue.');
  };

  const clear = async () => {
    if (
      !confirm(
        `Êtes-vous sûr ? Tous tes choix (titres vus et pas vus, wishlist, classements, activité) seront définitivement effacés${signedIn ? ', sur cet appareil et sur ton compte (donc sur tous tes appareils)' : ''}. Le catalogue est conservé.\n\nPense à exporter une sauvegarde avant si tu veux pouvoir les récupérer.`,
      )
    )
      return;
    try {
      await clearChoices();
      setClearMsg('✓ Tous tes choix ont été effacés. Le catalogue est intact : tu peux recommencer à swiper.');
      setBackupMsg(null);
    } catch (e) {
      setClearMsg(`✕ ${(e as Error).message}`);
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
      <TopBar title="⚙️ Réglages" />

      <Account />

      <section className="card">
        <h3>💾 Sauvegarde</h3>
        <p className="muted small">
          {signedIn
            ? 'Tes données sont synchronisées avec ton compte. Tu peux quand même en garder une copie dans un fichier.'
            : 'Sans compte, tes données ne sont stockées que dans ce navigateur. Exporte-les régulièrement.'}
        </p>
        <div className="row">
          <button className="btn" onClick={() => exportData()} title="Télécharger un fichier avec tes réponses et classements">
            Exporter
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()} title="Restaurer une sauvegarde (remplace les données actuelles)">
            Importer
          </button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
        </div>
        {backupMsg && <p className="small">{backupMsg}</p>}
      </section>

      <SwipeModeSetting />

      <MyProviders />

      <section className="card" id="catalogue">
        <h3>📦 Catalogue</h3>
        <p className="muted small">
          {info ? `${info.movies.toLocaleString('fr-FR')} films · ${info.series.toLocaleString('fr-FR')} séries` : '…'}
          <br />
          {info?.lastSync ? `Dernière mise à jour : ${new Date(info.lastSync).toLocaleString('fr-FR')}` : 'Jamais téléchargé'}
        </p>
        <p className="muted small">
          Seuls les titres ayant un minimum de votes sur TMDB sont récupérés (pour éviter les titres introuvables). Baisse ces seuils pour en avoir plus. Avec un compte, ils sont les mêmes sur tous tes appareils.
        </p>
        <div className="row">
          <label className="field">
            Films : votes min.
            <input className="input" type="number" min={1} value={votes.movie} onChange={(e) => editVotes('movie', e.target.value)} onBlur={() => resetIfInvalid('movie')} />
          </label>
          <label className="field">
            Séries : votes min.
            <input className="input" type="number" min={1} value={votes.tv} onChange={(e) => editVotes('tv', e.target.value)} onBlur={() => resetIfInvalid('tv')} />
          </label>
        </div>
        <div className="chips">
          <button
            className={`chip ${includeAnime ? 'active' : ''}`}
            onClick={toggleAnime}
            disabled={syncing || includeAnime === undefined}
            title="Ajouter au catalogue les séries d’animation japonaises (les films d’animation sont toujours inclus)"
          >
            🎌 Inclure les animes
          </button>
        </div>
        <button className="btn primary" onClick={sync} disabled={syncing || !getToken()} title="Récupérer les films et séries depuis TMDB (environ 1 minute)">
          {syncing ? 'Mise à jour en cours…' : info?.lastSync ? 'Mettre à jour le catalogue' : 'Télécharger le catalogue'}
        </button>
        {syncMsg && <p className="small">{syncMsg}</p>}
        <p className="muted small">
          Les titres absents du nouveau catalogue sont supprimés, même déjà vus, classés ou ajoutés à la main.
        </p>
      </section>

      <section className="card" id="tmdb">
        <h3>🔑 Clé TMDB</h3>
        <p className="muted small">
          Le « jeton d’accès en lecture » de ton compte themoviedb.org (Paramètres → API). Il reste uniquement dans ce navigateur.
        </p>
        {hasBuiltInToken && (
          <p className="small">✓ Une clé est intégrée au site : rien à saisir. Remplis ce champ seulement pour utiliser une autre clé.</p>
        )}
        <input className="input" type="password" value={token} onChange={(e) => setTokenInput(e.target.value)} placeholder={hasBuiltInToken ? 'Clé intégrée utilisée' : 'eyJhbGciOi…'} autoComplete="off" />
        <button className="btn primary" onClick={saveToken} disabled={!token.trim()} title="Vérifier la clé auprès de TMDB puis l’enregistrer">
          Enregistrer
        </button>
        {tokenMsg && <p className="small">{tokenMsg}</p>}
      </section>

      <section className="card danger-zone">
        <h3>⚠️ Zone dangereuse</h3>
        <p className="muted small">Efface tous tes choix : titres vus et pas vus, wishlist, classements et activité. Le catalogue et ta clé TMDB sont conservés.</p>
        <button className="btn danger" onClick={clear} title="Effacer tous tes choix sans toucher au catalogue (demande confirmation)">
          🗑️ Effacer tous mes choix
        </button>
        {clearMsg && <p className="small">{clearMsg}</p>}
      </section>

      <p className="muted small center">
        Données et affiches fournies par TMDB.
        <br />
        This product uses the TMDB API but is not endorsed or certified by TMDB.
        <br />
        <a href={`${import.meta.env.BASE_URL}confidentialite.html`}>Politique de confidentialité</a>
      </p>
    </main>
  );
}

/**
 * Amène la rubrique `id` en haut de l'écran. Les rubriques au-dessus (abonnements…) se chargent après coup
 * et changent de hauteur : on recale pendant 2 s, sauf si l'utilisateur fait défiler la page lui-même.
 */
function useScrollToSection(id: string | undefined) {
  useEffect(() => {
    const el = id && document.getElementById(id);
    if (!el) return;
    let active = true;
    const go = () => active && el.scrollIntoView({ block: 'start' });
    const stop = () => {
      active = false;
      observer.disconnect();
    };
    const observer = new ResizeObserver(go);
    observer.observe(el.parentElement!);
    const frame = requestAnimationFrame(go); // après le retour en haut fait au changement de page
    const timer = setTimeout(stop, 2000);
    const events = ['wheel', 'touchstart', 'keydown'] as const;
    events.forEach((e) => addEventListener(e, stop, { once: true, passive: true }));
    return () => {
      stop();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      events.forEach((e) => removeEventListener(e, stop));
    };
  }, [id]);
}
