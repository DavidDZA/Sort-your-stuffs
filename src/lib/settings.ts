import { db, getMeta, setMeta } from './db';

const TOKEN_KEY = 'tmdb-token';
const VOTES_KEY = 'min-votes';

export interface MinVotes {
  movie: number;
  tv: number;
  anime: number;
}

export const DEFAULT_MIN_VOTES: MinVotes = { movie: 1000, tv: 50, anime: 50 };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible (navigation privée…) : la valeur ne sera pas retenue.
  }
}

/** Clé intégrée au site lors du déploiement (secret GitHub TMDB_TOKEN), vide en local. */
const BUILT_IN_TOKEN: string = (import.meta.env?.VITE_TMDB_TOKEN ?? '').trim();
export const hasBuiltInToken = BUILT_IN_TOKEN !== '';

/** Clé saisie dans les réglages, prioritaire sur la clé intégrée. */
export const getUserToken = () => read(TOKEN_KEY)?.trim() || null;
export const getToken = () => getUserToken() || BUILT_IN_TOKEN || null;
export const setToken = (token: string) => write(TOKEN_KEY, token.trim());

// Seuils de votes du catalogue : dans la base (meta « min-votes »), synchronisés avec le compte.
// Deux appareils avec des seuils différents s'effaceraient l'un l'autre des titres à chaque mise à jour.
const VOTES_META = 'min-votes';

export async function getMinVotes(): Promise<MinVotes> {
  return { ...DEFAULT_MIN_VOTES, ...(await getMeta<Partial<MinVotes> | null>(VOTES_META, null)) };
}

export const setMinVotes = (v: MinVotes) => setMeta(VOTES_META, v);

// Afficher la catégorie Animes (tuiles, onglets) : synchronisé avec le compte. Les animes restent au catalogue.
const SHOW_ANIME_META = 'show-anime';
export const getShowAnime = () => getMeta<boolean>(SHOW_ANIME_META, true);
export const setShowAnime = (v: boolean) => setMeta(SHOW_ANIME_META, v);

/** Les seuils étaient dans localStorage avant la synchro par compte : repris une fois dans la base. */
export async function migrateMinVotes(): Promise<void> {
  const raw = read(VOTES_KEY);
  if (!raw) return;
  try {
    if (!(await db.meta.get(VOTES_META))) await setMinVotes({ ...DEFAULT_MIN_VOTES, ...JSON.parse(raw) });
    localStorage.removeItem(VOTES_KEY);
  } catch {
    // Valeur illisible ou stockage indisponible : les seuils par défaut s'appliquent.
  }
}

const PROVIDERS_KEY = 'my-providers';

/** Ancien format : identifiants TMDB des plateformes cochées (remplacé par les familles, converti à l'ouverture des réglages). */
export function getMyProviders(): number[] {
  try {
    const v = JSON.parse(read(PROVIDERS_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export const setMyProviders = (ids: number[]) => write(PROVIDERS_KEY, JSON.stringify(ids));

const FAMILIES_KEY = 'my-provider-families';

/** Plateformes auxquelles l'utilisateur est abonné, par famille (voir lib/providers.ts). */
export function getMyProviderFamilies(): string[] {
  try {
    const v = JSON.parse(read(FAMILIES_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export const setMyProviderFamilies = (families: string[]) => write(FAMILIES_KEY, JSON.stringify(families));

/** Lecture / écriture JSON générique pour les petites préférences (thème de swipe…). */
export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = read(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export const writePref = (key: string, value: unknown) => write(key, JSON.stringify(value));

export type SwipeMode = 'horizontal' | 'corners';
const MODE_KEY = 'swipe-mode';

/** « 4 coins » (un seul geste, par défaut) ou « 2 directions » (vu / pas vu puis une 2e question). */
export const getSwipeMode = (): SwipeMode => (read(MODE_KEY) === 'horizontal' ? 'horizontal' : 'corners');
export const setSwipeMode = (mode: SwipeMode) => write(MODE_KEY, mode);
