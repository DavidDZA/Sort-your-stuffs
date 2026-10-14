import { titleKey, type MediaType, type Title } from './db';
import { getToken } from './settings';

const API = 'https://api.themoviedb.org/3';

export const posterUrl = (path: string | null, size: 'w92' | 'w185' | 'w342' | 'w500' = 'w342') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

export class TmdbError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface RawResult {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
  overview?: string;
  vote_count?: number;
  popularity?: number;
  genre_ids?: number[];
  original_language?: string;
  origin_country?: string[];
  adult?: boolean;
}

export interface Page {
  page: number;
  total_pages: number;
  total_results: number;
  results: RawResult[];
}

export async function tmdb<T>(
  path: string,
  params: Record<string, string | number | boolean> = {},
  token = getToken(),
): Promise<T> {
  if (!token) throw new TmdbError('Clé TMDB manquante : renseigne-la dans les réglages.', 401);
  const url = new URL(API + path);
  url.searchParams.set('language', 'fr-FR');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' } });
    if (res.status === 429 && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (res.status === 401) throw new TmdbError('Clé TMDB refusée : vérifie le jeton dans les réglages.', 401);
    if (!res.ok) throw new TmdbError(`Erreur TMDB (${res.status})`, res.status);
    return res.json() as Promise<T>;
  }
}

const G = { animation: 16, documentary: 99, kids: 10762, news: 10763, reality: 10764, talk: 10767 };

/** Genres exclus directement dans les requêtes /discover. */
export const EXCLUDED_GENRES: Record<MediaType, number[]> = {
  movie: [G.documentary],
  tv: [G.documentary, G.news, G.reality, G.talk],
};

/**
 * Règles d'exclusion : documentaires, émissions (télé-réalité, talk-shows, infos),
 * animes (séries d'animation japonaises) et dessins animés jeunesse.
 * Les films d'animation et les séries animées adultes restent inclus.
 * Les courts métrages sont filtrés par durée dans /discover (la recherche ne donne pas la durée).
 */
export function isExcluded(type: MediaType, r: RawResult): boolean {
  if (r.adult) return true;
  const genres = r.genre_ids ?? [];
  if (genres.some((g) => EXCLUDED_GENRES[type].includes(g))) return true;
  if (type === 'tv' && genres.includes(G.animation)) {
    const japanese = r.original_language === 'ja' || (r.origin_country ?? []).includes('JP');
    if (japanese || genres.includes(G.kids)) return true;
  }
  return false;
}

export function toTitle(type: MediaType, r: RawResult): Title {
  const date = type === 'movie' ? r.release_date : r.first_air_date;
  return {
    key: titleKey(type, r.id),
    type,
    tmdbId: r.id,
    title: (type === 'movie' ? r.title : r.name) ?? '',
    originalTitle: (type === 'movie' ? r.original_title : r.original_name) ?? '',
    year: date ? Number(date.slice(0, 4)) || null : null,
    posterPath: r.poster_path ?? null,
    overview: r.overview ?? '',
    voteCount: r.vote_count ?? 0,
    popularity: r.popularity ?? 0,
  };
}

/** Recherche films + séries ; renvoie les titres non exclus. */
export async function search(query: string): Promise<Title[]> {
  const page = await tmdb<Page>('/search/multi', { query, include_adult: false });
  return page.results
    .filter((r): r is RawResult & { media_type: MediaType } => r.media_type === 'movie' || r.media_type === 'tv')
    .filter((r) => !isExcluded(r.media_type, r))
    .map((r) => ({ ...toTitle(r.media_type, r), manual: true }));
}
