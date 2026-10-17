import { db, type MediaType, type Title } from './db';
import { bestStreak, lastDays, loadActivity, streak, todayCount } from './activity';
import { readRanking } from './ranking';
import { genreName } from './genres';
import { detailsOutdated } from './tmdb';

export interface Bar {
  label: string;
  count: number;
}

export interface TypeStats {
  seen: number;
  minutes: number; // temps passé (approximatif pour les séries)
  withDetails: number; // titres vus dont la fiche est connue
  decades: Bar[];
  genres: Bar[];
  people: Bar[]; // réalisateurs (films) ou créateurs (séries)
  actors: Bar[]; // acteurs (premiers rôles)
  top: { seen: number; total: number }; // couverture des titres les plus populaires
  ranked: number;
}

export interface Stats {
  movie: TypeStats;
  tv: TypeStats;
  wish: number;
  unseen: number;
  today: number;
  streak: number;
  bestStreak: number;
  bestDay: number;
  totalActions: number;
  last30: { date: Date; count: number }[];
  sagas: string[]; // sagas entièrement vues
  missingDetails: Title[]; // titres vus sans fiche, ou fiche ancienne (pour compléter les stats)
}

export const TOP_SIZE: Record<MediaType, number> = { movie: 250, tv: 100 };

// Les titres les plus populaires changent peu : calculés une fois par session.
const topCache = new Map<MediaType, Promise<string[]>>();
function topKeys(type: MediaType): Promise<string[]> {
  let p = topCache.get(type);
  if (!p) {
    p = db.titles
      .where('type')
      .equals(type)
      .toArray()
      .then((all) =>
        all
          .filter((t) => !t.manual)
          .sort((a, b) => b.voteCount - a.voteCount)
          .slice(0, TOP_SIZE[type])
          .map((t) => t.key),
      );
    topCache.set(type, p);
  }
  return p;
}

const count = (values: string[], limit: number): Bar[] => {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()]
    .map(([label, n]) => ({ label, count: n }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};

function minutesOf(t: Title): number {
  const d = t.details;
  if (!d?.runtime) return 0;
  return t.type === 'movie' ? d.runtime : d.runtime * (d.episodes ?? 0);
}

async function typeStats(type: MediaType, seen: Title[]): Promise<TypeStats> {
  const seenKeys = new Set(seen.map((t) => t.key));
  const top = await topKeys(type);
  const decades = new Map<number, number>();
  for (const t of seen) if (t.year) decades.set(Math.floor(t.year / 10) * 10, (decades.get(Math.floor(t.year / 10) * 10) ?? 0) + 1);

  return {
    seen: seen.length,
    minutes: seen.reduce((s, t) => s + minutesOf(t), 0),
    withDetails: seen.filter((t) => t.details).length,
    decades: [...decades.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => ({ label: d < 2000 ? `${String(d).slice(2)}s` : `${d}s`, count: n })),
    genres: count(
      seen.flatMap((t) => (t.genreIds?.length ? t.genreIds.map((g) => genreName(type, g)).filter(Boolean) : (t.details?.genres ?? []))),
      8,
    ),
    people: count(
      seen.flatMap((t) => t.details?.directors ?? []),
      5,
    ).filter((b) => b.count > 1),
    actors: count(
      seen.flatMap((t) => t.details?.topCast ?? t.details?.cast ?? []),
      5,
    ).filter((b) => b.count > 1),
    top: { seen: top.filter((k) => seenKeys.has(k)).length, total: top.length },
    ranked: (await readRanking({ type, list: 'seen' })).length,
  };
}

export async function computeStats(): Promise<Stats> {
  const [answers, activity, sagaRows] = await Promise.all([
    db.answers.toArray(),
    loadActivity(),
    db.meta.where('key').startsWith('saga:').toArray(),
  ]);
  const seenAnswers = answers.filter((a) => a.status === 'seen');
  const seenTitles = (await db.titles.bulkGet(seenAnswers.map((a) => a.key))).filter((t): t is Title => !!t);
  const seenKeys = new Set(seenTitles.map((t) => t.key));
  const [movie, tv] = await Promise.all([
    typeStats('movie', seenTitles.filter((t) => t.type === 'movie')),
    typeStats('tv', seenTitles.filter((t) => t.type === 'tv')),
  ]);

  const sagas = sagaRows
    .map((r) => r.value as { name: string; keys: string[] })
    .filter((s) => s.keys.length >= 2 && s.keys.every((k) => seenKeys.has(k)))
    .map((s) => s.name);

  return {
    movie,
    tv,
    wish: answers.filter((a) => a.status === 'wish').length,
    unseen: answers.filter((a) => a.status === 'unseen').length,
    today: todayCount(activity),
    streak: streak(activity),
    bestStreak: bestStreak(activity),
    bestDay: Math.max(0, ...Object.values(activity)),
    totalActions: Object.values(activity).reduce((s, n) => s + n, 0),
    last30: lastDays(activity, 30),
    sagas,
    missingDetails: seenTitles.filter((t) => detailsOutdated(t.details)),
  };
}

export function formatHours(minutes: number): string {
  const h = Math.round(minutes / 60);
  if (h < 48) return `${h} h`;
  const days = Math.floor(h / 24);
  return `${h.toLocaleString('fr-FR')} h (${days} jours)`;
}
