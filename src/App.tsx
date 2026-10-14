import { useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type MediaType } from './db';
import { readRanking } from './ranking';
import { getToken } from './settings';
import { loadActivity, streak, todayCount } from './activity';
import { pick } from './fun';
import Swipe from './pages/Swipe';
import Rank from './pages/Rank';
import AddManual from './pages/AddManual';
import Wishlist from './pages/Wishlist';
import Settings from './pages/Settings';

function useRoute(): string[] {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return hash.replace(/^#\/?/, '').split('/');
}

const asType = (s: string | undefined): MediaType => (s === 'tv' ? 'tv' : 'movie');

export default function App() {
  const [page, arg] = useRoute();
  useEffect(() => window.scrollTo(0, 0), [page, arg]);

  let content: ReactNode;
  switch (page) {
    case 'swipe':
      content = <Swipe key={arg} type={asType(arg)} />;
      break;
    case 'rank':
      content = <Rank key={arg} type={asType(arg)} />;
      break;
    case 'add':
      content = <AddManual />;
      break;
    case 'wishlist':
      content = <Wishlist />;
      break;
    case 'settings':
      content = <Settings />;
      break;
    default:
      content = <Home />;
  }
  return (
    <>
      {content}
      <Toaster />
    </>
  );
}

/** Affiche les messages envoyés par toast() (voir fun.ts). */
function Toaster() {
  const [msg, setMsg] = useState<{ text: string; id: number } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onToast = (e: Event) => {
      setMsg({ text: (e as CustomEvent<string>).detail, id: Date.now() });
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 2400);
    };
    addEventListener('app-toast', onToast);
    return () => {
      removeEventListener('app-toast', onToast);
      clearTimeout(timer);
    };
  }, []);
  return msg ? (
    <div key={msg.id} className="toast" role="status">
      {msg.text}
    </div>
  ) : null;
}

const fmt = (n: number) => Math.max(0, n).toLocaleString('fr-FR');

const TAGLINES = [
  'Popcorn prêt ? 🍿',
  '5 minutes, et ta base grandit 🌱',
  'Qu’est-ce qu’on trie aujourd’hui ?',
  'Un petit swipe pour la route ? 🎬',
  'Ta mémoire de cinéphile, en ordre ✨',
];

function Home() {
  const [tagline] = useState(() => pick(TAGLINES));
  const stats = useLiveQuery(async () => {
    const byType = async (type: MediaType) => {
      const [total, answered, seen, ranking] = await Promise.all([
        db.titles.where('type').equals(type).count(),
        db.answers.where('type').equals(type).count(),
        db.answers.where('[type+status]').equals([type, 'seen']).count(),
        readRanking({ type, list: 'seen' }),
      ]);
      return { total, answered, toSwipe: total - answered, seen, ranked: ranking.length, unranked: seen - ranking.length };
    };
    const [movie, tv, wish, activity] = await Promise.all([
      byType('movie'),
      byType('tv'),
      db.answers.where('status').equals('wish').count(),
      loadActivity(),
    ]);
    return { movie, tv, wish, today: todayCount(activity), streak: streak(activity) };
  });

  const noToken = !getToken();
  const emptyCatalogue = stats && stats.movie.total + stats.tv.total === 0;
  const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

  return (
    <main className="page">
      <header className="home-header">
        <img className="logo" src={`${import.meta.env.BASE_URL}icons/favicon.svg`} alt="" />
        <div className="home-title">
          <h1>Sort my stuffs</h1>
          <p className="tagline">{tagline}</p>
        </div>
        <a className="icon-btn" href="#/settings" aria-label="Réglages" title="Réglages : clé TMDB, catalogue, sauvegarde">
          ⚙️
        </a>
      </header>

      {(noToken || emptyCatalogue) && (
        <a className="banner" href="#/settings">
          {noToken ? '🔑 Commence par renseigner ta clé TMDB dans les réglages →' : '📦 Télécharge le catalogue des films et séries →'}
        </a>
      )}

      {stats && !emptyCatalogue && (
        <section className="activity" title="Swipes et duels du jour">
          <div className="activity-today">
            <span className="activity-num">{stats.today}</span>
            <span className="activity-label">tri{stats.today > 1 ? 's' : ''} aujourd’hui</span>
          </div>
          <div className="activity-side">
            <span className={`streak ${stats.streak ? 'on' : ''}`} title="Jours d’affilée avec au moins un tri">
              🔥 {stats.streak} jour{stats.streak > 1 ? 's' : ''}
            </span>
            <span className="muted small">
              {stats.today === 0 ? 'Un petit swipe pour lancer la journée ?' : stats.today < 25 ? 'Bien parti, continue !' : 'Session de champion 🏆'}
            </span>
          </div>
        </section>
      )}

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
        <Tile color="green" href="#/add" icon="🔍" label="Ajout manuel" tip="Chercher un titre précis pour l’ajouter" sub="Rechercher un titre" />
        <Tile color="red" href="#/wishlist" icon="💖" label="Wishlist" tip="Consulter et prioriser ta wishlist" sub={stats && `${fmt(stats.wish)} titres`} />
      </div>

      {stats && (
        <p className="muted center small">
          👀 Vus : {fmt(stats.movie.seen)} films · {fmt(stats.tv.seen)} séries
        </p>
      )}
    </main>
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
