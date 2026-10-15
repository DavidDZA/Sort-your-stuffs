import { describe, expect, it } from 'vitest';
import { chainSaga, draw, removeFromPool, type Pool } from '../src/pages/swipe/pool';
import { makeTitle } from './helpers';

const t = (id: number) => makeTitle(id);
const keys = (list: { tmdbId: number }[]) => list.map((x) => x.tmdbId);

describe('sagas enchaînées', () => {
  // Saga : 1 → 2 → 3 (ordre de sortie). File : A(10), B(11), 2 (tiré), C(12).
  const saga = [t(1), t(2), t(3)];

  it('remplace le film tiré par toute la saga, en commençant par le premier', () => {
    const queue = [t(10), t(11), t(2), t(12)];
    expect(keys(chainSaga(queue, 2, saga))).toEqual([10, 11, 1, 2, 3, 12]);
  });

  it('retire les doublons plus loin dans la file', () => {
    const queue = [t(10), t(2), t(12), t(3)];
    expect(keys(chainSaga(queue, 1, saga))).toEqual([10, 1, 2, 3, 12]);
  });

  it('garde en premier un film déjà affiché, puis enchaîne le reste dans l’ordre', () => {
    const queue = [t(2), t(10), t(11)];
    expect(keys(chainSaga(queue, 0, saga, true))).toEqual([2, 1, 3, 10, 11]);
  });

  it('ne touche pas aux cartes déjà passées devant', () => {
    // Le film 1 est déjà affiché (index 0), on enchaîne la saga détectée sur le film 3 (index 2).
    const queue = [t(1), t(10), t(3)];
    expect(keys(chainSaga(queue, 2, saga))).toEqual([1, 10, 2, 3]);
  });
});

describe('tirage', () => {
  it('tire selon les poids et retire le titre tiré', () => {
    const pool: Pool = { items: [{ title: t(1), w: 1 }, { title: t(2), w: 3 }], total: 4 };
    const original = Math.random;
    Math.random = () => 0.5; // 0,5 × 4 = 2 : tombe dans le poids du titre 2
    try {
      expect(draw(pool)?.tmdbId).toBe(2);
    } finally {
      Math.random = original;
    }
    expect(pool.items.map((i) => i.title.tmdbId)).toEqual([1]);
    expect(pool.total).toBe(1);
  });

  it('retire des titres du tirage et recalcule le total', () => {
    const pool: Pool = { items: [{ title: t(1), w: 1 }, { title: t(2), w: 3 }, { title: t(3), w: 2 }], total: 6 };
    removeFromPool(pool, new Set(['movie:2']));
    expect(pool.items.map((i) => i.title.tmdbId)).toEqual([1, 3]);
    expect(pool.total).toBe(3);
  });
});
