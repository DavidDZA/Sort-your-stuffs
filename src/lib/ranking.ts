import { db, getMeta, setMeta, setStatus, type Status, type Tier, type Title } from './db';
import { categoryOf, keysOfCategory, mediaOf, type Category } from './category';

/** Une liste classable : les titres vus ou la wishlist, d'une catégorie (films, séries, animes). */
export interface Scope {
  type: Category;
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
  const keys = await db.answers.where('[type+status]').equals([mediaOf(s.type), s.list]).primaryKeys();
  return new Set(await keysOfCategory(s.type, keys));
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

/**
 * Change le statut d'un titre en le retirant proprement du classement de son ancienne liste.
 * `tier` : avis « bien » / « bof » pour un titre vu (il décide seulement de l'ordre de passage en duel).
 */
export async function changeStatus(title: Title, status: Status, tier?: Tier): Promise<void> {
  const current = await db.answers.get(title.key);
  if (current && current.status !== status && current.status !== 'unseen') {
    await unrank({ type: categoryOf(title), list: current.status as 'seen' | 'wish' }, title.key);
  }
  await setStatus(title, status, status === 'seen' ? tier : undefined);
}

/**
 * Titres à placer en priorité : les « bien » d'abord, puis ceux sans avis,
 * et les « bof » seulement quand il ne reste plus qu'eux. Tous sont ensuite comparés
 * à l'ensemble du classement : un « bof » peut finir devant un « bien ».
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

/** Envoie un titre à la dernière place du classement (bouton poubelle sur un « bof »), sans duel. */
export const sendToLast = (ranking: string[], key: string) => [...ranking.filter((k) => k !== key), key];

/**
 * Fait remonter le titre en position `from` juste avant celui en position `to` (to < from) :
 * il était moins bien classé mais préféré. Les autres titres gardent leur ordre.
 * Pour deux voisins (to = from - 1), c'est un simple échange.
 */
export function promote(ranking: string[], from: number, to: number): string[] {
  const next = [...ranking];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Nombre de duels restants (au pire) pour placer le titre. */
export const duelsLeft = (s: InsertState) => Math.ceil(Math.log2(s.hi - s.lo + 1));

/**
 * Sépare les animes d'un classement de séries : ceux qui n'y sont pas déjà rejoignent le classement anime,
 * à la suite, dans leur ordre relatif ; le classement de séries garde le reste.
 */
export function splitAnime(tv: string[], anime: string[], isAnime: (key: string) => boolean): { tv: string[]; anime: string[] } {
  const inAnime = new Set(anime);
  const moved = tv.filter((k) => isAnime(k) && !inAnime.has(k));
  return { tv: tv.filter((k) => !isAnime(k)), anime: [...anime, ...moved] };
}

/**
 * Les animes étaient classés avec les séries avant d'avoir leur catégorie (et un appareil pas encore à jour
 * peut encore les y mettre) : on les déplace, sans perdre leur ordre. Sans effet s'il n'y a rien à déplacer.
 */
export async function splitAnimeRankings(): Promise<void> {
  for (const list of ['seen', 'wish'] as const) {
    const tvScope: Scope = { type: 'tv', list };
    const animeScope: Scope = { type: 'anime', list };
    const tv = [...new Set(await getMeta<string[]>(rankingKey(tvScope), []))];
    if (!tv.length) continue;
    const animeKeys = new Set(await keysOfCategory('anime', tv));
    if (!animeKeys.size) continue;
    const split = splitAnime(tv, await getMeta<string[]>(rankingKey(animeScope), []), (k) => animeKeys.has(k));
    await saveRanking(animeScope, split.anime);
    await saveRanking(tvScope, split.tv);
    // Les positions du classement de séries ont changé : placement en cours annulé.
    if (await loadInsert(tvScope)) await saveInsert(tvScope, null);
  }
}
