import type { Provider } from './db';
import { getMyProviderFamilies, getMyProviders } from './settings';

/**
 * Variantes d'une même plateforme chez TMDB / JustWatch : offre avec pub, abonnement passant par
 * Amazon ou Apple, offre « Premium »… (« Netflix Standard with Ads », « HBO Max Amazon Channel »).
 */
const VARIANT_SUFFIXES = [
  /\s+amazon\s+channel$/i,
  /\s+apple\s+tv\s+channel$/i,
  /\s+roku\s+premium\s+channel$/i,
  /\s+(standard|basic)\s+with\s+ads$/i,
  /\s+with\s+ads$/i,
  /\s+premium$/i,
  /\s+channel$/i,
];

/** Nom de la plateforme sans la variante : « HBO Max Amazon Channel » → « HBO Max ». */
export function providerLabel(name: string): string {
  let label = name.replace(/\s+/g, ' ').trim();
  let previous;
  do {
    previous = label;
    for (const suffix of VARIANT_SUFFIXES) label = label.replace(suffix, '').trim();
  } while (label !== previous);
  return label;
}

/** Clé commune à toutes les variantes : « Paramount Plus », « Paramount+ » et « M6plus » / « M6+ » se rejoignent. */
export function providerFamily(name: string): string {
  return providerLabel(name)
    .toLowerCase()
    .replace(/\s*plus\b/g, '+')
    .replace(/[^a-z0-9+]/g, '');
}

export interface ProviderGroup {
  key: string;
  label: string;
  logo: string | null;
  ids: number[];
  names: string[]; // noms de toutes les variantes regroupées
}

/** Une entrée par famille, dans l'ordre d'arrivée (le 1er représentant est le mieux placé chez TMDB). */
export function groupProviders(list: Provider[]): ProviderGroup[] {
  const groups = new Map<string, ProviderGroup>();
  for (const p of list) {
    const key = providerFamily(p.name);
    const group = groups.get(key);
    if (group) {
      group.ids.push(p.id);
      group.names.push(p.name);
    } else {
      groups.set(key, { key, label: providerLabel(p.name), logo: p.logo, ids: [p.id], names: [p.name] });
    }
  }
  return [...groups.values()];
}

/** Mes abonnements : familles cochées, et anciens identifiants (avant le regroupement des variantes). */
export interface MyProviders {
  families: Set<string>;
  legacyIds: Set<number>;
}

export const loadMyProviders = (): MyProviders => ({
  families: new Set(getMyProviderFamilies()),
  legacyIds: new Set(getMyProviders()),
});

export const hasMyProviders = (m: MyProviders) => m.families.size + m.legacyIds.size > 0;

export const isMineGroup = (g: ProviderGroup, m: MyProviders) => m.families.has(g.key) || g.ids.some((id) => m.legacyIds.has(id));

/** Le titre est-il disponible en abonnement sur l'une de mes plateformes (toutes variantes comprises) ? */
export const availableOnMine = (flatrate: Provider[], m: MyProviders) => groupProviders(flatrate).some((g) => isMineGroup(g, m));
