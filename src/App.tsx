import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type MediaType } from './db';
import { readRanking } from './ranking';
import { getToken } from './settings';
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

  switch (page) {
    case 'swipe':
      return <Swipe key={arg} type={asType(arg)} />;
    case 'rank':
      return <Rank key={arg} type={asType(arg)} />;
    case 'add':
      return <AddManual />;
    case 'wishlist':
      return <Wishlist />;
    case 'settings':
      return <Settings />;
    default:
      return <Home />;
  }
}

const fmt = (n: number) => Math.max(0, n).toLocaleString('fr-FR');

function Home() {
  const stats = useLiveQuery(async () => {
    const byType = async (type: MediaType) => {
      const [total, answered, seen, ranking] = await Promise.all([
        db.titles.where('type').equals(type).count(),
        db.answers.where('type').equals(type).count(),
        db.answers.where('[type+status]').equals([type, 'seen']).count(),
        readRanking(type),
      ]);
      return { total, toSwipe: total - answered, seen, unranked: seen - ranking.length };
    };
    const [movie, tv, wish] = await Promise.all([byType('movie'), byType('tv'), db.answers.where('status').equals('wish').count()]);
    return { movie, tv, wish };
  });

  const noToken = !getToken();
  const emptyCatalogue = stats && stats.movie.total + stats.tv.total === 0;

  return (
    <main className="page">
      <header className="home-header">
        <h1>Sort my stuffs</h1>
        <a className="icon-btn" href="#/settings" aria-label="Réglages">
          ⚙
        </a>
      </header>

      {(noToken || emptyCatalogue) && (
        <a className="banner" href="#/settings">
          {noToken ? 'Commence par renseigner ta clé TMDB dans les réglages →' : 'Télécharge le catalogue des films et séries →'}
        </a>
      )}

      <div className="tiles">
        <Tile href="#/swipe/movie" icon="🎬" label="Swiper les films" sub={stats && `${fmt(stats.movie.toSwipe)} à découvrir`} />
        <Tile href="#/swipe/tv" icon="📺" label="Swiper les séries" sub={stats && `${fmt(stats.tv.toSwipe)} à découvrir`} />
        <Tile href="#/rank/movie" icon="🏆" label="Classer les films" sub={stats && `${fmt(stats.movie.unranked)} non classés`} />
        <Tile href="#/rank/tv" icon="🥇" label="Classer les séries" sub={stats && `${fmt(stats.tv.unranked)} non classées`} />
        <Tile href="#/add" icon="🔍" label="Ajout manuel" sub="Rechercher un titre" />
        <Tile href="#/wishlist" icon="♥" label="Wishlist" sub={stats && `${fmt(stats.wish)} titres`} />
      </div>

      {stats && (
        <p className="muted center">
          Vus : {fmt(stats.movie.seen)} films · {fmt(stats.tv.seen)} séries
        </p>
      )}
    </main>
  );
}

function Tile({ href, icon, label, sub }: { href: string; icon: string; label: string; sub?: string | false }) {
  return (
    <a className="tile" href={href}>
      <span className="tile-icon">{icon}</span>
      <span className="tile-label">{label}</span>
      <span className="tile-sub">{sub || ' '}</span>
    </a>
  );
}
