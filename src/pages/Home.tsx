import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getMeta } from '../lib/db';
import { keysOfCategory, mediaOf, useCategories, type Category } from '../lib/category';
import { readRanking } from '../lib/ranking';
import { getToken } from '../lib/settings';
import { loadActivity, streak, todayCount } from '../lib/activity';
import { exportData } from '../lib/backup';
import { BADGES } from '../lib/badges';
import { pick, toast } from '../lib/fun';
import { useIsDesktop } from '../lib/hooks';
import { loadCatalogue } from './swipe/pool';
import { useCloud } from '../lib/cloud';
import { cloudEnabled } from '../lib/supabase';

const fmt = (n: number) => Math.max(0, n).toLocaleString('fr-FR');
const DAY = 86_400_000;
const daysAgo = (t: number) => Math.floor((Date.now() - t) / DAY);
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

const TAGLINES = [
  'Popcorn prêt ? 🍿',
  '5 minutes, et ta base grandit 🌱',
  'Qu’est-ce qu’on trie aujourd’hui ?',
  'Un petit swipe pour la route ? 🎬',
  'Ta mémoire de cinéphile, en ordre ✨',
];

/** Accueil : format complet sur PC, compact sur téléphone. */
export default function Home() {
  // Précharge le catalogue pendant qu'on est sur l'accueil : le swipe s'ouvre ensuite sans attendre.
  useEffect(() => {
    const timer = setTimeout(() => {
      loadCatalogue('movie')
        .then(() => loadCatalogue('tv'))
        .then(() => loadCatalogue('anime'))
        .catch(() => undefined);
    }, 500);
    return () => clearTimeout(timer);
  }, []);
  const [tagline] = useState(() => pick(TAGLINES));
  const desktop = useIsDesktop();
  const cloud = useCloud();
  const showAnime = useCategories().includes('anime');
  const stats = useLiveQuery(async () => {
    const byType = async (type: Category) => {
      const media = mediaOf(type);
      const [catalogue, answeredKeys, seenKeys, ranking] = await Promise.all([
        loadCatalogue(type),
        db.answers.where('type').equals(media).primaryKeys(),
        db.answers.where('[type+status]').equals([media, 'seen']).primaryKeys(),
        readRanking({ type, list: 'seen' }),
      ]);
      const [answered, seen] = await Promise.all([keysOfCategory(type, answeredKeys), keysOfCategory(type, seenKeys)]);
      const total = catalogue.length;
      return {
        total,
        answered: answered.length,
        toSwipe: Math.max(0, total - answered.length),
        seen: seen.length,
        ranked: ranking.length,
        unranked: seen.length - ranking.length,
      };
    };
    const [movie, tv, anime, wish, activity, lastSync, lastExport, badges] = await Promise.all([
      byType('movie'),
      byType('tv'),
      byType('anime'),
      db.answers.where('status').equals('wish').count(),
      loadActivity(),
      getMeta<number | null>('lastSync', null),
      getMeta<number | null>('lastExport', null),
      getMeta<string[]>('badges', []),
    ]);
    return { movie, tv, anime, wish, today: todayCount(activity), streak: streak(activity), lastSync, lastExport, badges: badges.length };
  });

  const noToken = !getToken();
  const emptyCatalogue = stats && stats.movie.total + stats.tv.total + stats.anime.total === 0;
  const answered = stats ? stats.movie.answered + stats.tv.answered + stats.anime.answered : 0;
  // Avec un compte, les données sont synchronisées : plus de rappel de sauvegarde.
  const backupDue = !cloud.user && stats && answered >= 20 && (!stats.lastExport || daysAgo(stats.lastExport) >= 14);
  const catalogueOld = stats?.lastSync && daysAgo(stats.lastSync) >= 30;

  const backupNow = async () => {
    await exportData();
    toast('💾 Sauvegarde téléchargée !');
  };

  return (
    <main className="page">
      <header className="home-header">
        <img className="logo" src={`${import.meta.env.BASE_URL}icons/favicon.svg`} alt="" />
        <div className="home-title">
          <h1>Sort my stuffs</h1>
          <p className="tagline">{tagline}</p>
        </div>
        {cloud.user && (
          <a className="icon-btn" href="#/friends" aria-label="Amis" title="Amis : wishlist commune, conseils, compatibilité">
            👥
          </a>
        )}
        <a className="icon-btn" href="#/settings" aria-label="Réglages" title="Réglages : clé TMDB, abonnements, catalogue, sauvegarde">
          ⚙️
        </a>
      </header>

      {(noToken || emptyCatalogue) && (
        <a className="banner" href={noToken ? '#/settings/tmdb' : '#/settings/catalogue'}>
          {noToken ? '🔑 Commence par renseigner ta clé TMDB dans les réglages →' : '📦 Télécharge le catalogue des films et séries →'}
        </a>
      )}

      {cloudEnabled && cloud.ready && !cloud.user && (
        <a className="banner-soft row-banner" href="#/settings" title="Se connecter ou créer un compte (Google ou e-mail)">
          <span>{desktop ? '☁️ Connecte-toi pour retrouver tes titres sur tous tes appareils et comparer avec tes amis' : '☁️ Connecte-toi : synchro et amis'}</span>
          <span className="btn small primary">Se connecter</span>
        </a>
      )}

      {backupDue && (
        <div className="banner-soft row-banner">
          <span>
            💾{' '}
            {desktop
              ? stats.lastExport
                ? `Dernière sauvegarde il y a ${daysAgo(stats.lastExport)} jours`
                : 'Aucune sauvegarde pour l’instant'
              : stats.lastExport
                ? `Sauvegarde il y a ${daysAgo(stats.lastExport)} j`
                : 'Pas encore de sauvegarde'}
          </span>
          <button className="btn small primary" onClick={backupNow} title="Télécharger une sauvegarde de tes données">
            Exporter
          </button>
        </div>
      )}

      {catalogueOld && (
        <a className="banner-soft row-banner" href="#/settings/catalogue" title="Récupérer les nouveaux films et séries">
          <span>{desktop ? `🔄 Catalogue mis à jour il y a ${daysAgo(stats.lastSync!)} jours` : `🔄 Catalogue vieux de ${daysAgo(stats.lastSync!)} j`}</span>
          <span className="btn small">Mettre à jour</span>
        </a>
      )}

      {stats && !emptyCatalogue && <Activity today={stats.today} streak={stats.streak} desktop={desktop} />}

      {stats && stats.wish > 0 && <TonightButton desktop={desktop} />}

      <div className="tiles">
        <Tile
          color="pink"
          href="#/swipe/movie"
          icon="🎬"
          label="Swiper les films"
          tip="Dire si tu as vu des films, un par un"
          sub={stats && `${fmt(stats.movie.toSwipe)} à découvrir`}
          progress={stats && ratio(stats.movie.answered, stats.movie.total)}
        />
        <Tile
          color="orange"
          href="#/swipe/tv"
          icon="📺"
          label="Swiper les séries"
          tip="Dire si tu as vu des séries, une par une"
          sub={stats && `${fmt(stats.tv.toSwipe)} à découvrir`}
          progress={stats && ratio(stats.tv.answered, stats.tv.total)}
        />
        <Tile
          color="violet"
          href="#/rank/movie"
          icon="🏆"
          label="Classer les films"
          tip="Classer les films vus par duels"
          sub={stats && `${fmt(stats.movie.unranked)} non classés`}
          progress={stats && ratio(stats.movie.ranked, stats.movie.seen)}
        />
        <Tile
          color="cyan"
          href="#/rank/tv"
          icon="🥇"
          label="Classer les séries"
          tip="Classer les séries vues par duels"
          sub={stats && `${fmt(stats.tv.unranked)} non classées`}
          progress={stats && ratio(stats.tv.ranked, stats.tv.seen)}
        />
        {showAnime && (
          <>
            <Tile
              color="coral"
              href="#/swipe/anime"
              icon="🎌"
              label="Swiper les animes"
              tip="Dire si tu as vu des animes (séries d’animation japonaises), un par un"
              sub={stats && `${fmt(stats.anime.toSwipe)} à découvrir`}
              progress={stats && ratio(stats.anime.answered, stats.anime.total)}
            />
            <Tile
              color="teal"
              href="#/rank/anime"
              icon="🏯"
              label="Classer les animes"
              tip="Classer les animes vus par duels"
              sub={stats && `${fmt(stats.anime.unranked)} non classés`}
              progress={stats && ratio(stats.anime.ranked, stats.anime.seen)}
            />
          </>
        )}
        <Tile color="red" href="#/wishlist" icon="💖" label="Wishlist" tip="Consulter et prioriser ta wishlist" sub={stats && `${fmt(stats.wish)} titres`} />
        <Tile color="green" href="#/add" icon="🔍" label="Ajout manuel" tip="Chercher un titre précis pour l’ajouter" sub="Rechercher un titre" />
        <Tile color="yellow" href="#/lists" icon="📚" label="Mes listes" tip="Tous tes titres vus et pas vus, pour corriger une erreur" sub="Vus · Pas vus" />
        <Tile
          color="blue"
          href="#/stats"
          icon="📊"
          label="Stats & badges"
          tip="Tes statistiques et tes badges"
          sub={stats && `${stats.badges}/${BADGES.length} badges`}
          progress={stats && ratio(stats.badges, BADGES.length)}
        />
      </div>

      {stats && (
        <p className="muted center small">
          👀 Vus : {fmt(stats.movie.seen)} films · {fmt(stats.tv.seen)} séries{showAnime && ` · ${fmt(stats.anime.seen)} animes`}
        </p>
      )}
    </main>
  );
}

/** Activité du jour : grande carte sur PC, fine bande sur téléphone. */
function Activity({ today, streak, desktop }: { today: number; streak: number; desktop: boolean }) {
  const plural = today > 1 ? 's' : '';
  const streakClass = `streak ${streak ? 'on' : ''}`;
  const streakTip = 'Jours d’affilée avec au moins un tri';

  if (!desktop) {
    return (
      <section className="activity-strip" title="Swipes et duels du jour">
        <span className={streakClass} title={streakTip}>
          🔥 {streak} j
        </span>
        <span>
          <b className="activity-num">{today}</b> tri{plural} aujourd’hui
        </span>
        <span className="activity-msg muted">{today === 0 ? 'Un petit swipe ?' : today < 25 ? 'Bien parti !' : 'Champion 🏆'}</span>
      </section>
    );
  }
  return (
    <section className="activity" title="Swipes et duels du jour">
      <div className="activity-today">
        <span className="activity-num">{today}</span>
        <span className="activity-label">tri{plural} aujourd’hui</span>
      </div>
      <div className="activity-side">
        <span className={streakClass} title={streakTip}>
          🔥 {streak} jour{streak > 1 ? 's' : ''}
        </span>
        <span className="muted small">
          {today === 0 ? 'Un petit swipe pour lancer la journée ?' : today < 25 ? 'Bien parti, continue !' : 'Session de champion 🏆'}
        </span>
      </div>
    </section>
  );
}

function TonightButton({ desktop }: { desktop: boolean }) {
  return (
    <a className="tonight-btn" href="#/tonight" title="Tirer au sort un titre de ta wishlist pour ce soir">
      <span className="tonight-emoji">🍿</span>
      {desktop ? (
        <span>
          <b>Ce soir, je regarde quoi ?</b>
          <span className="tonight-sub">Un tirage dans ta wishlist, selon tes priorités</span>
        </span>
      ) : (
        <>
          <b>Ce soir, je regarde quoi ?</b>
          <span className="tonight-arrow">›</span>
        </>
      )}
    </a>
  );
}

interface TileProps {
  color: string;
  href: string;
  icon: string;
  label: string;
  tip: string;
  sub?: string | false;
  progress?: number | false;
}

function Tile({ color, href, icon, label, tip, sub, progress }: TileProps) {
  return (
    <a className={`tile tile-${color}`} href={href} title={tip}>
      <span className="tile-icon">{icon}</span>
      <span className="tile-label">{label}</span>
      <span className="tile-sub">{sub || ' '}</span>
      {typeof progress === 'number' && (
        <span className="tile-progress" title={`${Math.round(progress * 100)} %`}>
          <span style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </span>
      )}
    </a>
  );
}
