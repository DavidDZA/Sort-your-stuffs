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
  priorityPool,
  readRanking,
  saveInsert,
  saveRanking,
  promote,
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

describe('« Vu » avec un avis', () => {
  it('enregistre l’avis donné au moment de marquer vu', async () => {
    await setStatus(makeTitle(1), 'wish');
    await changeStatus(makeTitle(1), 'seen', 'good');
    expect((await db.answers.get(k(1)))?.tier).toBe('good');
  });

  it('un vu qui change d’avis repasse en « non classé »', async () => {
    for (const id of [1, 2, 3]) await setStatus(makeTitle(id), 'seen', 'meh');
    await saveRanking(seen, [k(1), k(2), k(3)]);
    await changeStatus(makeTitle(2), 'seen', 'good');
    expect(await loadRanking(seen)).toEqual([k(1), k(3)]);
    expect(await unrankedKeys(seen, [k(1), k(3)])).toEqual([k(2)]);
    // Même avis : il reste à sa place.
    await changeStatus(makeTitle(1), 'seen', 'meh');
    expect(await loadRanking(seen)).toEqual([k(1), k(3)]);
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
    const none = (n: number) => Array.from({ length: n }, () => undefined);
    expect(pickVerifyPair(none(1))).toBeNull();
    expect(pickVerifyPair(none(2), () => 0.99)).toBe(0);
    expect(pickVerifyPair(none(10), () => 0)).toBe(0);
    expect(pickVerifyPair(none(10), () => 0.999)).toBe(8); // dernier couple : 8 et 9
  });

  it('vérifie en priorité les titres « bien »', () => {
    // bien, bien, bien, bof, bof : seuls les couples 0-1 et 1-2 sont proposés.
    const tiers = ['good', 'good', 'good', 'meh', 'meh'] as const;
    expect(pickVerifyPair([...tiers], () => 0)).toBe(0);
    expect(pickVerifyPair([...tiers], () => 0.999)).toBe(1);
    // Que des « bof » : on vérifie quand même.
    expect(pickVerifyPair(['meh', 'meh', 'meh'], () => 0.999)).toBe(1);
  });

  it('place les « bien » d’abord, les « bof » en dernier', () => {
    expect(priorityPool(['a', 'b', 'c', 'd'], ['meh', 'good', undefined, 'good'])).toEqual(['b', 'd']);
    expect(priorityPool(['a', 'b', 'c'], ['meh', undefined, 'meh'])).toEqual(['b']);
    expect(priorityPool(['a', 'b'], ['meh', 'meh'])).toEqual(['a', 'b']);
  });

  it('échange deux voisins sans toucher au reste', () => {
    const r = ['a', 'b', 'c', 'd'];
    expect(promote(r, 2, 1)).toEqual(['a', 'c', 'b', 'd']);
    expect(r).toEqual(['a', 'b', 'c', 'd']); // l'original n'est pas modifié
  });

  it('fait remonter un titre au-dessus d’un voisin de la sélection filtrée', () => {
    // Sélection filtrée : a et d (b et c n'en font pas partie). d préféré à a : d passe juste avant a.
    expect(promote(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });
});
