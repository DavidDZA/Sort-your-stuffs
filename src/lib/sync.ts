import { db, setMeta, type MediaType, type Title } from './db';
import { EXCLUDED_GENRES, isAnimeResult, isExcluded, tmdb, toTitle, type Page, type RawResult } from './tmdb';
import type { MinVotes } from './settings';
import { forgetCategories, isAnimeTitle } from './category';

const MAX_PAGES = 500; // limite imposée par TMDB sur /discover
const CONCURRENCY = 6;
const DAY = 86_400_000;

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Une requête /discover : un type, un seuil de votes, et des filtres TMDB en plus (langue, période). */
interface Query {
  type: MediaType;
  minVotes: number;
  label: string; // pour la progression : « films », « films en français »…
  extra?: Record<string, string>;
  /** Dernière date de sortie (films anciens) ; par défaut, jusqu'à l'an prochain. */
  until?: number;
  /** Tri plus fin après coup (séries et animes ont chacun leur seuil). */
  accept?: (r: RawResult) => boolean;
}

function discover(q: Query, from: number, to: number, page: number) {
  const dateField = q.type === 'movie' ? 'primary_release_date' : 'first_air_date';
  return tmdb<Page>(`/discover/${q.type}`, {
    sort_by: 'vote_count.desc',
    'vote_count.gte': q.minVotes,
    include_adult: false,
    without_genres: EXCLUDED_GENRES[q.type].join(','),
    [`${dateField}.gte`]: iso(from),
    [`${dateField}.lte`]: iso(to),
    page,
    ...(q.type === 'movie' ? { 'with_runtime.gte': 40 } : {}),
    ...q.extra,
  });
}

interface Range {
  from: number;
  to: number;
  first: Page;
}

/** Découpe la période en tranches de moins de 500 pages pour contourner la limite de TMDB. */
async function splitRanges(q: Query, from: number, to: number): Promise<Range[]> {
  const first = await discover(q, from, to, 1);
  if (first.total_pages > MAX_PAGES && to - from > DAY) {
    const mid = from + Math.floor((to - from) / 2 / DAY) * DAY;
    return [...(await splitRanges(q, from, mid)), ...(await splitRanges(q, mid + DAY, to))];
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

/** Récupère les titres d'une requête ; `seen` reçoit leurs clés (un titre trouvé par deux requêtes compte une fois). */
async function fetchQuery(q: Query, onProgress: Progress, seen: Set<string>): Promise<void> {
  onProgress(`Préparation des ${q.label}…`);
  const until = q.until ?? Date.UTC(new Date().getUTCFullYear() + 1, 11, 31);
  const ranges = await splitRanges(q, Date.UTC(1870, 0, 1), until);

  let buffer: Title[] = [];
  let count = 0;
  const keep = (page: Page) => {
    for (const r of page.results) if (!isExcluded(q.type, r) && (!q.accept || q.accept(r))) buffer.push(toTitle(q.type, r));
  };
  const flush = async () => {
    const batch = buffer;
    buffer = [];
    count += batch.length;
    batch.forEach((t) => seen.add(t.key));
    // Conserve les repères des fiches déjà lues (les fiches elles-mêmes sont rangées à part).
    const existing = await db.titles.bulkGet(batch.map((t) => t.key));
    batch.forEach((t, i) => {
      const e = existing[i];
      if (e?.detailsAt !== undefined) t.detailsAt = e.detailsAt;
      if (e?.collectionId !== undefined) t.collectionId = e.collectionId;
    });
    await db.titles.bulkPut(batch);
    onProgress(`${count.toLocaleString('fr-FR')} ${q.label} récupérés…`);
  };

  const tasks: (() => Promise<void>)[] = [];
  for (const range of ranges) {
    keep(range.first);
    const pages = Math.min(range.first.total_pages, MAX_PAGES);
    for (let p = 2; p <= pages; p++) {
      tasks.push(async () => {
        keep(await discover(q, range.from, range.to, p));
        if (buffer.length >= 500) await flush();
      });
    }
  }
  await runPool(tasks, CONCURRENCY);
  await flush();
}

/** Les films sortis avant cette date ont leur propre seuil (moins de votes sur TMDB, plus récent qu'eux). */
export const OLD_MOVIES_BEFORE = 1980;

/**
 * Requêtes du catalogue : chaque seuil a la sienne, et un titre est gardé s'il passe l'une d'elles.
 * Les titres en français et les vieux films ont un seuil plus bas : ils ont moins de votes sur TMDB,
 * surtout utilisé par un public international.
 */
export function catalogueQueries(v: MinVotes): Query[] {
  const fr = { with_original_language: 'fr' };
  return [
    { type: 'movie', minVotes: v.movie, label: 'films' },
    { type: 'movie', minVotes: v.frMovie, label: 'films en français', extra: fr },
    { type: 'movie', minVotes: v.oldMovie, label: `films d’avant ${OLD_MOVIES_BEFORE}`, until: Date.UTC(OLD_MOVIES_BEFORE - 1, 11, 31) },
    // Séries et animes viennent de la même liste TMDB : le plus bas des deux seuils, puis tri.
    {
      type: 'tv',
      minVotes: Math.min(v.tv, v.anime),
      label: 'séries et animes',
      accept: (r) => (r.vote_count ?? 0) >= (isAnimeResult(r) ? v.anime : v.tv),
    },
    { type: 'tv', minVotes: v.frTv, label: 'séries en français', extra: fr },
  ];
}

/**
 * Supprime les titres absents du nouveau téléchargement (seuil de votes relevé, ajout manuel…),
 * avec leurs réponses : ils disparaissent aussi des classements.
 */
async function removeMissing(seen: Set<string>): Promise<number> {
  return db.transaction('rw', db.titles, db.answers, db.details, async () => {
    const keys = await db.titles.filter((t) => !seen.has(t.key)).primaryKeys();
    await db.titles.bulkDelete(keys);
    await db.answers.bulkDelete(keys);
    await db.details.bulkDelete(keys);
    return keys.length;
  });
}

/**
 * Télécharge ou met à jour le catalogue. Les titres qui n'en font plus partie sont supprimés,
 * même s'ils avaient une réponse ou une place dans un classement, y compris les ajouts manuels.
 */
export async function syncCatalogue(minVotes: MinVotes, onProgress: Progress): Promise<{ movie: number; tv: number; anime: number; removed: number }> {
  const seen = new Set<string>();
  for (const q of catalogueQueries(minVotes)) await fetchQuery(q, onProgress, seen);
  const removed = await removeMissing(seen);
  forgetCategories();
  await setMeta('lastSync', Date.now());
  // Décompte par catégorie, sur les titres gardés.
  const series = await db.titles.where('type').equals('tv').toArray();
  const anime = series.filter(isAnimeTitle).length;
  const movie = [...seen].filter((k) => k.startsWith('movie:')).length;
  return { movie, tv: series.length - anime, anime, removed };
}
