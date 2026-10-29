import type { Page } from '@playwright/test';

/** Outils communs aux tests de bout en bout : base locale préremplie, glisser au doigt ou à la souris. */

export interface SeedTitle {
  key: string;
  type: 'movie' | 'tv';
  tmdbId: number;
  title: string;
  originalTitle: string;
  year: number;
  posterPath: null;
  overview: string;
  voteCount: number;
  popularity: number;
  genreIds: number[];
  originalLanguage: string;
  rating?: number;
}

/** Un titre de test (sans affiche : rien à télécharger). */
export function title(type: 'movie' | 'tv', id: number, name: string, extra: Partial<SeedTitle> = {}): SeedTitle {
  return { key: `${type}:${id}`, type, tmdbId: id, title: name, originalTitle: name, year: 2000 + (id % 25), posterPath: null, overview: 'Résumé de test.', voteCount: 900, popularity: 1, genreIds: [18], originalLanguage: 'en', ...extra };
}

export const anime = (id: number, name: string) => title('tv', id, name, { genreIds: [16, 10759], originalLanguage: 'ja' });

export interface Seed {
  titles?: SeedTitle[];
  answers?: { key: string; status: 'seen' | 'unseen' | 'wish'; tier?: 'good' | 'meh' }[];
  meta?: Record<string, unknown>;
}

/** Ouvre l'appli (qui crée sa base), y écrit les données de test, puis recharge la page `hash`. */
export async function seed(page: Page, data: Seed, hash = '#/'): Promise<void> {
  await page.goto('/');
  await page.locator('.tiles').waitFor();
  await page.evaluate(
    (d) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('sort-my-stuffs');
        req.onsuccess = () => {
          const tx = req.result.transaction(['titles', 'answers', 'meta'], 'readwrite');
          for (const t of d.titles ?? []) tx.objectStore('titles').put(t);
          for (const a of d.answers ?? []) tx.objectStore('answers').put({ ...a, type: a.key.split(':')[0], updatedAt: Date.now() });
          for (const [key, value] of Object.entries(d.meta ?? {})) tx.objectStore('meta').put({ key, value });
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    data,
  );
  await page.goto(`/${hash}`);
  await page.reload();
}

/** Onglet « Mon classement » d'une page de classement. */
export const openRanking = (page: Page) => page.locator('button.chip', { hasText: 'Mon classement' }).click();

/** Noms des titres d'une liste numérotée (classement), dans l'ordre affiché. */
export const rankedNames = (page: Page) => page.$$eval('ol.list .row-text', (rows) => rows.map((r) => r.firstElementChild?.textContent?.replace(/\d{4}$/, '').trim()));

/**
 * Glisse la poignée ⠿ de la ligne `from` jusqu'à la ligne `to` (indices) : à la souris sur PC,
 * au doigt (vrais événements tactiles) sur téléphone.
 */
export async function dragRow(page: Page, from: number, to: number, touch: boolean): Promise<void> {
  const handles = page.locator('.drag-handle');
  // Les deux lignes à l'écran (un doigt hors de l'écran ne touche rien) : la plus haute en haut.
  await handles.nth(Math.min(from, to)).evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(200);
  const a = (await handles.nth(from).boundingBox())!;
  const b = (await handles.nth(to).boundingBox())!;
  const x = a.x + a.width / 2;
  const y0 = a.y + a.height / 2;
  const y1 = b.y + b.height / 2 + (to < from ? -b.height / 3 : b.height / 3); // un peu au-delà du centre de la ligne visée
  const steps = 12;
  if (!touch) {
    await page.mouse.move(x, y0);
    await page.mouse.down();
    for (let s = 1; s <= steps; s++) await page.mouse.move(x, y0 + ((y1 - y0) * s) / steps);
    await page.mouse.up();
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let s = 1; s <= steps; s++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * s) / steps }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
