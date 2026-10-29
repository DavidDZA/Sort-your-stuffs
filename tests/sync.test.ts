import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getMeta, setStatus } from '../src/lib/db';
import { readRanking, saveRanking } from '../src/lib/ranking';
import { syncCatalogue } from '../src/lib/sync';
import { makeTitle } from './helpers';

// TMDB renvoie un film (id 1) ; côté séries : une série à 80 votes, un anime à 30 et un anime à 120.
const SERIES = [
  { id: 10, name: 'Série', poster_path: null, vote_count: 80, genre_ids: [18], original_language: 'en' },
  { id: 11, name: 'Petit anime', poster_path: null, vote_count: 30, genre_ids: [16], original_language: 'ja' },
  { id: 12, name: 'Grand anime', poster_path: null, vote_count: 120, genre_ids: [16], original_language: 'ja' },
];
vi.mock('../src/lib/tmdb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/tmdb')>();
  return {
    ...actual,
    tmdb: vi.fn(async (path: string, params: Record<string, number>) => {
      const results = path.includes('movie')
        ? [{ id: 1, title: 'Titre 1', poster_path: null, vote_count: 5000, vote_average: 7 }]
        : SERIES.filter((s) => s.vote_count >= params['vote_count.gte']);
      return { page: 1, total_pages: 1, total_results: results.length, results };
    }),
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

    const { movie, removed } = await syncCatalogue({ movie: 1000, tv: 50, anime: 50 }, () => {});

    expect(movie).toBe(1);
    expect(removed).toBe(3); // 2 (vu et classé), 3 (ajout manuel) et 4 (jamais répondu)
    expect((await db.titles.where('type').equals('movie').primaryKeys()).sort()).toEqual(['movie:1']);
    expect(await db.answers.get('movie:2')).toBeUndefined();
    expect(await db.answers.get('movie:1')).toBeDefined(); // les réponses des titres gardés restent
    expect(await readRanking({ type: 'movie', list: 'seen' })).toEqual(['movie:1']);
    expect(await getMeta('lastSync', null)).not.toBeNull();
  });
});

describe('séries et animes', () => {
  it('applique à chacun son seuil de votes', async () => {
    const r = await syncCatalogue({ movie: 1000, tv: 100, anime: 25 }, () => {});
    expect([r.tv, r.anime]).toEqual([0, 2]); // la série (80 votes) est sous son seuil de 100
    expect((await db.titles.where('type').equals('tv').primaryKeys()).sort()).toEqual(['tv:11', 'tv:12']);
    const r2 = await syncCatalogue({ movie: 1000, tv: 50, anime: 100 }, () => {});
    expect([r2.tv, r2.anime]).toEqual([1, 1]);
    expect((await db.titles.where('type').equals('tv').primaryKeys()).sort()).toEqual(['tv:10', 'tv:12']);
  });
});
