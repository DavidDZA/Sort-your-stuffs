import { describe, expect, it } from 'vitest';
import { filmography, isAnimeTitle, isExcluded, parseDetails, pickTrailer, toTitle, type CreditItem, type RawResult } from '../src/lib/tmdb';

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

  it('inclut les animes quand le réglage est activé, jamais les dessins animés jeunesse', () => {
    expect(isExcluded('tv', raw({ genre_ids: [16], original_language: 'ja' }), true)).toBe(false);
    expect(isExcluded('tv', raw({ genre_ids: [16], origin_country: ['JP'] }), true)).toBe(false);
    expect(isExcluded('tv', raw({ genre_ids: [16, 10762], original_language: 'ja' }), true)).toBe(true);
  });

  it('reconnaît un anime déjà dans la base', () => {
    expect(isAnimeTitle(toTitle('tv', raw({ genre_ids: [16, 10759], original_language: 'ja' })))).toBe(true);
    expect(isAnimeTitle(toTitle('movie', raw({ genre_ids: [16], original_language: 'ja' })))).toBe(false);
    expect(isAnimeTitle(toTitle('tv', raw({ genre_ids: [16], original_language: 'en' })))).toBe(false);
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
      original_language: 'en',
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
      genres: ['Aventure'],
      genreIds: [12],
      originalLanguage: 'en',
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

describe('filmographie (ajout manuel par personne)', () => {
  const c = (extra: Partial<CreditItem>): CreditItem => ({ id: 1, poster_path: null, media_type: 'movie', release_date: '2010-07-16', vote_count: 100, ...extra });
  const credits = {
    cast: [
      c({ id: 1, title: 'Inception', character: 'Cobb' }),
      c({ id: 2, title: 'Hommage', character: 'Self' }), // apparition dans son propre rôle
      c({ id: 3, title: 'Making-of', character: 'Himself - Actor' }),
      c({ id: 4, title: 'Docu', character: 'Narrateur', genre_ids: [99] }), // documentaire
      c({ id: 5, title: 'Pas encore sorti', character: 'X', release_date: '2999-01-01' }),
      c({ id: 1, title: 'Inception', character: 'Cobb (voix)' }), // doublon
      c({ id: 6, media_type: 'tv', name: 'Une série', first_air_date: '2015-01-01', character: 'Y' }),
    ],
    crew: [
      c({ id: 10, title: 'Réalisé', job: 'Director', release_date: '2020-01-01' }),
      c({ id: 11, title: 'Produit', job: 'Producer' }),
      c({ id: 12, media_type: 'tv', name: 'Créée', job: 'Creator', first_air_date: '2018-01-01' }),
      c({ id: 13, media_type: 'tv', name: 'Un épisode réalisé', job: 'Director', first_air_date: '2019-01-01' }),
    ],
  };

  it('acteur : rôles joués, sans « Self », documentaire, titre à venir ni doublon, du plus récent au plus ancien', () => {
    expect(filmography(credits, 'actor').map((t) => t.title)).toEqual(['Une série', 'Inception']);
  });

  it('réalisateur : films réalisés et séries créées (pas un épisode réalisé)', () => {
    expect(filmography(credits, 'director').map((t) => t.title)).toEqual(['Réalisé', 'Créée']);
  });
});
