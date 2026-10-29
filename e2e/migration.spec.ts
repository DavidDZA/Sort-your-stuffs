import { expect, test } from '@playwright/test';

/** Base écrite par une version d'avant le 30/10 (schéma Dexie 2 = IndexedDB 20) : fiches dans les titres. */
test('base d’une ancienne version : fiches rangées à part, filtres intacts', async ({ page }) => {
  // Page statique du même site : l'appli ne tourne pas encore, on peut écrire l'ancienne base.
  await page.goto('/confidentialite.html');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('sort-my-stuffs', 20);
        req.onupgradeneeded = () => {
          const d = req.result;
          d.createObjectStore('titles', { keyPath: 'key' }).createIndex('type', 'type');
          const a = d.createObjectStore('answers', { keyPath: 'key' });
          a.createIndex('type', 'type');
          a.createIndex('status', 'status');
          a.createIndex('[type+status]', ['type', 'status']);
          a.createIndex('updatedAt', 'updatedAt');
          d.createObjectStore('meta', { keyPath: 'key' });
          d.createObjectStore('synced', { keyPath: 'id' });
        };
        req.onsuccess = () => {
          const tx = req.result.transaction(['titles', 'answers'], 'readwrite');
          const details = {
            fetchedAt: Date.now(),
            directors: ['Christopher Nolan'],
            cast: ['Leonardo DiCaprio'],
            topCast: ['Leonardo DiCaprio'],
            genres: ['Science-Fiction'],
            genreIds: [878],
            originalLanguage: 'en',
            rating: 8.4,
            runtime: 148,
            collection: null,
            trailer: null,
            providers: { flatrate: [{ id: 8, name: 'Netflix', logo: null }], rent: [], buy: [], link: null },
          };
          const base = { type: 'movie', posterPath: null, overview: 'Résumé.', voteCount: 5000, popularity: 1, genreIds: [878], originalLanguage: 'en', rating: 8 };
          tx.objectStore('titles').put({ ...base, key: 'movie:1', tmdbId: 1, title: 'Inception', originalTitle: 'Inception', year: 2010, details });
          tx.objectStore('titles').put({ ...base, key: 'movie:2', tmdbId: 2, title: 'Sans fiche', originalTitle: 'Sans fiche', year: 2001 });
          for (const key of ['movie:1', 'movie:2']) tx.objectStore('answers').put({ key, type: 'movie', status: 'wish', updatedAt: Date.now() });
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.evaluate(() => localStorage.setItem('my-provider-families', JSON.stringify(['netflix'])));

  await page.goto('/#/wishlist');
  await expect(page.locator('.row-text', { hasText: 'Inception' })).toBeVisible();
  const db = await page.evaluate(
    () =>
      new Promise<{ version: number; details: number; inTitle: boolean }>((resolve) => {
        const req = indexedDB.open('sort-my-stuffs');
        req.onsuccess = () => {
          const tx = req.result.transaction(['titles', 'details']);
          const out = { version: req.result.version, details: 0, inTitle: true };
          tx.objectStore('details').count().onsuccess = (e) => (out.details = (e.target as IDBRequest<number>).result);
          tx.objectStore('titles').get('movie:1').onsuccess = (e) => (out.inTitle = !!(e.target as IDBRequest).result.details);
          tx.oncomplete = () => resolve(out);
        };
      }),
  );
  expect(db).toEqual({ version: 30, details: 1, inTitle: false });

  // Le filtre « dispo sur mes abonnements » lit toujours les plateformes de la fiche.
  await page.getByRole('button', { name: 'Dispo sur mes abonnements' }).click();
  await expect(page.locator('.list .row-text')).toHaveCount(1);
  await expect(page.locator('.list .row-text').first()).toContainText('Inception');

  // « Ce soir » : réalisateur et casting viennent de la fiche migrée.
  await page.goto('/#/tonight');
  await page.getByRole('button', { name: 'Tirer au sort' }).click();
  await expect(page.locator('.tonight-card')).toBeVisible();
});
