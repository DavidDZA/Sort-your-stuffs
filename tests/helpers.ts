import type { MediaType, Title } from '../src/lib/db';

/** Titre minimal pour les tests. */
export function makeTitle(id: number, extra: Partial<Title> = {}, type: MediaType = 'movie'): Title {
  return {
    key: `${type}:${id}`,
    type,
    tmdbId: id,
    title: `Titre ${id}`,
    originalTitle: `Title ${id}`,
    year: 2000,
    posterPath: null,
    overview: '',
    voteCount: 100,
    popularity: 1,
    ...extra,
  };
}
