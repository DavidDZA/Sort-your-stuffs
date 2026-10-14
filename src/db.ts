import Dexie, { type EntityTable } from 'dexie';

export type MediaType = 'movie' | 'tv';
export type Status = 'seen' | 'unseen' | 'wish';

export interface Title {
  key: string; // "movie:550" ou "tv:1399"
  type: MediaType;
  tmdbId: number;
  title: string;
  originalTitle: string;
  year: number | null;
  posterPath: string | null;
  overview: string;
  voteCount: number;
  popularity: number;
  manual?: boolean; // ajouté via la recherche, hors catalogue
  credits?: Credits; // chargé à la demande, puis gardé en cache
}

export interface Credits {
  directors: string[]; // réalisateur(s) pour un film, créateur(s) pour une série
  cast: string[]; // acteurs principaux
}

export interface Answer {
  key: string;
  type: MediaType;
  status: Status;
  updatedAt: number;
}

export interface Meta {
  key: string;
  value: unknown;
}

export const db = new Dexie('sort-my-stuffs') as Dexie & {
  titles: EntityTable<Title, 'key'>;
  answers: EntityTable<Answer, 'key'>;
  meta: EntityTable<Meta, 'key'>;
};

db.version(1).stores({
  titles: 'key, type',
  answers: 'key, type, status, [type+status], updatedAt',
  meta: 'key',
});

export const TYPE_LABEL: Record<MediaType, string> = { movie: 'Film', tv: 'Série' };

export const titleKey = (type: MediaType, tmdbId: number) => `${type}:${tmdbId}`;

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** Enregistre une réponse ; ajoute le titre à la base s'il n'y est pas encore (ajout manuel). */
export async function setStatus(title: Title, status: Status): Promise<void> {
  await db.transaction('rw', db.titles, db.answers, async () => {
    if (!(await db.titles.get(title.key))) await db.titles.put(title);
    await db.answers.put({ key: title.key, type: title.type, status, updatedAt: Date.now() });
  });
}

export async function clearStatus(key: string): Promise<void> {
  await db.answers.delete(key);
}

export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Pas grave : le stockage reste utilisable, juste moins protégé.
  }
}
