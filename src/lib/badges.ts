import { getMeta, setMeta } from './db';
import { computeStats, type Stats } from './stats';
import { burst, toast } from './fun';

export interface Badge {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  target: number;
  value: (s: Stats) => number;
}

export const BADGES: Badge[] = [
  { id: 'first', emoji: '🎬', name: 'Premier pas', desc: '1 titre vu', target: 1, value: (s) => s.movie.seen + s.tv.seen + s.anime.seen },
  { id: 'films100', emoji: '🍿', name: 'Cinéphile', desc: '100 films vus', target: 100, value: (s) => s.movie.seen },
  { id: 'films250', emoji: '🎞️', name: 'Cinévore', desc: '250 films vus', target: 250, value: (s) => s.movie.seen },
  { id: 'films500', emoji: '🏛️', name: 'Cinémathèque', desc: '500 films vus', target: 500, value: (s) => s.movie.seen },
  { id: 'series25', emoji: '📺', name: 'Sériephile', desc: '25 séries vues', target: 25, value: (s) => s.tv.seen },
  { id: 'series100', emoji: '🛋️', name: 'Binge-watcher', desc: '100 séries vues', target: 100, value: (s) => s.tv.seen },
  { id: 'anime25', emoji: '🎌', name: 'Otaku', desc: '25 animes vus', target: 25, value: (s) => s.anime.seen },
  { id: 'streak7', emoji: '🔥', name: 'Semaine de feu', desc: '7 jours d’affilée', target: 7, value: (s) => s.bestStreak },
  { id: 'streak30', emoji: '☄️', name: 'Inarrêtable', desc: '30 jours d’affilée', target: 30, value: (s) => s.bestStreak },
  { id: 'day100', emoji: '⚡', name: 'Trieur fou', desc: '100 tris en un jour', target: 100, value: (s) => s.bestDay },
  { id: 'ranked50', emoji: '🏆', name: 'Juge suprême', desc: '50 titres classés', target: 50, value: (s) => s.movie.ranked + s.tv.ranked + s.anime.ranked },
  { id: 'wish25', emoji: '💖', name: 'Liste de rêve', desc: '25 titres en wishlist', target: 25, value: (s) => s.wish },
  { id: 'decades6', emoji: '🧭', name: 'Voyageur du temps', desc: 'Des films vus sur 6 décennies', target: 6, value: (s) => s.movie.decades.length },
  { id: 'saga1', emoji: '🧩', name: 'Saga complète', desc: 'Tous les films d’une saga vus', target: 1, value: (s) => s.sagas.length },
  { id: 'saga5', emoji: '🗂️', name: 'Collectionneur', desc: '5 sagas complètes', target: 5, value: (s) => s.sagas.length },
  {
    id: 'top250',
    emoji: '⭐',
    name: 'Culture ciné',
    desc: 'La moitié des 250 films les plus populaires',
    target: 125,
    value: (s) => s.movie.top.seen,
  },
];

const KEY = 'badges';

/** Vérifie les badges et fête ceux qui viennent d'être débloqués. */
export async function checkBadges(): Promise<void> {
  const stats = await computeStats();
  const unlocked = new Set(await getMeta<string[]>(KEY, []));
  const fresh = BADGES.filter((b) => !unlocked.has(b.id) && b.value(stats) >= b.target);
  if (!fresh.length) return;
  await setMeta(KEY, [...unlocked, ...fresh.map((b) => b.id)]);
  const b = fresh[0];
  toast(`🏅 Badge débloqué : ${b.emoji} ${b.name}${fresh.length > 1 ? ` (+${fresh.length - 1})` : ''}`);
  burst([b.emoji, '✨', '🎉'], undefined, 24);
}

let timer: ReturnType<typeof setTimeout> | undefined;
let last = 0;

/** Au plus une vérification toutes les 8 s pendant qu'on swipe. */
export function checkBadgesSoon(): void {
  const wait = Math.max(0, last + 8000 - Date.now());
  clearTimeout(timer);
  timer = setTimeout(() => {
    last = Date.now();
    checkBadges().catch(() => undefined);
  }, wait);
}
