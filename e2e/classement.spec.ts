import { expect, test } from '@playwright/test';
import { dragRow, openRanking, rankedNames, seed, title } from './helpers';

const NAMES = ['Inception', 'Le Parrain', 'Parasite', 'Amélie', 'Interstellar', 'Whiplash', 'Drive', 'Her', 'Arrival'];
const films = NAMES.map((n, i) => title('movie', i + 1, n));

test.describe('classement déplacé à la main', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept('2')); // « Nouvelle place » : 2
    await seed(
      page,
      { titles: films, answers: films.map((t) => ({ key: t.key, status: 'seen' as const })), meta: { 'ranking:movie': films.map((t) => t.key) } },
      '#/rank/movie',
    );
    await openRanking(page);
    await page.locator('.drag-handle').first().waitFor();
  });

  test('glisser la poignée ⠿ (souris ou doigt)', async ({ page, isMobile }) => {
    await dragRow(page, 5, 0, isMobile); // Whiplash, n°6 → n°1
    const expected = ['Whiplash', 'Inception', 'Le Parrain', 'Parasite', 'Amélie', 'Interstellar', 'Drive', 'Her', 'Arrival'];
    await expect.poll(() => rankedNames(page)).toEqual(expected);
    await expect(page.getByText('« Whiplash » passe n°1')).toBeVisible(); // enregistré
    await page.reload();
    await openRanking(page);
    await expect.poll(() => rankedNames(page)).toEqual(expected);
  });

  test('toucher le numéro pour choisir la place', async ({ page }) => {
    await page.locator('button.rank-num').nth(7).click(); // Her → n°2
    await expect.poll(() => rankedNames(page)).toEqual(['Inception', 'Her', 'Le Parrain', 'Parasite', 'Amélie', 'Interstellar', 'Whiplash', 'Drive', 'Arrival']);
  });

  test('pas de déplacement à la main pendant une recherche', async ({ page }) => {
    await page.getByPlaceholder('Rechercher un titre…').fill('Drive');
    await expect(page.locator('.drag-handle')).toHaveCount(0);
  });
});
