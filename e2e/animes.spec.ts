import { expect, test } from '@playwright/test';
import { anime, openRanking, rankedNames, seed, title } from './helpers';

test.describe('catégorie Animes', () => {
  test('les animes classés avec les séries en sortent, dans le même ordre', async ({ page }) => {
    const all = [
      title('tv', 1, 'Breaking Bad'),
      anime(2, 'Frieren'),
      title('tv', 3, 'The Wire'),
      anime(4, 'Fullmetal Alchemist'),
      title('tv', 5, 'Mad Men'),
      anime(6, 'Cowboy Bebop'),
    ];
    // Classement d'avant la catégorie Animes : tout mélangé dans les séries.
    await seed(page, {
      titles: all,
      answers: all.map((t) => ({ key: t.key, status: 'seen' as const })),
      meta: { 'ranking:tv': ['tv:2', 'tv:1', 'tv:4', 'tv:3', 'tv:6', 'tv:5'] },
    });
    await page.goto('/#/rank/anime');
    await openRanking(page);
    await expect.poll(() => rankedNames(page)).toEqual(['Frieren', 'Fullmetal Alchemist', 'Cowboy Bebop']);
    await page.goto('/#/rank/tv');
    await openRanking(page);
    await expect.poll(() => rankedNames(page)).toEqual(['Breaking Bad', 'The Wire', 'Mad Men']);
  });

  test('masquer la catégorie cache tuiles et onglets', async ({ page }) => {
    await page.goto('/#/settings/catalogue');
    const chip = page.getByRole('button', { name: 'Afficher la catégorie Animes' });
    await expect(chip).toHaveClass(/active/);
    await chip.click();
    await expect(chip).not.toHaveClass(/active/);
    await page.goto('/');
    await expect(page.locator('.tile-label', { hasText: 'Swiper les films' })).toBeVisible();
    await expect(page.locator('.tile-label', { hasText: 'animes' })).toHaveCount(0);
    await page.goto('/#/stats');
    await expect(page.locator('.chips .chip', { hasText: 'Séries' })).toBeVisible();
    await expect(page.locator('.chips .chip', { hasText: 'Animes' })).toHaveCount(0);
  });
});
