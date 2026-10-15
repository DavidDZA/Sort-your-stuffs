import { db, getMeta, setMeta, type MediaType, type Title } from './db';
import { isExcluded, tmdb, toTitle, type Page } from './tmdb';

/** Titre mis en avant au swipe : score (nombre de titres aimés qui le recommandent) et dernier titre source. */
export interface Boost {
  s: number;
  from: string;
}

export type Boosts = Record<string, Boost>;

const key = (type: MediaType) => `boosts:${type}`;
const MAX_BOOSTS = 3000;
const MIN_VOTES = 30;

export const loadBoosts = (type: MediaType) => getMeta<Boosts>(key(type), {});

/** Multiplicateur de poids au tirage : ×4 pour une recommandation, jusqu'à ×13. */
export const boostFactor = (b: Boost | undefined) => (b ? 1 + 3 * Math.min(b.s, 4) : 1);

/** Ajoute les recommandations d'un titre aimé aux mises en avant (on garde les plus fortes). */
export function mergeBoosts(boosts: Boosts, keys: string[], from: string): Boosts {
  const next = { ...boosts };
  for (const k of keys) next[k] = { s: (next[k]?.s ?? 0) + 1, from };
  const entries = Object.entries(next);
  if (entries.length <= MAX_BOOSTS) return next;
  return Object.fromEntries(entries.sort((a, b) => b[1].s - a[1].s).slice(0, MAX_BOOSTS));
}

/**
 * Titre aimé (👍) : récupère ses recommandations TMDB, les met en avant pour les prochains swipes
 * et renvoie les titres concernés (ajoutés à la base s'ils n'y étaient pas).
 */
export async function boostFrom(title: Title): Promise<Title[]> {
  try {
    const page = await tmdb<Page>(`/${title.type}/${title.tmdbId}/recommendations`);
    const found = page.results
      .filter((r) => !isExcluded(title.type, r) && (r.vote_count ?? 0) >= MIN_VOTES)
      .map((r) => ({ ...toTitle(title.type, r), manual: true }));
    if (!found.length) return [];
    const stored = await db.titles.bulkGet(found.map((t) => t.key));
    const titles = found.map((t, i) => stored[i] ?? t);
    const missing = titles.filter((_, i) => !stored[i]);
    if (missing.length) await db.titles.bulkPut(missing);
    await setMeta(key(title.type), mergeBoosts(await loadBoosts(title.type), titles.map((t) => t.key), title.title));
    return titles;
  } catch {
    return []; // hors ligne : pas de mise en avant cette fois
  }
}
