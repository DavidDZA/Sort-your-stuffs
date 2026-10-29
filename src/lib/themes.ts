import type { MediaType, Title } from './db';
import { GENRES } from './genres';

/** Filtre sur une personne : sa filmographie (clés des titres) est retenue avec le filtre. */
export interface PersonFilter {
  id: number;
  name: string;
  keys: string[];
}

/**
 * Filtres (swipe, classement, wishlist) : une période, un réalisateur, un acteur, un genre, une langue
 * et une note minimum, chacun optionnel. Appelé « thème » à l'origine (sessions de swipe), d'où le nom.
 */
export interface Theme {
  period: string;
  genre: number | null;
  lang: string;
  minRating: number; // note TMDB minimum sur 10 (0 = pas de filtre)
  director?: PersonFilter | null;
  actor?: PersonFilter | null;
}

export const NO_THEME: Theme = { period: 'all', genre: null, lang: 'all', minRating: 0, director: null, actor: null };

const YEAR = new Date().getFullYear();

export const PERIODS: { id: string; label: string; match: (y: number) => boolean }[] = [
  { id: 'all', label: 'Toutes', match: () => true },
  { id: 'recent', label: '🆕 Sorties récentes', match: (y) => y >= YEAR - 1 },
  { id: '2020', label: '2020s', match: (y) => y >= 2020 },
  { id: '2010', label: '2010s', match: (y) => y >= 2010 && y < 2020 },
  { id: '2000', label: '2000s', match: (y) => y >= 2000 && y < 2010 },
  { id: '1990', label: '90s', match: (y) => y >= 1990 && y < 2000 },
  { id: '1980', label: '80s', match: (y) => y >= 1980 && y < 1990 },
  { id: '1970', label: '70s', match: (y) => y >= 1970 && y < 1980 },
  { id: 'old', label: 'Avant 1970', match: (y) => y < 1970 },
];

/** Langues proposées (code TMDB → libellé) ; « Autres langues » couvre toutes celles qui n'y sont pas. */
const NAMED_LANGS: [string, string][] = [
  ['fr', '🇫🇷 Français'],
  ['en', '🇬🇧 Anglais'],
  ['es', '🇪🇸 Espagnol'],
  ['it', '🇮🇹 Italien'],
  ['de', '🇩🇪 Allemand'],
  ['ko', '🇰🇷 Coréen'],
  ['ja', '🇯🇵 Japonais'],
];

export const LANGS: { id: string; label: string; match: (l: string) => boolean }[] = [
  { id: 'all', label: 'Toutes', match: () => true },
  ...NAMED_LANGS.map(([id, label]) => ({ id, label, match: (l: string) => l === id })),
  { id: 'other', label: '🌍 Autres langues', match: (l) => !NAMED_LANGS.some(([id]) => id === l) },
];

export const genreOptions = (type: MediaType) =>
  Object.entries(GENRES[type])
    .map(([id, label]) => ({ id: Number(id), label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));

export const isNoTheme = (t: Theme) => t.period === 'all' && t.genre === null && t.lang === 'all' && !t.minRating && !t.director && !t.actor;

// Filmographies en ensembles (recherche rapide sur des milliers de titres), calculés une fois par filtre.
const keySets = new WeakMap<PersonFilter, Set<string>>();
function inFilmography(person: PersonFilter, key: string): boolean {
  let keys = keySets.get(person);
  if (!keys) keySets.set(person, (keys = new Set(person.keys)));
  return keys.has(key);
}

/** Genres du titre : ceux du catalogue, sinon ceux de sa fiche détaillée. */
export const genreIdsOf = (t: Title): number[] => (t.genreIds?.length ? t.genreIds : (t.details?.genreIds ?? []));

/** Langue originale : celle du catalogue, sinon celle de la fiche détaillée. */
export const languageOf = (t: Title): string | undefined => t.originalLanguage ?? t.details?.originalLanguage;

/** Il manque des infos utiles aux filtres (langue, ou fiche détaillée absente / d'avant le 17/10) : à récupérer. */
/** Fiche à jour connue : jointe au titre (avec ses genres), ou signalée sur le titre (table details). */
const hasDetails = (t: Title) => (t.details ? t.details.genreIds !== undefined : !!t.detailsAt);

export const missingFilterInfo = (t: Title) => !languageOf(t) || !hasDetails(t);

/** Note TMDB connue du titre : celle du catalogue, sinon celle de sa fiche détaillée. */
export const ratingOf = (t: Title): number | null => t.rating ?? t.details?.rating ?? null;

/**
 * Note pas encore récupérée (catalogue téléchargé avant qu'on l'enregistre, fiche absente ou ancienne).
 * Un titre dont la fiche récente n'a pas de note n'est pas noté sur TMDB : rien à récupérer.
 */
export const ratingMissing = (t: Title) => ratingOf(t) === null && !hasDetails(t);

export function matchesTheme(title: Title, theme: Theme): boolean {
  const period = PERIODS.find((p) => p.id === theme.period);
  if (period && period.id !== 'all' && (title.year === null || !period.match(title.year))) return false;
  if (theme.director && !inFilmography(theme.director, title.key)) return false;
  if (theme.actor && !inFilmography(theme.actor, title.key)) return false;
  if (theme.genre !== null && !genreIdsOf(title).includes(theme.genre)) return false;
  const lang = LANGS.find((l) => l.id === theme.lang);
  const language = languageOf(title);
  if (lang && lang.id !== 'all' && (!language || !lang.match(language))) return false;
  if (theme.minRating > 0) {
    const rating = ratingOf(title);
    if (rating === null || rating < theme.minRating) return false;
  }
  return true;
}

/** Résumé du filtre (« Comédie · 90s · ⭐ 7+ »). Sans type (films et séries mélangés), pas de genre. */
export function themeLabel(type: MediaType | null, theme: Theme): string {
  if (isNoTheme(theme)) return 'Aucun filtre';
  const parts: string[] = [];
  if (type && theme.genre !== null) parts.push(GENRES[type][theme.genre] ?? '');
  if (theme.period !== 'all') parts.push(PERIODS.find((p) => p.id === theme.period)?.label ?? '');
  if (theme.director) parts.push(`🎥 ${theme.director.name}`);
  if (theme.actor) parts.push(`🎭 ${theme.actor.name}`);
  if (theme.lang !== 'all') parts.push(LANGS.find((l) => l.id === theme.lang)?.label ?? '');
  if (theme.minRating > 0) parts.push(`⭐ ${theme.minRating.toLocaleString('fr-FR')}+`);
  return parts.filter(Boolean).join(' · ') || 'Aucun filtre';
}

/** Filtre utilisable sur une liste : null si aucun filtre (tout passe). */
export const themeFilter = (theme: Theme): ((t: Title) => boolean) | null => (isNoTheme(theme) ? null : (t) => matchesTheme(t, theme));
