import { db, getMeta, setMeta, type MediaType } from './db';

/** Insertion dichotomique en cours : le titre `key` sera placé entre les positions lo et hi. */
export interface InsertState {
  key: string;
  lo: number;
  hi: number;
}

const rankingKey = (type: MediaType) => `ranking:${type}`;
const insertKey = (type: MediaType) => `insert:${type}`;

async function seenKeys(type: MediaType): Promise<Set<string>> {
  return new Set(await db.answers.where('[type+status]').equals([type, 'seen']).primaryKeys());
}

/** Classement (du préféré au moins aimé), sans les titres qui ne sont plus « vus ». Lecture seule. */
export async function readRanking(type: MediaType): Promise<string[]> {
  const seen = await seenKeys(type);
  const raw = await getMeta<string[]>(rankingKey(type), []);
  return [...new Set(raw)].filter((k) => seen.has(k));
}

/** Comme readRanking, mais enregistre la version nettoyée si besoin. */
export async function loadRanking(type: MediaType): Promise<string[]> {
  const raw = await getMeta<string[]>(rankingKey(type), []);
  const ranking = await readRanking(type);
  if (ranking.length !== raw.length) await saveRanking(type, ranking);
  return ranking;
}

export const saveRanking = (type: MediaType, ranking: string[]) => setMeta(rankingKey(type), ranking);

export async function unrankedKeys(type: MediaType, ranking: string[]): Promise<string[]> {
  const ranked = new Set(ranking);
  return [...(await seenKeys(type))].filter((k) => !ranked.has(k));
}

export const loadInsert = (type: MediaType) => getMeta<InsertState | null>(insertKey(type), null);
export const saveInsert = (type: MediaType, state: InsertState | null) => setMeta(insertKey(type), state);

/** Nombre de duels restants (au pire) pour placer le titre. */
export const duelsLeft = (s: InsertState) => Math.ceil(Math.log2(s.hi - s.lo + 1));
