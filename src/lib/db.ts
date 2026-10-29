import Dexie, { type EntityTable } from 'dexie';

export type MediaType = 'movie' | 'tv';
export type Status = 'seen' | 'unseen' | 'wish';
/** Avis rapide donné au swipe en mode 4 coins : sert à pré-classer les titres vus. */
export type Tier = 'good' | 'meh';

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
  rating?: number; // note moyenne TMDB sur 10 (catalogue)
  genreIds?: number[];
  originalLanguage?: string;
  manual?: boolean; // ajouté via la recherche, hors catalogue
  detailsAt?: number; // date de la fiche détaillée enregistrée (table details), si elle est à jour
  collectionId?: number | null; // saga du film, connue dès que sa fiche a été lue (null : aucune)
  /**
   * Fiche détaillée, jointe en mémoire par `withDetails` : elle est rangée à part (table details),
   * pour que le catalogue reste léger à lire. Jamais enregistrée avec le titre.
   */
  details?: Details;
}

/** Fiche détaillée telle qu'enregistrée : une ligne par titre. */
export type DetailsRow = Details & { key: string };

export interface Provider {
  id: number;
  name: string;
  logo: string | null;
}

/** Fiche détaillée TMDB, chargée au premier affichage. */
export interface Details {
  fetchedAt: number;
  directors: string[]; // réalisateur(s) pour un film, créateur(s) pour une série
  cast: string[]; // acteurs principaux
  topCast?: string[]; // premiers rôles (8), pour les stats ; absents des fiches d'avant le 17/10
  genres: string[];
  genreIds?: number[]; // absents des fiches enregistrées avant le 17/10 (récupérées à nouveau)
  originalLanguage?: string;
  rating: number | null; // note moyenne TMDB sur 10
  runtime: number | null; // durée du film, ou d'un épisode pour une série (minutes)
  seasons?: number;
  episodes?: number;
  collection?: { id: number; name: string } | null; // saga
  trailer?: string | null; // clé YouTube
  providers: { flatrate: Provider[]; rent: Provider[]; buy: Provider[]; link: string | null }; // France
}

export interface Answer {
  key: string;
  type: MediaType;
  status: Status;
  tier?: Tier;
  updatedAt: number;
}

export interface Meta {
  key: string;
  value: unknown;
  updatedAt?: number; // date de modification (absente des lignes écrites avant la synchro par compte)
}

/**
 * Synchro par compte : dernière version envoyée au compte ou reçue de lui, par ligne (« a:<clé> » réponse,
 * « m:<clé> » meta), et état de la synchro (« state:… » : compte, curseurs), hors de la table meta.
 */
export interface Synced {
  id: string;
  hash: string;
}

export const db = new Dexie('sort-my-stuffs') as Dexie & {
  titles: EntityTable<Title, 'key'>;
  answers: EntityTable<Answer, 'key'>;
  meta: EntityTable<Meta, 'key'>;
  synced: EntityTable<Synced, 'id'>;
  details: EntityTable<DetailsRow, 'key'>;
};

db.version(1).stores({
  titles: 'key, type',
  answers: 'key, type, status, [type+status], updatedAt',
  meta: 'key',
});

db.version(2).stores({ synced: 'id' });

// Les fiches détaillées quittent la table des titres : le swipe lit le catalogue sans elles.
db.version(3)
  .stores({ details: 'key' })
  .upgrade(async (tx) => {
    const rows: DetailsRow[] = [];
    await tx
      .table('titles')
      .toCollection()
      .modify((t: Title) => {
        if (!t.details) return;
        rows.push({ ...t.details, key: t.key });
        Object.assign(t, detailsMarks(t.type, t.details));
        delete t.details;
      });
    await tx.table('details').bulkPut(rows);
  });

/** Repères gardés sur le titre quand sa fiche est connue (sans avoir à la relire). */
export function detailsMarks(type: MediaType, d: Details): Pick<Title, 'detailsAt' | 'collectionId'> {
  const marks: Pick<Title, 'detailsAt' | 'collectionId'> = {};
  if (d.genreIds !== undefined) marks.detailsAt = d.fetchedAt; // fiche d'avant le 17/10 : à récupérer à nouveau
  if (type === 'movie' && d.collection !== undefined) marks.collectionId = d.collection?.id ?? null;
  return marks;
}

// Garde-fou : une fiche jointe en mémoire n'est jamais enregistrée avec le titre.
db.titles.hook('creating', (_key, t) => {
  delete t.details;
});
db.titles.hook('updating', (changes) => ('details' in changes ? { details: undefined } : undefined));

const withoutKey = ({ key: _key, ...d }: DetailsRow): Details => d;

/** Joint aux titres leur fiche détaillée enregistrée (pour les filtres, stats, plateformes…). */
export async function withDetails(titles: Title[]): Promise<Title[]> {
  const rows = await db.details.bulkGet(titles.map((t) => t.key));
  return titles.map((t, i) => (rows[i] ? { ...t, details: withoutKey(rows[i]!) } : t));
}

export async function getDetails(key: string): Promise<Details | undefined> {
  const row = await db.details.get(key);
  return row && withoutKey(row);
}

/** Données de la table meta qui suivent le compte (et la sauvegarde) ; le reste est propre à l'appareil. */
export const isUserMeta = (key: string) =>
  /^(ranking:|saga:|boosts:)/.test(key) || key === 'activity' || key === 'badges' || key === 'min-votes' || key === 'show-anime';

export const titleKey = (type: MediaType, tmdbId: number) => `${type}:${tmdbId}`;

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value, updatedAt: Date.now() });
}

/** Enregistre une réponse ; ajoute le titre à la base s'il n'y est pas encore (ajout manuel). */
export async function setStatus(title: Title, status: Status, tier?: Tier): Promise<void> {
  await db.transaction('rw', db.titles, db.answers, async () => {
    if (!(await db.titles.get(title.key))) await db.titles.put(title);
    await db.answers.put({ key: title.key, type: title.type, status, ...(tier ? { tier } : {}), updatedAt: Date.now() });
  });
}

export async function clearStatus(key: string): Promise<void> {
  await db.answers.delete(key);
}

/**
 * Efface tous les choix : réponses, classements, activité, et les titres ajoutés à la main
 * (hors catalogue). Le catalogue téléchargé et la clé TMDB sont conservés.
 */
export async function clearChoices(): Promise<void> {
  await db.transaction('rw', db.titles, db.answers, db.meta, db.details, async () => {
    await db.answers.clear();
    await db.meta.where('key').notEqual('lastSync').delete();
    const manual = await db.titles.filter((t) => !!t.manual).primaryKeys();
    await db.titles.bulkDelete(manual);
    await db.details.bulkDelete(manual);
  });
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
