import { describe, expect, it } from 'vitest';
import { isExcluded, parseDetails, pickTrailer, toTitle, type RawResult } from '../src/tmdb';

const raw = (extra: Partial<RawResult>): RawResult => ({ id: 1, poster_path: null, ...extra });

describe('exclusions', () => {
  it('exclut documentaires et contenus adultes', () => {
    expect(isExcluded('movie', raw({ genre_ids: [99] }))).toBe(true);
    expect(isExcluded('movie', raw({ adult: true }))).toBe(true);
    expect(isExcluded('movie', raw({ genre_ids: [18] }))).toBe(false);
  });

  it('garde tous les films d’animation, y compris japonais', () => {
    expect(isExcluded('movie', raw({ genre_ids: [16], original_language: 'ja' }))).toBe(false);
  });

  it('exclut les animes et dessins animés jeunesse, garde les séries animées adultes', () => {
    expect(isExcluded('tv', raw({ genre_ids: [16], original_language: 'ja' }))).toBe(true);
    expect(isExcluded('tv', raw({ genre_ids: [16], origin_country: ['JP'] }))).toBe(true);
    expect(isExcluded('tv', raw({ genre_ids: [16, 10762], original_language: 'en' }))).toBe(true);
    expect(isExcluded('tv', raw({ genre_ids: [16, 35], original_language: 'en' }))).toBe(false); // Les Simpson
  });

  it('exclut télé-réalité, talk-shows et infos', () => {
    for (const g of [10763, 10764, 10767]) expect(isExcluded('tv', raw({ genre_ids: [g] }))).toBe(true);
    expect(isExcluded('tv', raw({ genre_ids: [18] }))).toBe(false);
  });
});

describe('conversion', () => {
  it('convertit un film TMDB en titre', () => {
    const t = toTitle('movie', raw({ id: 550, title: 'Fight Club', original_title: 'Fight Club', release_date: '1999-10-15', genre_ids: [18], original_language: 'en', vote_count: 30000 }));
    expect(t).toMatchObject({ key: 'movie:550', title: 'Fight Club', year: 1999, genreIds: [18], originalLanguage: 'en', voteCount: 30000 });
  });

  it('convertit une série (name / first_air_date)', () => {
    const t = toTitle('tv', raw({ id: 1399, name: 'Game of Thrones', original_name: 'Game of Thrones', first_air_date: '2011-04-17' }));
    expect(t).toMatchObject({ key: 'tv:1399', title: 'Game of Thrones', year: 2011 });
  });

  it('tolère une date absente', () => {
    expect(toTitle('movie', raw({ title: 'Sans date' })).year).toBeNull();
  });
});

describe('fiche détaillée', () => {
  it('choisit de préférence une bande-annonce en français', () => {
    const videos = [
      { key: 'teaser', site: 'YouTube', type: 'Teaser', iso_639_1: 'fr', official: true },
      { key: 'en', site: 'YouTube', type: 'Trailer', iso_639_1: 'en', official: true },
      { key: 'fr', site: 'YouTube', type: 'Trailer', iso_639_1: 'fr', official: false },
      { key: 'vimeo', site: 'Vimeo', type: 'Trailer', iso_639_1: 'fr', official: true },
    ];
    expect(pickTrailer(videos)).toBe('fr');
    expect(pickTrailer([])).toBeNull();
  });

  it('lit réalisateur, casting, saga et plateformes d’un film', () => {
    const d = parseDetails('movie', {
      runtime: 153,
      vote_average: 7.904,
      genres: [{ id: 12, name: 'Aventure' }],
      belongs_to_collection: { id: 1241, name: 'Harry Potter - Saga' },
      credits: {
        cast: [
          { name: 'Rupert Grint', order: 1 },
          { name: 'Daniel Radcliffe', order: 0 },
          { name: 'Emma Watson', order: 2 },
        ],
        crew: [
          { name: 'Chris Columbus', job: 'Director' },
          { name: 'John Williams', job: 'Original Music Composer' },
        ],
      },
      'watch/providers': { results: { FR: { link: 'https://x', flatrate: [{ provider_id: 1899, provider_name: 'HBO Max', logo_path: '/h.png' }] } } },
    });
    expect(d).toMatchObject({
      directors: ['Chris Columbus'],
      cast: ['Daniel Radcliffe', 'Rupert Grint'],
      rating: 7.9,
      runtime: 153,
      collection: { id: 1241, name: 'Harry Potter - Saga' },
      providers: { flatrate: [{ id: 1899, name: 'HBO Max', logo: '/h.png' }], rent: [], buy: [], link: 'https://x' },
    });
  });

  it('pour une série : créateurs et durée d’un épisode', () => {
    const d = parseDetails('tv', {
      created_by: [{ name: 'David Benioff' }, { name: 'D. B. Weiss' }],
      episode_run_time: [],
      last_episode_to_air: { runtime: 80 },
      number_of_seasons: 8,
      number_of_episodes: 73,
    });
    expect(d).toMatchObject({ directors: ['David Benioff', 'D. B. Weiss'], runtime: 80, seasons: 8, episodes: 73, collection: null });
  });
});
