import type { Title } from './db';
import { availableOnMine, type MyProviders } from './providers';

export interface TonightFilters {
  type: 'all' | 'movie' | 'tv';
  mineOnly: boolean; // disponible sur mes abonnements
  short: boolean; // films de moins de 2 h
  genre: string | null; // nom de genre (fiche détaillée)
}

export const NO_FILTERS: TonightFilters = { type: 'all', mineOnly: false, short: false, genre: null };

export function matchesTonight(t: Title, f: TonightFilters, mine: MyProviders): boolean {
  if (f.type !== 'all' && t.type !== f.type) return false;
  const d = t.details;
  if (f.mineOnly && !(d && availableOnMine(d.providers.flatrate, mine))) return false;
  if (f.short && t.type === 'movie' && (!d?.runtime || d.runtime > 120)) return false;
  if (f.genre && !d?.genres.includes(f.genre)) return false;
  return true;
}

/**
 * Poids d'un titre selon sa priorité dans la wishlist : le n°1 pèse 4 fois plus
 * que le dernier classé ; un titre non priorisé pèse comme le milieu du classement.
 */
export function priorityWeight(rank: number | undefined, total: number): number {
  if (rank === undefined || total <= 1) return 2.5;
  return 1 + (3 * (total - 1 - rank)) / (total - 1);
}

/** Tirage pondéré ; `random` injectable pour les tests. */
export function pickWeighted<T>(items: { item: T; w: number }[], random = Math.random): T | null {
  const total = items.reduce((s, i) => s + i.w, 0);
  if (!items.length || total <= 0) return null;
  let r = random() * total;
  for (const { item, w } of items) {
    if (r < w) return item;
    r -= w;
  }
  return items[items.length - 1].item;
}
