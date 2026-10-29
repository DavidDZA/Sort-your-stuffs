import { expect, test } from '@playwright/test';

test.describe('réglages', () => {
  test('ordre des rubriques', async ({ page }) => {
    await page.goto('/#/settings');
    await expect(page.locator('main > .card > h3')).toHaveText([
      '☁️ Compte',
      '💾 Sauvegarde',
      '🕹️ Mode de swipe',
      '📺 Mes abonnements',
      '📦 Catalogue',
      '🔑 Clé TMDB',
      '⚠️ Zone dangereuse',
    ]);
  });

  test('seuils de votes : champ vidable, valeur par défaut remise en sortant', async ({ page }) => {
    await page.goto('/#/settings/catalogue');
    const fields = page.locator('#catalogue input[type=number]');
    await expect(fields).toHaveCount(6);
    await expect.poll(() => fields.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toEqual(['1000', '50', '50', '150', '20', '150']);
    await fields.first().fill('');
    await expect(fields.first()).toHaveValue('');
    await page.locator('#catalogue h3').click(); // le champ perd le focus
    await expect(fields.first()).toHaveValue('1000');
  });
});
