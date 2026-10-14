import { db, getMeta, setMeta, setStatus, type MediaType, type Status, type Title } from './db';

/** Une liste classable : les titres vus ou la wishlist, pour les films ou les séries. */
export interface Scope {
  type: MediaType;
  list: 'seen' | 'wish';
}

/** Insertion dichotomique en cours : le titre `key` sera placé entre les positions lo et hi. */
export interface InsertState {
  key: string;
  lo: number;
  hi: number;
}

export const scopeId = (s: Scope) => (s.list === 'seen' ? s.type : `wish:${s.type}`);
const rankingKey = (s: Scope) => `ranking:${scopeId(s)}`;
const insertKey = (s: Scope) => `insert:${scopeId(s)}`;

async function poolKeys(s: Scope): Promise<Set<string>> {
  return new Set(await db.answers.where('[type+status]').equals([s.type, s.list]).primaryKeys());
}

/** Classement (du premier au dernier), sans les titres qui ont quitté la liste. Lecture seule. */
export async function readRanking(s: Scope): Promise<string[]> {
  const pool = await poolKeys(s);
  const raw = await getMeta<string[]>(rankingKey(s), []);
  return [...new Set(raw)].filter((k) => pool.has(k));
}

/** Comme readRanking, mais enregistre la version nettoyée si besoin. */
export async function loadRanking(s: Scope): Promise<string[]> {
  const raw = await getMeta<string[]>(rankingKey(s), []);
  const ranking = await readRanking(s);
  if (ranking.length !== raw.length) await saveRanking(s, ranking);
  return ranking;
}

export const saveRanking = (s: Scope, ranking: string[]) => setMeta(rankingKey(s), ranking);

export async function unrankedKeys(s: Scope, ranking: string[]): Promise<string[]> {
  const ranked = new Set(ranking);
  return [...(await poolKeys(s))].filter((k) => !ranked.has(k));
}

export const loadInsert = (s: Scope) => getMeta<InsertState | null>(insertKey(s), null);
export const saveInsert = (s: Scope, state: InsertState | null) => setMeta(insertKey(s), state);

/** Retire un titre du classement ; il redevient « non classé ». */
export async function unrank(s: Scope, key: string): Promise<void> {
  const ranking = await loadRanking(s);
  const insert = await loadInsert(s);
  if (ranking.includes(key)) {
    await saveRanking(
      s,
      ranking.filter((k) => k !== key),
    );
    await saveInsert(s, null); // les positions changent : on repart d'un placement neuf
  } else if (insert?.key === key) {
    await saveInsert(s, null);
  }
}

/** Change le statut d'un titre en le retirant proprement du classement de son ancienne liste. */
export async function changeStatus(title: Title, status: Status): Promise<void> {
  const current = await db.answers.get(title.key);
  if (current && current.status !== status && current.status !== 'unseen') {
    await unrank({ type: title.type, list: current.status }, title.key);
  }
  await setStatus(title, status);
}

/** Nombre de duels restants (au pire) pour placer le titre. */
export const duelsLeft = (s: InsertState) => Math.ceil(Math.log2(s.hi - s.lo + 1));
