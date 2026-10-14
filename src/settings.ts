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

export const getToken = () => read(TOKEN_KEY)?.trim() || null;
export const setToken = (token: string) => write(TOKEN_KEY, token.trim());

export function getMinVotes(): MinVotes {
  try {
    return { ...DEFAULT_MIN_VOTES, ...JSON.parse(read(VOTES_KEY) ?? '{}') };
  } catch {
    return DEFAULT_MIN_VOTES;
  }
}

export const setMinVotes = (v: MinVotes) => write(VOTES_KEY, JSON.stringify(v));
