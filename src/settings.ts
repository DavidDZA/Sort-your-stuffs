const TOKEN_KEY = 'tmdb-token';
const VOTES_KEY = 'min-votes';

export interface MinVotes {
  movie: number;
  tv: number;
}

export const DEFAULT_MIN_VOTES: MinVotes = { movie: 150, tv: 50 };

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
const BUILT_IN_TOKEN: string = (import.meta.env.VITE_TMDB_TOKEN ?? '').trim();
export const hasBuiltInToken = BUILT_IN_TOKEN !== '';

/** Clé saisie dans les réglages, prioritaire sur la clé intégrée. */
export const getUserToken = () => read(TOKEN_KEY)?.trim() || null;
export const getToken = () => getUserToken() || BUILT_IN_TOKEN || null;
export const setToken = (token: string) => write(TOKEN_KEY, token.trim());

export function getMinVotes(): MinVotes {
  try {
    return { ...DEFAULT_MIN_VOTES, ...JSON.parse(read(VOTES_KEY) ?? '{}') };
  } catch {
    return DEFAULT_MIN_VOTES;
  }
}

export const setMinVotes = (v: MinVotes) => write(VOTES_KEY, JSON.stringify(v));
