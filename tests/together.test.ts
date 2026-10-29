import { describe, expect, it } from 'vitest';
import { advice, commonWishlist, compatibility, type Side } from '../src/lib/together';
import { plan } from '../src/lib/cloudMerge';
import type { Status, Tier } from '../src/lib/db';

const m = (id: number) => `movie:${id}`;

function side(answers: [number, Status, Tier?][], rankings: Record<string, number[]> = {}): Side {
  return {
    answers: new Map(answers.map(([id, status, tier]) => [m(id), { status, tier: tier ?? null }])),
    rankings: Object.fromEntries(Object.entries(rankings).map(([k, ids]) => [k, ids.map(m)])),
  };
}

describe('wishlist commune', () => {
  it('garde les titres des deux wishlists, triés par priorités combinées', () => {
    const me = side([[1, 'wish'], [2, 'wish'], [3, 'wish'], [4, 'seen']], { 'wish:movie': [3, 2, 1] });
    const them = side([[1, 'wish'], [2, 'wish'], [3, 'wish'], [4, 'wish']], { 'wish:movie': [3, 1] });
    // 3 : n°1 des deux ; 2 : mon milieu, non priorisé chez lui (= milieu) ; 1 : dernier des deux.
    expect(commonWishlist(me, them, 'movie').map((w) => [w.key, w.mine, w.theirs])).toEqual([
      [m(3), 1, 1],
      [m(2), 2, undefined],
      [m(1), 3, 2],
    ]);
  });

  it('ne mélange pas films et séries', () => {
    const me = side([[1, 'wish']]);
    expect(commonWishlist(me, me, 'tv')).toEqual([]);
  });
});

describe('conseils', () => {
  it('propose ce que l’autre a aimé ou classé haut, pas ce que j’ai vu ou refusé', () => {
    const them = side(
      [[1, 'seen', 'good'], [2, 'seen'], [3, 'seen'], [4, 'seen'], [5, 'seen', 'meh'], [6, 'seen', 'good'], [7, 'seen', 'good']],
      { movie: [2, 1, 3, 4, 5, 6] },
    );
    const me = side([[6, 'seen'], [7, 'unseen'], [1, 'wish']]);
    const list = advice(them, me, 'movie');
    // 2 : n°1 sans avis ; 1 : « bien » et dans ma wishlist. 3, 4, 5 : bas du classement sans « bien ». 6 vu, 7 refusé.
    expect(list.map((a) => [a.key, a.rank, a.good, a.inWishlist])).toEqual([
      [m(2), 1, false, false],
      [m(1), 2, true, true],
    ]);
  });
});

describe('compatibilité', () => {
  const ids = [1, 2, 3, 4, 5, 6];
  const seenAll = ids.map((id): [number, Status] => [id, 'seen']);

  it('100 % pour le même ordre, 0 % pour l’ordre inverse', () => {
    const me = side(seenAll, { movie: ids });
    expect(compatibility(me, side(seenAll, { movie: ids }), 'movie')?.percent).toBe(100);
    expect(compatibility(me, side(seenAll, { movie: [...ids].reverse() }), 'movie')?.percent).toBe(0);
  });

  it('ne compte que les titres classés par les deux, au moins 5', () => {
    const me = side(seenAll, { movie: ids });
    expect(compatibility(me, side(seenAll, { movie: [1, 2, 3, 4] }), 'movie')).toBeNull();
    const r = compatibility(me, side(seenAll, { movie: [9, 1, 2, 3, 4, 5, 8] }), 'movie');
    expect(r?.common).toBe(5);
    expect(r?.percent).toBe(100);
  });

  it('accords en tête des deux classements, désaccords par écart', () => {
    const me = side(seenAll, { movie: [1, 2, 3, 4, 5, 6] });
    const r = compatibility(me, side(seenAll, { movie: [1, 2, 6, 3, 4, 5] }), 'movie')!;
    expect(r.agree.map((x) => x.key)).toEqual([m(1), m(2)]);
    expect(r.disagree[0]).toEqual({ key: m(6), mine: 6, theirs: 3 });
  });
});

describe('synchro : égalité de date', () => {
  it('le compte gagne quand les deux versions ont la même date (anciennes lignes)', () => {
    const local = new Map([['m:ranking:movie', { id: 'm:ranking:movie', data: ['a'], at: 0 }]]);
    const p = plan(local, new Map(), [{ id: 'm:ranking:movie', data: ['b'], at: 0 }], 100);
    expect(p.apply).toEqual([{ id: 'm:ranking:movie', data: ['b'], at: 0 }]);
    expect(p.push).toEqual([]);
  });
});

describe('compatibilité : listes lisibles', () => {
  it('un titre n’est jamais à la fois accord et désaccord, et un écart d’une place n’est pas un désaccord', () => {
    const ids = [1, 2, 3, 4, 5, 6];
    const seenAll = ids.map((id): [number, Status] => [id, 'seen']);
    const r = compatibility(side(seenAll, { movie: ids }), side(seenAll, { movie: [2, 1, 3, 6, 4, 5] }), 'movie')!;
    const agree = r.agree.map((x) => x.key);
    expect(r.disagree.map((x) => x.key)).toEqual([m(6)]);
    expect(agree.filter((k) => r.disagree.some((d) => d.key === k))).toEqual([]);
  });
});
