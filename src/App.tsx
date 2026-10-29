import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { asCategory } from './lib/category';
import { checkBadges, checkBadgesSoon } from './lib/badges';
import { FicheHost } from './components/Fiche';
import { Toaster } from './components/Toaster';
import Home from './pages/Home';

// Pages chargées à la demande : l'appli s'ouvre plus vite (l'accueil seul au démarrage) ;
// elles sont préchargées juste après, pour s'ouvrir ensuite sans attendre.
const pages = {
  swipe: () => import('./pages/swipe/Swipe'),
  rank: () => import('./pages/Rank'),
  add: () => import('./pages/AddManual'),
  wishlist: () => import('./pages/Wishlist'),
  lists: () => import('./pages/Lists'),
  stats: () => import('./pages/Stats'),
  tonight: () => import('./pages/Tonight'),
  settings: () => import('./pages/settings/Settings'),
  friends: () => import('./pages/Friends'),
  duo: () => import('./pages/Duo'),
};
const Swipe = lazy(pages.swipe);
const Rank = lazy(pages.rank);
const AddManual = lazy(pages.add);
const Wishlist = lazy(pages.wishlist);
const Lists = lazy(pages.lists);
const StatsPage = lazy(pages.stats);
const Tonight = lazy(pages.tonight);
const Settings = lazy(pages.settings);
const Friends = lazy(pages.friends);
const Duo = lazy(pages.duo);

/** Route courante, lue dans l'ancre de l'URL : « #/swipe/movie » → ['swipe', 'movie']. */
function useRoute(): string[] {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return hash.replace(/^#\/?/, '').split('/');
}


function page(name: string, arg: string | undefined): ReactNode {
  switch (name) {
    case 'swipe':
      return <Swipe key={arg} type={asCategory(arg)} />;
    case 'rank':
      return <Rank key={arg} type={asCategory(arg)} />;
    case 'add':
      return <AddManual />;
    case 'wishlist':
      return <Wishlist />;
    case 'lists':
      return <Lists />;
    case 'stats':
      return <StatsPage />;
    case 'tonight':
      return <Tonight />;
    case 'settings':
      return <Settings section={arg} />;
    case 'friends':
      return <Friends />;
    case 'invite':
      return <Friends key={arg} invite={arg} />;
    case 'duo':
      return <Duo key={arg} friendId={arg ?? ''} />;
    default:
      return <Home />;
  }
}

export default function App() {
  const [name, arg] = useRoute();

  // Accolades obligatoires : dans les Chrome récents, scrollTo renvoie une promesse,
  // que React prendrait pour une fonction de nettoyage (plantage au changement de page).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [name, arg]);

  // Préchargement des autres pages, une fois l'accueil affiché.
  useEffect(() => {
    const timer = setTimeout(() => Object.values(pages).forEach((load) => load().catch(() => undefined)), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Vérifie les badges au démarrage puis au fil des swipes et des duels.
  useEffect(() => {
    checkBadges().catch(() => undefined);
    addEventListener('activity', checkBadgesSoon);
    return () => removeEventListener('activity', checkBadgesSoon);
  }, []);

  return (
    <>
      <Suspense fallback={<p className="muted center">Chargement…</p>}>{page(name, arg)}</Suspense>
      <FicheHost />
      <Toaster />
    </>
  );
}
