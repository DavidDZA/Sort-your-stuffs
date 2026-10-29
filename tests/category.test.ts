import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, setStatus } from '../src/lib/db';
import { categoryOf, forgetCategories } from '../src/lib/category';
import { changeStatus, loadInsert, readRanking, saveInsert, saveRanking, splitAnime, splitAnimeRankings, unrankedKeys } from '../src/lib/ranking';
import { makeTitle } from './helpers';

const series = (id: number) => makeTitle(id, { genreIds: [18], originalLanguage: 'en' }, 'tv');
const anime = (id: number) => makeTitle(id, { genreIds: [16, 10759], originalLanguage: 'ja' }, 'tv');
const tv = (id: number) => `tv:${id}`;

beforeEach(async () => {
  await Promise.all([db.titles.clear(), db.answers.clear(), db.meta.clear()]);
  forgetCategories();
});

describe('catégories', () => {
  it('range les séries d’animation japonaises à part, les films d’animation japonais avec les films', () => {
    expect(categoryOf(anime(1))).toBe('anime');
    expect(categoryOf(series(2))).toBe('tv');
    expect(categoryOf(makeTitle(3, { genreIds: [16], originalLanguage: 'ja' }))).toBe('movie');
    expect(categoryOf(makeTitle(4, { genreIds: [16], originalLanguage: 'en' }, 'tv'))).toBe('tv');
  });

  it('sépare les listes à classer des séries et des animes', async () => {
    await setStatus(series(1), 'seen');
    await setStatus(anime(2), 'seen');
    await setStatus(anime(3), 'wish');
    expect(await unrankedKeys({ category: 'tv', list: 'seen' }, [])).toEqual([tv(1)]);
    expect(await unrankedKeys({ category: 'anime', list: 'seen' }, [])).toEqual([tv(2)]);
    expect(await unrankedKeys({ category: 'anime', list: 'wish' }, [])).toEqual([tv(3)]);
    // Passer un anime de la wishlist aux vus le retire de la bonne liste.
    await saveRanking({ category: 'anime', list: 'wish' }, [tv(3)]);
    await changeStatus(anime(3), 'seen');
    expect(await readRanking({ category: 'anime', list: 'wish' })).toEqual([]);
  });
});

describe('animes sortis des classements de séries', () => {
  it('garde leur ordre et ne double rien (logique pure)', () => {
    const isAnime = (k: string) => k.startsWith('a');
    expect(splitAnime(['s1', 'a1', 's2', 'a2'], [], isAnime)).toEqual({ tv: ['s1', 's2'], anime: ['a1', 'a2'] });
    expect(splitAnime(['a3', 's1', 'a1'], ['a1', 'a2'], isAnime)).toEqual({ tv: ['s1'], anime: ['a1', 'a2', 'a3'] });
    expect(splitAnime(['s1'], ['a1'], isAnime)).toEqual({ tv: ['s1'], anime: ['a1'] });
  });

  it('migre les classements vus et wishlist, une seule fois', async () => {
    for (const id of [1, 3]) await setStatus(series(id), 'seen');
    for (const id of [2, 4]) await setStatus(anime(id), 'seen');
    await setStatus(series(5), 'wish');
    await setStatus(anime(6), 'wish');
    await saveRanking({ category: 'tv', list: 'seen' }, [tv(2), tv(1), tv(4), tv(3)]);
    await saveRanking({ category: 'tv', list: 'wish' }, [tv(6), tv(5)]);
    await saveInsert({ category: 'tv', list: 'seen' }, { key: tv(9), lo: 0, hi: 4 });

    await splitAnimeRankings();
    expect(await readRanking({ category: 'tv', list: 'seen' })).toEqual([tv(1), tv(3)]);
    expect(await readRanking({ category: 'anime', list: 'seen' })).toEqual([tv(2), tv(4)]);
    expect(await readRanking({ category: 'tv', list: 'wish' })).toEqual([tv(5)]);
    expect(await readRanking({ category: 'anime', list: 'wish' })).toEqual([tv(6)]);
    expect(await loadInsert({ category: 'tv', list: 'seen' })).toBeNull(); // positions changées

    // Deuxième passage : rien ne bouge.
    const before = await db.meta.toArray();
    await splitAnimeRankings();
    expect(await db.meta.toArray()).toEqual(before);
  });
});
