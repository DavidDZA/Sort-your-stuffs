import { useEffect, useState, type ReactNode } from 'react';
import type { MediaType } from './lib/db';
import { checkBadges, checkBadgesSoon } from './lib/badges';
import { FicheHost } from './components/Fiche';
import { Toaster } from './components/Toaster';
import Home from './pages/Home';
import Swipe from './pages/swipe/Swipe';
import Rank from './pages/Rank';
import AddManual from './pages/AddManual';
import Wishlist from './pages/Wishlist';
import Lists from './pages/Lists';
import StatsPage from './pages/Stats';
import Tonight from './pages/Tonight';
import Settings from './pages/settings/Settings';
import Friends from './pages/Friends';
import Duo from './pages/Duo';

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

const asType = (s: string | undefined): MediaType => (s === 'tv' ? 'tv' : 'movie');

function page(name: string, arg: string | undefined): ReactNode {
  switch (name) {
    case 'swipe':
      return <Swipe key={arg} type={asType(arg)} />;
    case 'rank':
      return <Rank key={arg} type={asType(arg)} />;
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

  // Vérifie les badges au démarrage puis au fil des swipes et des duels.
  useEffect(() => {
    checkBadges().catch(() => undefined);
    addEventListener('activity', checkBadgesSoon);
    return () => removeEventListener('activity', checkBadgesSoon);
  }, []);

  return (
    <>
      {page(name, arg)}
      <FicheHost />
      <Toaster />
    </>
  );
}
