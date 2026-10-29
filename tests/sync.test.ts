import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getMeta, setStatus } from '../src/lib/db';
import { readRanking, saveRanking } from '../src/lib/ranking';
import { syncCatalogue } from '../src/lib/sync';
import { DEFAULT_MIN_VOTES, type MinVotes } from '../src/lib/settings';
import { makeTitle } from './helpers';

// Un faux TMDB : il applique les filtres de /discover (votes, langue originale, période).
const MOVIES = [
  { id: 1, title: 'Gros succès', poster_path: null, vote_count: 5000, original_language: 'en', release_date: '2010-05-01' },
  { id: 2, title: 'Comédie française', poster_path: null, vote_count: 200, original_language: 'fr', release_date: '2015-03-01' },
  { id: 3, title: 'Film étranger obscur', poster_path: null, vote_count: 200, original_language: 'en', release_date: '2015-03-01' },
  { id: 4, title: 'Vieux classique', poster_path: null, vote_count: 200, original_language: 'en', release_date: '1965-09-01' },
];
const SERIES = [
  { id: 10, name: 'Série', poster_path: null, vote_count: 80, genre_ids: [18], original_language: 'en', first_air_date: '2012-01-01' },
  { id: 11, name: 'Petit anime', poster_path: null, vote_count: 30, genre_ids: [16], original_language: 'ja', first_air_date: '2012-01-01' },
  { id: 12, name: 'Grand anime', poster_path: null, vote_count: 120, genre_ids: [16], original_language: 'ja', first_air_date: '2012-01-01' },
  { id: 13, name: 'Série française', poster_path: null, vote_count: 30, genre_ids: [18], original_language: 'fr', first_air_date: '2012-01-01' },
];
vi.mock('../src/lib/tmdb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/tmdb')>();
  return {
    ...actual,
    tmdb: vi.fn(async (path: string, params: Record<string, string | number>) => {
      const movie = path.includes('movie');
      const field = movie ? 'primary_release_date' : 'first_air_date';
      const results = (movie ? MOVIES : SERIES).filter((r) => {
        const date = (r as Record<string, unknown>)[movie ? 'release_date' : 'first_air_date'] as string;
        return (
          r.vote_count >= Number(params['vote_count.gte']) &&
          (!params.with_original_language || r.original_language === params.with_original_language) &&
          date >= String(params[`${field}.gte`]) &&
          date <= String(params[`${field}.lte`])
        );
      });
      return { page: 1, total_pages: 1, total_results: results.length, results };
    }),
  };
});

/** Seuils du test : ceux donnés, les autres trop hauts pour laisser passer quoi que ce soit. */
const votes = (v: Partial<MinVotes>): MinVotes => ({ movie: 1000, tv: 10_000, anime: 10_000, frMovie: 10_000, frTv: 10_000, oldMovie: 10_000, ...v });

beforeEach(async () => {
  await Promise.all([db.titles.clear(), db.answers.clear(), db.meta.clear()]);
});

describe('mise à jour du catalogue', () => {
  it('supprime les titres absents du nouveau catalogue, même vus, classés ou ajoutés à la main', async () => {
    for (const id of [1, 2]) await setStatus(makeTitle(id), 'seen', 'good');
    await setStatus(makeTitle(3, { manual: true }), 'seen');
    await db.titles.put(makeTitle(4));
    await saveRanking({ type: 'movie', list: 'seen' }, ['movie:2', 'movie:1', 'movie:3']);

    const { movie, removed } = await syncCatalogue(votes({ tv: 50, anime: 50 }), () => {});

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
    const r = await syncCatalogue(votes({ tv: 100, anime: 25 }), () => {});
    expect([r.tv, r.anime]).toEqual([0, 2]); // la série (80 votes) est sous son seuil de 100
    expect((await db.titles.where('type').equals('tv').primaryKeys()).sort()).toEqual(['tv:11', 'tv:12']);
    const r2 = await syncCatalogue(votes({ tv: 50, anime: 100 }), () => {});
    expect([r2.tv, r2.anime]).toEqual([1, 1]);
    expect((await db.titles.where('type').equals('tv').primaryKeys()).sort()).toEqual(['tv:10', 'tv:12']);
  });
});

describe('titres en français et vieux films', () => {
  it('ont leur propre seuil, plus bas, sans faire entrer le reste', async () => {
    const r = await syncCatalogue(DEFAULT_MIN_VOTES, () => {});
    // Films : le gros succès, la comédie française (200 ≥ 150) et le classique de 1965 (200 ≥ 150),
    // pas le film étranger récent à 200 votes (seuil 1 000).
    expect((await db.titles.where('type').equals('movie').primaryKeys()).sort()).toEqual(['movie:1', 'movie:2', 'movie:4']);
    expect(r.movie).toBe(3);
    // Séries : la série française à 30 votes passe (seuil 20) ; les séries et animes au seuil de 50.
    expect((await db.titles.where('type').equals('tv').primaryKeys()).sort()).toEqual(['tv:10', 'tv:12', 'tv:13']);
    expect([r.tv, r.anime]).toEqual([2, 1]);
  });

  it('un titre trouvé par deux requêtes ne compte qu’une fois', async () => {
    const r = await syncCatalogue(votes({ frMovie: 100, oldMovie: 100, movie: 100 }), () => {});
    expect(r.movie).toBe(4);
  });
});
