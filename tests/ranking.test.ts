import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, setStatus } from '../src/lib/db';
import {
  changeStatus,
  duelsLeft,
  initialBounds,
  loadInsert,
  loadRanking,
  pickVerifyPair,
  readRanking,
  saveInsert,
  saveRanking,
  swapAdjacent,
  unrankedKeys,
  type Scope,
} from '../src/lib/ranking';
import { makeTitle } from './helpers';

const seen: Scope = { type: 'movie', list: 'seen' };
const wish: Scope = { type: 'movie', list: 'wish' };
const k = (id: number) => `movie:${id}`;

beforeEach(async () => {
  await Promise.all([db.titles.clear(), db.answers.clear(), db.meta.clear()]);
});

describe('classement', () => {
  it('ignore les titres qui ne sont plus « vus »', async () => {
    await setStatus(makeTitle(1), 'seen');
    await setStatus(makeTitle(2), 'wish');
    await saveRanking(seen, [k(1), k(2), k(1)]);
    expect(await readRanking(seen)).toEqual([k(1)]);
    expect(await loadRanking(seen)).toEqual([k(1)]); // et enregistre la version nettoyée
  });

  it('liste les titres vus pas encore classés', async () => {
    for (const id of [1, 2, 3]) await setStatus(makeTitle(id), 'seen');
    await saveRanking(seen, [k(2)]);
    expect((await unrankedKeys(seen, [k(2)])).sort()).toEqual([k(1), k(3)]);
  });

  it('retire un titre du classement de son ancienne liste quand il change de statut', async () => {
    for (const id of [1, 2, 3]) await setStatus(makeTitle(id), 'seen');
    await saveRanking(seen, [k(1), k(2), k(3)]);
    await saveInsert(seen, { key: k(9), lo: 0, hi: 3 });
    await changeStatus(makeTitle(2), 'wish');
    expect(await loadRanking(seen)).toEqual([k(1), k(3)]);
    expect(await loadInsert(seen)).toBeNull(); // les positions ont changé : placement annulé
    expect(await unrankedKeys(wish, [])).toEqual([k(2)]);
  });

  it('change de statut sans perdre l’avis bien / bof si on ne le précise pas… (il est remis à zéro)', async () => {
    await setStatus(makeTitle(1), 'seen', 'good');
    await changeStatus(makeTitle(1), 'wish');
    expect((await db.answers.get(k(1)))?.tier).toBeUndefined();
  });
});

describe('avis bien / bof', () => {
  beforeEach(async () => {
    // Classement : 1 (bien) 2 (bien) 3 (sans avis) 4 (bof) 5 (bof)
    await setStatus(makeTitle(1), 'seen', 'good');
    await setStatus(makeTitle(2), 'seen', 'good');
    await setStatus(makeTitle(3), 'seen');
    await setStatus(makeTitle(4), 'seen', 'meh');
    await setStatus(makeTitle(5), 'seen', 'meh');
  });
  const ranking = [k(1), k(2), k(3), k(4), k(5)];

  it('place un « bien » au-dessus de tous les « bof »', async () => {
    await setStatus(makeTitle(10), 'seen', 'good');
    expect(await initialBounds(seen, ranking, k(10))).toEqual({ lo: 0, hi: 3 });
  });

  it('place un « bof » sous tous les « bien »', async () => {
    await setStatus(makeTitle(11), 'seen', 'meh');
    expect(await initialBounds(seen, ranking, k(11))).toEqual({ lo: 2, hi: 5 });
  });

  it('compare un titre sans avis à tout le classement', async () => {
    await setStatus(makeTitle(12), 'seen');
    expect(await initialBounds(seen, ranking, k(12))).toEqual({ lo: 0, hi: 5 });
  });

  it('place sans duel quand la place est évidente', async () => {
    await setStatus(makeTitle(10), 'seen', 'good');
    expect(await initialBounds(seen, [k(4), k(5)], k(10))).toEqual({ lo: 0, hi: 0 });
  });

  it('ne tient pas compte des avis pour la wishlist', async () => {
    await setStatus(makeTitle(10), 'seen', 'good');
    expect(await initialBounds(wish, ranking, k(10))).toEqual({ lo: 0, hi: 5 });
  });
});

describe('duels', () => {
  it('estime le nombre de duels restants (dichotomie)', () => {
    expect(duelsLeft({ key: 'x', lo: 0, hi: 1 })).toBe(1);
    expect(duelsLeft({ key: 'x', lo: 0, hi: 500 })).toBe(9);
  });

  it('choisit deux voisins pour une vérification', () => {
    expect(pickVerifyPair(1)).toBeNull();
    expect(pickVerifyPair(2, () => 0.99)).toBe(0);
    expect(pickVerifyPair(10, () => 0)).toBe(0);
    expect(pickVerifyPair(10, () => 0.999)).toBe(8); // dernier couple : 8 et 9
  });

  it('échange deux voisins sans toucher au reste', () => {
    const r = ['a', 'b', 'c', 'd'];
    expect(swapAdjacent(r, 1)).toEqual(['a', 'c', 'b', 'd']);
    expect(r).toEqual(['a', 'b', 'c', 'd']); // l'original n'est pas modifié
  });
});
