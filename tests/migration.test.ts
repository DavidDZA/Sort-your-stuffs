import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import type { Details } from '../src/lib/db';

const details = (extra: Partial<Details> = {}): Details => ({
  fetchedAt: 1000,
  directors: ['Réalisatrice'],
  cast: [],
  topCast: [],
  genres: ['Drame'],
  genreIds: [18],
  rating: 7.5,
  runtime: 120,
  collection: { id: 42, name: 'Saga' },
  providers: { flatrate: [], rent: [], buy: [], link: null },
  ...extra,
});

describe('base locale : fiches détaillées rangées à part', () => {
  it('migre les fiches enregistrées dans les titres (base d’avant le 30/10)', async () => {
    // Base telle que l'écrivait l'ancienne version (schéma 2), avec une fiche dans un titre.
    const old = new Dexie('sort-my-stuffs');
    old.version(1).stores({ titles: 'key, type', answers: 'key, type, status, [type+status], updatedAt', meta: 'key' });
    old.version(2).stores({ synced: 'id' });
    await old.table('titles').bulkPut([
      { key: 'movie:1', type: 'movie', tmdbId: 1, title: 'Avec fiche', details: details() },
      { key: 'movie:2', type: 'movie', tmdbId: 2, title: 'Fiche d’avant le 17/10', details: details({ genreIds: undefined, collection: null }) },
      { key: 'tv:3', type: 'tv', tmdbId: 3, title: 'Sans fiche' },
    ]);
    old.close();

    const { db, withDetails, getDetails } = await import('../src/lib/db');
    const titles = await db.titles.toArray();
    expect(titles.every((t) => !('details' in t))).toBe(true);
    expect(await db.titles.get('movie:1')).toMatchObject({ detailsAt: 1000, collectionId: 42 });
    // Fiche ancienne : gardée, mais sans repère « à jour » (elle sera récupérée à nouveau).
    expect((await db.titles.get('movie:2'))?.detailsAt).toBeUndefined();
    expect((await db.titles.get('movie:2'))?.collectionId).toBeNull();
    expect((await getDetails('movie:1'))?.directors).toEqual(['Réalisatrice']);
    expect(await db.details.count()).toBe(2);

    // Jointe en mémoire à la demande.
    const [withD, without] = await withDetails([titles.find((t) => t.key === 'movie:1')!, titles.find((t) => t.key === 'tv:3')!]);
    expect(withD.details?.runtime).toBe(120);
    expect(without.details).toBeUndefined();

    // Garde-fou : une fiche jointe n'est jamais réenregistrée dans le titre.
    await db.titles.put({ ...withD, title: 'Renommé' });
    await db.titles.update('tv:3', { details: details() });
    expect((await db.titles.toArray()).every((t) => t.details === undefined)).toBe(true);
    expect((await db.titles.get('movie:1'))?.title).toBe('Renommé');
  });
});
