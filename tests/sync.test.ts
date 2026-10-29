import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getMeta, setStatus } from '../src/lib/db';
import { readRanking, saveRanking } from '../src/lib/ranking';
import { syncCatalogue } from '../src/lib/sync';
import { makeTitle } from './helpers';

// TMDB renvoie un seul film (id 1) et aucune série.
vi.mock('../src/lib/tmdb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/tmdb')>();
  return {
    ...actual,
    tmdb: vi.fn(async (path: string) => ({
      page: 1,
      total_pages: 1,
      total_results: path.includes('movie') ? 1 : 0,
      results: path.includes('movie') ? [{ id: 1, title: 'Titre 1', poster_path: null, vote_count: 5000, vote_average: 7 }] : [],
    })),
  };
});

beforeEach(async () => {
  await Promise.all([db.titles.clear(), db.answers.clear(), db.meta.clear()]);
});

describe('mise à jour du catalogue', () => {
  it('supprime les titres absents du nouveau catalogue, même vus, classés ou ajoutés à la main', async () => {
    for (const id of [1, 2]) await setStatus(makeTitle(id), 'seen', 'good');
    await setStatus(makeTitle(3, { manual: true }), 'seen');
    await db.titles.put(makeTitle(4));
    await saveRanking({ type: 'movie', list: 'seen' }, ['movie:2', 'movie:1', 'movie:3']);

    const { movie, removed } = await syncCatalogue({ movie: 1000, tv: 50 }, () => {});

    expect(movie).toBe(1);
    expect(removed).toBe(3); // 2 (vu et classé), 3 (ajout manuel) et 4 (jamais répondu)
    expect((await db.titles.toCollection().primaryKeys()).sort()).toEqual(['movie:1']);
    expect(await db.answers.get('movie:2')).toBeUndefined();
    expect(await db.answers.get('movie:1')).toBeDefined(); // les réponses des titres gardés restent
    expect(await readRanking({ type: 'movie', list: 'seen' })).toEqual(['movie:1']);
    expect(await getMeta('lastSync', null)).not.toBeNull();
  });
});
