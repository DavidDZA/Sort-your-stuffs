import type { MediaType, Title } from './db';
import { GENRES } from './genres';

/** Thème d'une session de swipe : une période, un genre et une langue (chacun optionnel). */
export interface Theme {
  period: string;
  genre: number | null;
  lang: string;
}

export const NO_THEME: Theme = { period: 'all', genre: null, lang: 'all' };

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

export const LANGS: { id: string; label: string; match: (l: string) => boolean }[] = [
  { id: 'all', label: 'Toutes', match: () => true },
  { id: 'fr', label: '🇫🇷 Français', match: (l) => l === 'fr' },
  { id: 'en', label: '🇬🇧 Anglais', match: (l) => l === 'en' },
  { id: 'other', label: '🌍 Autres langues', match: (l) => l !== 'fr' && l !== 'en' },
];

export const genreOptions = (type: MediaType) =>
  Object.entries(GENRES[type])
    .map(([id, label]) => ({ id: Number(id), label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));

export const isNoTheme = (t: Theme) => t.period === 'all' && t.genre === null && t.lang === 'all';

export function matchesTheme(title: Title, theme: Theme): boolean {
  const period = PERIODS.find((p) => p.id === theme.period);
  if (period && period.id !== 'all' && (title.year === null || !period.match(title.year))) return false;
  if (theme.genre !== null && !(title.genreIds ?? []).includes(theme.genre)) return false;
  const lang = LANGS.find((l) => l.id === theme.lang);
  if (lang && lang.id !== 'all' && (!title.originalLanguage || !lang.match(title.originalLanguage))) return false;
  return true;
}

export function themeLabel(type: MediaType, theme: Theme): string {
  if (isNoTheme(theme)) return 'Tout le catalogue';
  const parts: string[] = [];
  if (theme.genre !== null) parts.push(GENRES[type][theme.genre] ?? '');
  if (theme.period !== 'all') parts.push(PERIODS.find((p) => p.id === theme.period)?.label ?? '');
  if (theme.lang !== 'all') parts.push(LANGS.find((l) => l.id === theme.lang)?.label ?? '');
  return parts.filter(Boolean).join(' · ');
}
