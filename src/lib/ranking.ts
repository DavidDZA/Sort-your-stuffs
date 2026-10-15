import { db, getMeta, setMeta, setStatus, type MediaType, type Status, type Tier, type Title } from './db';

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

/**
 * Intervalle de départ pour placer un titre vu. Avec l'avis donné au swipe (mode 4 coins),
 * un titre « bien » se place au-dessus de tous les « bof », et inversement : moins de duels.
 */
export async function initialBounds(s: Scope, ranking: string[], key: string): Promise<{ lo: number; hi: number }> {
  const full = { lo: 0, hi: ranking.length };
  if (s.list !== 'seen') return full;
  const [answer, ...ranked] = await db.answers.bulkGet([key, ...ranking]);
  const tiers = ranked.map((a) => a?.tier);
  let bounds = full;
  if (answer?.tier === 'good') {
    const firstMeh = tiers.indexOf('meh');
    bounds = { lo: 0, hi: firstMeh === -1 ? ranking.length : firstMeh };
  } else if (answer?.tier === 'meh') {
    bounds = { lo: tiers.lastIndexOf('good') + 1, hi: ranking.length };
  }
  return bounds.lo <= bounds.hi ? bounds : full;
}

/**
 * Titres à placer en priorité : les « bien » d'abord, puis ceux sans avis,
 * et les « bof » seulement quand il ne reste plus qu'eux.
 */
export function priorityPool(keys: string[], tiers: (Tier | undefined)[]): string[] {
  const good = keys.filter((_, i) => tiers[i] === 'good');
  if (good.length) return good;
  const unrated = keys.filter((_, i) => !tiers[i]);
  return unrated.length ? unrated : keys;
}

/**
 * Duel de vérification : choisit deux titres voisins du classement (indices i et i + 1),
 * de préférence parmi les « bien » et les titres sans avis (les « bof » comptent moins).
 */
export function pickVerifyPair(tiers: (Tier | undefined)[], random = Math.random): number | null {
  const all = Array.from({ length: Math.max(0, tiers.length - 1) }, (_, i) => i);
  if (!all.length) return null;
  const focus = all.filter((i) => tiers[i] !== 'meh' && tiers[i + 1] !== 'meh');
  const choices = focus.length ? focus : all;
  return choices[Math.floor(random() * choices.length)];
}

/** Avis bien / bof des titres (seulement pour les titres vus ; la wishlist n'en a pas). */
export async function tiersOf(s: Scope, keys: string[]): Promise<(Tier | undefined)[]> {
  if (s.list !== 'seen') return keys.map(() => undefined);
  return (await db.answers.bulkGet(keys)).map((a) => a?.tier);
}

/** Échange les titres aux positions i et i + 1 (le second était préféré). */
export function swapAdjacent(ranking: string[], i: number): string[] {
  const next = [...ranking];
  [next[i], next[i + 1]] = [next[i + 1], next[i]];
  return next;
}

/** Nombre de duels restants (au pire) pour placer le titre. */
export const duelsLeft = (s: InsertState) => Math.ceil(Math.log2(s.hi - s.lo + 1));
