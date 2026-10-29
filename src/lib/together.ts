import type { Status, Tier } from './db';
import type { Category } from './category';
import { priorityWeight } from './tonight';

/**
 * Comparaison entre deux comptes (logique pure). Chaque côté donne ses réponses et ses classements ;
 * pour un ami, seulement ce qu'il partage (wishlist, titres vus et classement).
 */
export interface Side {
  answers: Map<string, { status: Status; tier: Tier | null }>;
  /** Classements par liste, comme les clés meta : « movie », « tv », « anime », « wish:movie »… */
  rankings: Record<string, string[]>;
}

/** Catégorie d'une clé (d'après les titres connus) ; `undefined` si le titre est inconnu. */
export type CategoryOf = (key: string) => Category | undefined;

/** Position relative dans un classement : 0 = premier, 1 = dernier ; `undefined` si non classé. */
function relRank(ranking: string[], key: string): number | undefined {
  const i = ranking.indexOf(key);
  if (i === -1) return undefined;
  return ranking.length > 1 ? i / (ranking.length - 1) : 0;
}

export interface CommonWish {
  key: string;
  /** Priorités (n° dans chaque wishlist, à partir de 1), si priorisé. */
  mine?: number;
  theirs?: number;
  /** Poids pour le tirage « Ce soir à deux » : les priorités des deux comptent. */
  weight: number;
}

/**
 * Titres présents dans les deux wishlists, triés par priorités combinées
 * (un titre non priorisé compte comme le milieu de la liste).
 */
export function commonWishlist(me: Side, them: Side, type: Category, catOf: CategoryOf): CommonWish[] {
  const myRank = me.rankings[`wish:${type}`] ?? [];
  const theirRank = them.rankings[`wish:${type}`] ?? [];
  const list: (CommonWish & { score: number })[] = [];
  for (const [key, a] of me.answers) {
    if (a.status !== 'wish' || catOf(key) !== type || them.answers.get(key)?.status !== 'wish') continue;
    const i = myRank.indexOf(key);
    const j = theirRank.indexOf(key);
    list.push({
      key,
      mine: i === -1 ? undefined : i + 1,
      theirs: j === -1 ? undefined : j + 1,
      weight: (priorityWeight(i === -1 ? undefined : i, myRank.length) + priorityWeight(j === -1 ? undefined : j, theirRank.length)) / 2,
      score: (relRank(myRank, key) ?? 0.5) + (relRank(theirRank, key) ?? 0.5),
    });
  }
  return list.sort((a, b) => a.score - b.score).map(({ score: _score, ...w }) => w);
}

export interface Advice {
  key: string;
  /** N° dans le classement de celui qui conseille, s'il est classé. */
  rank?: number;
  good: boolean; // avis « bien »
  /** Déjà dans la wishlist de celui à qui on conseille. */
  inWishlist: boolean;
}

/**
 * Ce que `from` a aimé (avis « bien » ou premier tiers de son classement) et que `to` n'a pas vu.
 * Les « pas envie » de `to` sont écartés quand on les connaît (pour soi ; un ami ne les partage pas).
 */
export function advice(from: Side, to: Side, type: Category, catOf: CategoryOf, limit = 40): Advice[] {
  const ranking = from.rankings[type] ?? [];
  const list: (Advice & { score: number })[] = [];
  for (const [key, a] of from.answers) {
    if (a.status !== 'seen' || catOf(key) !== type) continue;
    const r = relRank(ranking, key);
    const good = a.tier === 'good';
    if (!good && (r === undefined || r > 1 / 3)) continue;
    const theirs = to.answers.get(key)?.status;
    if (theirs === 'seen' || theirs === 'unseen') continue;
    const i = ranking.indexOf(key);
    list.push({ key, rank: i === -1 ? undefined : i + 1, good, inWishlist: theirs === 'wish', score: r ?? 0.4 });
  }
  return list
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ score: _score, ...x }) => x);
}

export interface Match {
  /** Titres vus et classés par les deux. */
  common: number;
  /** 0 à 100 : 100 = même ordre, 50 = aucun lien, 0 = ordre inverse. */
  percent: number;
  /** Titres que les deux classent haut. */
  agree: { key: string; mine: number; theirs: number }[];
  /** Plus gros écarts de classement. */
  disagree: { key: string; mine: number; theirs: number }[];
}

/** Compatibilité des classements (tau de Kendall sur les titres classés par les deux). Au moins 5 titres communs. */
export function compatibility(me: Side, them: Side, type: Category, top = 5): Match | null {
  const mine = me.rankings[type] ?? [];
  const theirs = them.rankings[type] ?? [];
  const theirPos = new Map(theirs.map((k, i) => [k, i]));
  const common = mine.filter((k) => theirPos.has(k));
  const n = common.length;
  if (n < 5) return null;
  // Ordre de l'ami sur les titres communs, dans l'ordre des miens.
  const commonSet = new Set(common);
  const theirOrder = new Map(theirs.filter((k) => commonSet.has(k)).map((k, i) => [k, i]));
  const b = common.map((k) => theirOrder.get(k)!);
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (b[i] < b[j]) concordant++;
      else discordant++;
    }
  }
  const tau = (concordant - discordant) / ((n * (n - 1)) / 2);
  const rows = common.map((key, i) => ({ key, i, j: b[i], mine: mine.indexOf(key) + 1, theirs: theirPos.get(key)! + 1 }));
  const pick = ({ key, mine, theirs }: (typeof rows)[number]) => ({ key, mine, theirs });
  // Accords : dans la première moitié pour les deux, à peu près au même rang.
  // Désaccords : au moins 2 places et un quart des titres communs d'écart (positions parmi les titres communs).
  const agree = rows
    .filter((r) => Math.max(r.i, r.j) < n / 2 && Math.abs(r.i - r.j) <= Math.max(1, n / 10))
    .sort((x, y) => Math.max(x.i, x.j) - Math.max(y.i, y.j) || x.i + x.j - (y.i + y.j))
    .slice(0, top);
  const agreed = new Set(agree.map((r) => r.key));
  const disagree = rows
    .filter((r) => !agreed.has(r.key) && Math.abs(r.i - r.j) >= Math.max(2, Math.round(n / 4)))
    .sort((x, y) => Math.abs(y.i - y.j) - Math.abs(x.i - x.j))
    .slice(0, top);
  return { common: n, percent: Math.round(((tau + 1) / 2) * 100), agree: agree.map(pick), disagree: disagree.map(pick) };
}
