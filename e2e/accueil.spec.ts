import { expect, test } from '@playwright/test';

test.describe('accueil', () => {
  test('une ligne par catégorie : swiper à gauche, classer à droite', async ({ page }) => {
    await page.goto('/');
    const labels = page.locator('.tile-label');
    await expect(labels.first()).toBeVisible();
    await expect(labels).toHaveText([
      'Swiper les films',
      'Classer les films',
      'Swiper les séries',
      'Classer les séries',
      'Swiper les animes',
      'Classer les animes',
      'Wishlist',
      'Ajout manuel',
      'Mes listes',
      'Stats & badges',
    ]);
  });

  test('sans compte : la bannière mène à la connexion', async ({ page }) => {
    await page.goto('/');
    await page.locator('a.banner-soft', { hasText: 'Connecte-toi' }).click();
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.getByText('Continuer avec Google')).toBeVisible();
  });

  test('catalogue vide : la bannière ouvre directement la rubrique Catalogue', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('tmdb-token', 'jeton-de-test'));
    await page.reload();
    await page.locator('a.banner', { hasText: 'catalogue' }).click();
    await expect(page).toHaveURL(/#\/settings\/catalogue$/);
    await page.waitForTimeout(2500); // les rubriques du dessus finissent de se charger
    const top = await page.locator('#catalogue').evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(top)).toBeLessThan(20);
  });
});
