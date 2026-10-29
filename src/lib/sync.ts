import { db, setMeta, type MediaType, type Title } from './db';
import { EXCLUDED_GENRES, isExcluded, setAnimeIncluded, tmdb, toTitle, type Page } from './tmdb';
import { getIncludeAnime, type MinVotes } from './settings';

const MAX_PAGES = 500; // limite imposée par TMDB sur /discover
const CONCURRENCY = 6;
const DAY = 86_400_000;

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

function discover(type: MediaType, from: number, to: number, page: number, minVotes: number) {
  const dateField = type === 'movie' ? 'primary_release_date' : 'first_air_date';
  return tmdb<Page>(`/discover/${type}`, {
    sort_by: 'vote_count.desc',
    'vote_count.gte': minVotes,
    include_adult: false,
    without_genres: EXCLUDED_GENRES[type].join(','),
    [`${dateField}.gte`]: iso(from),
    [`${dateField}.lte`]: iso(to),
    page,
    ...(type === 'movie' ? { 'with_runtime.gte': 40 } : {}),
  });
}

interface Range {
  from: number;
  to: number;
  first: Page;
}

/** Découpe la période en tranches de moins de 500 pages pour contourner la limite de TMDB. */
async function splitRanges(type: MediaType, from: number, to: number, minVotes: number): Promise<Range[]> {
  const first = await discover(type, from, to, 1, minVotes);
  if (first.total_pages > MAX_PAGES && to - from > DAY) {
    const mid = from + Math.floor((to - from) / 2 / DAY) * DAY;
    return [...(await splitRanges(type, from, mid, minVotes)), ...(await splitRanges(type, mid + DAY, to, minVotes))];
  }
  return [{ from, to, first }];
}

async function runPool(tasks: (() => Promise<void>)[], concurrency: number) {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) await tasks[next++]();
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

export type Progress = (message: string) => void;

async function syncType(type: MediaType, minVotes: number, onProgress: Progress, seen: Set<string>): Promise<number> {
  const label = type === 'movie' ? 'films' : 'séries';
  onProgress(`Préparation des ${label}…`);
  const to = Date.UTC(new Date().getUTCFullYear() + 1, 11, 31);
  const ranges = await splitRanges(type, Date.UTC(1870, 0, 1), to, minVotes);

  let buffer: Title[] = [];
  let count = 0;
  const keep = (page: Page) => {
    for (const r of page.results) if (!isExcluded(type, r)) buffer.push(toTitle(type, r));
  };
  const flush = async () => {
    const batch = buffer;
    buffer = [];
    count += batch.length;
    batch.forEach((t) => seen.add(t.key));
    // Conserve les fiches détaillées déjà mises en cache.
    const existing = await db.titles.bulkGet(batch.map((t) => t.key));
    batch.forEach((t, i) => {
      if (existing[i]?.details) t.details = existing[i]!.details;
    });
    await db.titles.bulkPut(batch);
    onProgress(`${count.toLocaleString('fr-FR')} ${label} récupérés…`);
  };

  const tasks: (() => Promise<void>)[] = [];
  for (const range of ranges) {
    keep(range.first);
    const pages = Math.min(range.first.total_pages, MAX_PAGES);
    for (let p = 2; p <= pages; p++) {
      tasks.push(async () => {
        keep(await discover(type, range.from, range.to, p, minVotes));
        if (buffer.length >= 500) await flush();
      });
    }
  }
  await runPool(tasks, CONCURRENCY);
  await flush();
  return count;
}

/**
 * Supprime les titres absents du nouveau téléchargement (seuil de votes relevé, ajout manuel…),
 * avec leurs réponses : ils disparaissent aussi des classements.
 */
async function removeMissing(seen: Set<string>): Promise<number> {
  return db.transaction('rw', db.titles, db.answers, async () => {
    const keys = await db.titles.filter((t) => !seen.has(t.key)).primaryKeys();
    await db.titles.bulkDelete(keys);
    await db.answers.bulkDelete(keys);
    return keys.length;
  });
}

/**
 * Télécharge ou met à jour le catalogue. Les titres qui n'en font plus partie sont supprimés,
 * même s'ils avaient une réponse ou une place dans un classement, y compris les ajouts manuels.
 */
export async function syncCatalogue(minVotes: MinVotes, onProgress: Progress): Promise<{ movie: number; tv: number; removed: number }> {
  const seen = new Set<string>();
  setAnimeIncluded(await getIncludeAnime()); // réglage à jour (il a pu changer sur un autre appareil)
  const movie = await syncType('movie', minVotes.movie, onProgress, seen);
  const tv = await syncType('tv', minVotes.tv, onProgress, seen);
  const removed = await removeMissing(seen);
  await setMeta('lastSync', Date.now());
  return { movie, tv, removed };
}
