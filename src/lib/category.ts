import { useLiveQuery } from 'dexie-react-hooks';
import { db, type MediaType, type Title } from './db';
import { getShowAnime } from './settings';

/**
 * Catégories de l'appli : films, séries et animes (séries d'animation japonaises).
 * Pour TMDB, un anime reste une série (clé « tv:… ») : la catégorie se déduit du titre (genre Animation +
 * langue japonaise). Les films d'animation japonais restent dans les films.
 */
export type Category = 'movie' | 'tv' | 'anime';

export const CATEGORIES: Category[] = ['movie', 'tv', 'anime'];

/** Type TMDB d'une catégorie (pour les appels à l'API et les clés). */
export const mediaOf = (c: Category): MediaType => (c === 'movie' ? 'movie' : 'tv');

const ANIMATION = 16;

/** Série d'animation japonaise (le pays d'origine n'est pas gardé dans la base : la langue suffit). */
export const isAnimeTitle = (t: Title) =>
  t.type === 'tv' && (t.genreIds ?? t.details?.genreIds ?? []).includes(ANIMATION) && (t.originalLanguage ?? t.details?.originalLanguage) === 'ja';

export const categoryOf = (t: Title): Category => (t.type === 'movie' ? 'movie' : isAnimeTitle(t) ? 'anime' : 'tv');

/** Libellés : « Films », « un film », « film »… */
export const CATEGORY_LABEL: Record<Category, { plural: string; one: string; badge: string; emoji: string; seen: string }> = {
  movie: { plural: 'films', one: 'film', badge: 'Film', emoji: '🎬', seen: 'vus' },
  tv: { plural: 'séries', one: 'série', badge: 'Série', emoji: '📺', seen: 'vues' },
  anime: { plural: 'animes', one: 'anime', badge: 'Anime', emoji: '🎌', seen: 'vus' },
};

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Catégorie de chaque série, gardée en mémoire : le genre et la langue d'un titre changent rarement
// (oubliée après une mise à jour du catalogue, au cas où TMDB aurait corrigé une fiche).
const animeCache = new Map<string, boolean>();
export const forgetCategories = () => animeCache.clear();

/** Garde, parmi des clés, celles de la catégorie `c` (d'après les titres de la base). */
export async function keysOfCategory(c: Category, keys: string[]): Promise<string[]> {
  const media = mediaOf(c);
  const ofMedia = keys.filter((k) => k.startsWith(`${media}:`));
  if (c === 'movie') return ofMedia;
  const unknown = ofMedia.filter((k) => !animeCache.has(k));
  if (unknown.length) {
    (await db.titles.bulkGet(unknown)).forEach((t, i) => {
      if (t) animeCache.set(unknown[i], isAnimeTitle(t)); // titre absent : on réessaiera plus tard
    });
  }
  // Titre inconnu : rangé avec les séries.
  return ofMedia.filter((k) => (animeCache.get(k) ?? false) === (c === 'anime'));
}

/** Les catégories affichées : sans les animes si l'utilisateur les a masqués. */
export function useCategories(): Category[] {
  const show = useLiveQuery(getShowAnime) ?? true;
  return show ? CATEGORIES : ['movie', 'tv'];
}

/** Options d'un sélecteur de catégorie ([valeur, libellé, info-bulle]). */
export const categoryOptions = (cats: Category[], tip: (c: Category) => string): [Category, string, string][] =>
  cats.map((c) => [c, capitalize(CATEGORY_LABEL[c].plural), tip(c)]);

export const asCategory = (s: string | undefined): Category => (s === 'tv' || s === 'anime' ? s : 'movie');
