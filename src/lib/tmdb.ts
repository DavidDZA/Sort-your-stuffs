import { db, titleKey, type Details, type MediaType, type Provider, type Title } from './db';
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
  vote_average?: number;
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

/** Au-delà, une requête TMDB est abandonnée (réseau qui ne répond plus). */
const TIMEOUT_MS = 20_000;

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
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      if ((e as Error).name === 'TimeoutError') throw new TmdbError('TMDB ne répond pas : vérifie ta connexion.', 0);
      throw e;
    }
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
 * Règles d'exclusion : documentaires, émissions (télé-réalité, talk-shows, infos) et dessins animés jeunesse.
 * Les films d'animation, les séries animées adultes et les animes (catégorie à part, voir category.ts) sont inclus.
 * Les courts métrages sont filtrés par durée dans /discover (la recherche ne donne pas la durée).
 */
export function isExcluded(type: MediaType, r: RawResult): boolean {
  if (r.adult) return true;
  const genres = r.genre_ids ?? [];
  if (genres.some((g) => EXCLUDED_GENRES[type].includes(g))) return true;
  return type === 'tv' && genres.includes(G.animation) && genres.includes(G.kids);
}

/** Anime au sens de TMDB (avant conversion en titre) : série d'animation japonaise. */
export const isAnimeResult = (r: RawResult) =>
  (r.genre_ids ?? []).includes(G.animation) && (r.original_language === 'ja' || (r.origin_country ?? []).includes('JP'));

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
    ...(r.vote_average ? { rating: Math.round(r.vote_average * 10) / 10 } : {}),
    genreIds: r.genre_ids ?? [],
    originalLanguage: r.original_language,
  };
}

/** Membre du casting ou de l'équipe dans une fiche détaillée. */
interface CreditPerson {
  name: string;
  job?: string;
  order?: number;
}

interface RawProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priorities?: Record<string, number>;
}

export interface DetailsResponse {
  runtime?: number | null;
  episode_run_time?: number[];
  last_episode_to_air?: { runtime?: number | null } | null;
  number_of_seasons?: number;
  number_of_episodes?: number;
  vote_average?: number;
  original_language?: string;
  genres?: { id: number; name: string }[];
  created_by?: CreditPerson[];
  belongs_to_collection?: { id: number; name: string } | null;
  credits?: { cast: CreditPerson[]; crew: CreditPerson[] };
  videos?: { results: { key: string; site: string; type: string; iso_639_1: string; official: boolean }[] };
  'watch/providers'?: {
    results: Record<string, { link?: string; flatrate?: RawProvider[]; rent?: RawProvider[]; buy?: RawProvider[] } | undefined>;
  };
}

export const providerLogo = (path: string | null) => (path ? `https://image.tmdb.org/t/p/w92${path}` : null);

const toProviders = (list: RawProvider[] = []): Provider[] =>
  list.map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path }));

export function pickTrailer(videos: NonNullable<DetailsResponse['videos']>['results'] = []): string | null {
  const yt = videos.filter((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
  const score = (v: (typeof yt)[number]) => (v.type === 'Trailer' ? 4 : 0) + (v.iso_639_1 === 'fr' ? 2 : 0) + (v.official ? 1 : 0);
  return yt.sort((a, b) => score(b) - score(a))[0]?.key ?? null;
}

export function parseDetails(type: MediaType, res: DetailsResponse): Details {
  const cast = [...(res.credits?.cast ?? [])].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  const crew = res.credits?.crew ?? [];
  const fr = res['watch/providers']?.results.FR;
  return {
    fetchedAt: Date.now(),
    directors: (type === 'movie' ? crew.filter((c) => c.job === 'Director') : (res.created_by ?? [])).slice(0, 2).map((c) => c.name),
    cast: cast.slice(0, 2).map((c) => c.name),
    topCast: cast.slice(0, 8).map((c) => c.name),
    genres: (res.genres ?? []).map((g) => g.name),
    genreIds: (res.genres ?? []).map((g) => g.id),
    originalLanguage: res.original_language,
    rating: res.vote_average ? Math.round(res.vote_average * 10) / 10 : null,
    runtime: (type === 'movie' ? res.runtime : (res.episode_run_time?.[0] ?? res.last_episode_to_air?.runtime)) || null,
    seasons: res.number_of_seasons,
    episodes: res.number_of_episodes,
    collection: res.belongs_to_collection ? { id: res.belongs_to_collection.id, name: res.belongs_to_collection.name } : null,
    trailer: pickTrailer(res.videos?.results),
    providers: { flatrate: toProviders(fr?.flatrate), rent: toProviders(fr?.rent), buy: toProviders(fr?.buy), link: fr?.link ?? null },
  };
}

const pending = new Map<string, Promise<Details | null>>();
export const WEEK = 7 * 86_400_000;

/**
 * Fiche détaillée (casting, durée, saga, plateformes, bande-annonce…), mise en cache dans la base.
 * `maxAge` force un rafraîchissement des fiches trop anciennes (utile pour les plateformes).
 */
/** Fiche à récupérer à nouveau : absente, ou d'avant le 17/10 (sans genres, langue ni premiers rôles). */
export const detailsOutdated = (d?: Details) => !d || d.genreIds === undefined || d.topCast === undefined;

export function ensureDetails(title: Title, maxAge = Infinity): Promise<Details | null> {
  const fresh = (d?: Details) => !detailsOutdated(d) && Date.now() - d!.fetchedAt < maxAge;
  if (fresh(title.details)) return Promise.resolve(title.details!);
  let p = pending.get(title.key);
  if (!p) {
    p = (async () => {
      try {
        const stored = await db.titles.get(title.key);
        if (fresh(stored?.details)) return stored!.details!;
        const res = await tmdb<DetailsResponse>(`/${title.type}/${title.tmdbId}`, {
          append_to_response: 'credits,videos,watch/providers',
          include_video_language: 'fr,en',
        });
        const details = parseDetails(title.type, res);
        // Complète au passage les infos absentes du titre (catalogue téléchargé avant qu'on les enregistre).
        const patch: Partial<Title> = { details };
        if (!stored?.genreIds?.length && details.genreIds?.length) patch.genreIds = details.genreIds;
        if (!stored?.originalLanguage && details.originalLanguage) patch.originalLanguage = details.originalLanguage;
        if (stored?.rating === undefined && details.rating) patch.rating = details.rating;
        await db.titles.update(title.key, patch);
        return details;
      } catch {
        return null; // hors ligne ou erreur : on réessaiera au prochain affichage
      } finally {
        pending.delete(title.key);
      }
    })();
    pending.set(title.key, p);
  }
  return p;
}

/** Charge les fiches manquantes ou trop anciennes, quelques-unes à la fois. */
export async function prefetchDetails(titles: Title[], maxAge = Infinity, concurrency = 4): Promise<void> {
  const todo = titles.filter((t) => detailsOutdated(t.details) || Date.now() - t.details!.fetchedAt >= maxAge);
  let next = 0;
  const worker = async () => {
    while (next < todo.length) await ensureDetails(todo[next++], maxAge);
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

export interface Saga {
  id: number;
  name: string;
  parts: Title[]; // films sortis, par ordre de sortie
}

const sagas = new Map<number, Promise<Saga | null>>();

/** Films d'une saga TMDB (mémorisée pour les badges « saga complète »). */
export function fetchSaga(id: number): Promise<Saga | null> {
  let p = sagas.get(id);
  if (!p) {
    p = (async () => {
      try {
        const res = await tmdb<{ name: string; parts: RawResult[] }>(`/collection/${id}`);
        const today = new Date().toISOString().slice(0, 10);
        const parts = res.parts
          .filter((r) => r.release_date && r.release_date <= today && !isExcluded('movie', r))
          .sort((a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? ''))
          .map((r) => ({ ...toTitle('movie', r), manual: true }));
        await db.meta.put({ key: `saga:${id}`, value: { name: res.name, keys: parts.map((t) => t.key) } });
        return { id, name: res.name, parts };
      } catch {
        sagas.delete(id);
        return null;
      }
    })();
    sagas.set(id, p);
  }
  return p;
}

export interface ProviderOption extends Provider {
  priority: number;
}

/** Plateformes disponibles en France (films + séries), les plus courantes d'abord. */
export async function fetchProviderOptions(): Promise<ProviderOption[]> {
  const [movie, tv] = await Promise.all(
    (['movie', 'tv'] as const).map((type) => tmdb<{ results: RawProvider[] }>(`/watch/providers/${type}`, { watch_region: 'FR' })),
  );
  const byId = new Map<number, ProviderOption>();
  for (const p of [...movie.results, ...tv.results]) {
    const priority = p.display_priorities?.FR ?? 999;
    const prev = byId.get(p.provider_id);
    if (!prev || priority < prev.priority) byId.set(p.provider_id, { id: p.provider_id, name: p.provider_name, logo: p.logo_path, priority });
  }
  return [...byId.values()].sort((a, b) => a.priority - b.priority);
}

// ---------- Personnes (ajout manuel par réalisateur / acteur) ----------

export type PersonRole = 'director' | 'actor';

export interface Person {
  id: number;
  name: string;
  profilePath: string | null;
  department: string; // « Directing », « Acting »…
  knownFor: string[];
}

export const profileUrl = (path: string | null) => (path ? `https://image.tmdb.org/t/p/w185${path}` : null);

/** Personnes correspondant au nom, celles du bon métier en premier (réalisation ou interprétation). */
export async function searchPeople(query: string, role: PersonRole): Promise<Person[]> {
  const page = await tmdb<{ results: { id: number; name: string; profile_path: string | null; known_for_department?: string; known_for?: RawResult[] }[] }>(
    '/search/person',
    { query, include_adult: false },
  );
  const wanted = role === 'director' ? 'Directing' : 'Acting';
  return page.results
    .map((p) => ({
      id: p.id,
      name: p.name,
      profilePath: p.profile_path,
      department: p.known_for_department ?? '',
      knownFor: (p.known_for ?? []).map((k) => k.title ?? k.name ?? '').filter(Boolean).slice(0, 3),
    }))
    .sort((a, b) => Number(b.department === wanted) - Number(a.department === wanted));
}

export interface CreditItem extends RawResult {
  media_type?: string;
  character?: string;
  job?: string;
}

/** Apparitions « dans son propre rôle » (documentaires, hommages, making-of…) : écartées. */
const SELF = /^(self|himself|herself|themselves|lui-même|elle-même)\b/i;

/**
 * Filmographie d'une personne : films réalisés et séries créées (réalisateur), ou rôles joués (acteur).
 * Sans doublon, sans titre exclu (documentaires, émissions, animes…) ni titre pas encore sorti ;
 * du plus récent au plus ancien.
 */
export function filmography(credits: { cast: CreditItem[]; crew: CreditItem[] }, role: PersonRole): Title[] {
  const items =
    role === 'actor'
      ? credits.cast.filter((c) => !SELF.test(c.character?.trim() ?? ''))
      : credits.crew.filter((c) => (c.media_type === 'movie' && c.job === 'Director') || (c.media_type === 'tv' && c.job === 'Creator'));
  const today = new Date().toISOString().slice(0, 10);
  const byKey = new Map<string, Title>();
  for (const c of items) {
    if (c.media_type !== 'movie' && c.media_type !== 'tv') continue;
    const date = c.media_type === 'movie' ? c.release_date : c.first_air_date;
    if (!date || date > today || isExcluded(c.media_type, c)) continue;
    const t = { ...toTitle(c.media_type, c), manual: true };
    if (!byKey.has(t.key)) byKey.set(t.key, t);
  }
  return [...byKey.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || b.voteCount - a.voteCount);
}

/** Titres peu connus (souvent des courts métrages) : rangés à part, et pas ajoutés au swipe. */
export const KNOWN_VOTES = 50;

const filmographies = new Map<string, Promise<Title[]>>();

/** Filmographie d'une personne (mémorisée le temps de la session). */
export function personFilmography(personId: number, role: PersonRole): Promise<Title[]> {
  const id = `${personId}:${role}`;
  let p = filmographies.get(id);
  if (!p) {
    p = tmdb<{ cast: CreditItem[]; crew: CreditItem[] }>(`/person/${personId}/combined_credits`).then((credits) => filmography(credits, role));
    p.catch(() => filmographies.delete(id));
    filmographies.set(id, p);
  }
  return p;
}

/** Recherche films + séries ; renvoie les titres non exclus. */
export async function search(query: string): Promise<Title[]> {
  const page = await tmdb<Page>('/search/multi', { query, include_adult: false });
  return page.results
    .filter((r): r is RawResult & { media_type: MediaType } => r.media_type === 'movie' || r.media_type === 'tv')
    .filter((r) => !isExcluded(r.media_type, r))
    .map((r) => ({ ...toTitle(r.media_type, r), manual: true }));
}
