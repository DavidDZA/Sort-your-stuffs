import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Sur le vrai projet Supabase (npm run e2e:live) : deux comptes de test créés, utilisés, puis supprimés.
 * Adresse et clé publique lues dans .env.local, comme pour l'appli.
 */
function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const line = readFileSync('.env.local', 'utf-8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} absent de .env.local`);
  return line.slice(name.length + 1).trim();
}

const PASSWORD = 'Test-123456!';
const client = () => createClient(env('VITE_SUPABASE_URL'), env('VITE_SUPABASE_PUBLISHABLE_KEY'), { auth: { persistSession: false } });

test.describe('comptes et amis @live', () => {
  test('inscription, synchro, amis, « À deux », suppression', async ({ page }) => {
    const stamp = Date.now();
    const emailA = `sms-e2e-a-${stamp}@test-sortmystuffs.dev`;
    const b: SupabaseClient = client();
    const { data: sb, error } = await b.auth.signUp({ email: `sms-e2e-b-${stamp}@test-sortmystuffs.dev`, password: PASSWORD, options: { data: { pseudo: 'Bob Test' } } });
    expect(error).toBeNull();
    const B = sb.user!.id;
    let a: SupabaseClient | null = null;
    try {
      // B a vu et classé deux films ; A va les comparer aux siens.
      const now = new Date().toISOString();
      const copy = (id: number, name: string) => ({ key: `movie:${id}`, type: 'movie', tmdbId: id, title: name, originalTitle: name, year: 2010, posterPath: null, overview: '', voteCount: 900, popularity: 1, genreIds: [18], originalLanguage: 'en' });
      await b.from('answers').upsert([
        { user_id: B, key: 'movie:1', type: 'movie', status: 'seen', tier: 'good', client_updated_at: now, title: copy(1, 'Film commun') },
        { user_id: B, key: 'movie:2', type: 'movie', status: 'seen', tier: 'good', client_updated_at: now, title: copy(2, 'Le conseil de Bob') },
      ]);
      await b.from('user_meta').upsert([{ user_id: B, key: 'ranking:movie', value: ['movie:2', 'movie:1'], client_updated_at: now }]);
      const bCode = (await b.from('profiles').select('friend_code').eq('id', B).single()).data!.friend_code as string;

      // A s'inscrit dans l'appli, avec un titre déjà trié sur l'appareil.
      await page.goto('/');
      await page.locator('.tiles').waitFor();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            const req = indexedDB.open('sort-my-stuffs');
            req.onsuccess = () => {
              const tx = req.result.transaction(['titles', 'answers'], 'readwrite');
              tx.objectStore('titles').put({ key: 'movie:1', type: 'movie', tmdbId: 1, title: 'Film commun', originalTitle: 'Film commun', year: 2010, posterPath: null, overview: '', voteCount: 900, popularity: 1, genreIds: [18], originalLanguage: 'en' });
              tx.objectStore('answers').put({ key: 'movie:1', type: 'movie', status: 'seen', tier: 'good', updatedAt: Date.now() });
              tx.oncomplete = () => {
                req.result.close();
                resolve();
              };
            };
          }),
      );
      await page.goto('/#/settings');
      await page.getByText('Créer un compte').click();
      await page.getByPlaceholder('Pseudo').fill('Alice Test');
      await page.getByPlaceholder('E-mail').fill(emailA);
      await page.getByPlaceholder('Mot de passe (6 caractères min.)').fill(PASSWORD);
      await page.getByRole('button', { name: 'Créer mon compte' }).click();
      await expect(page.getByText('✓ À jour')).toBeVisible({ timeout: 20_000 });

      // Le titre trié sur l'appareil est bien arrivé sur le compte (synchro typée).
      a = client();
      const A = (await a.auth.signInWithPassword({ email: emailA, password: PASSWORD })).data.user!.id;
      const { data: sent } = await a.from('answers').select('key, status, tier, deleted').eq('user_id', A).eq('key', 'movie:1');
      expect(sent).toEqual([{ key: 'movie:1', status: 'seen', tier: 'good', deleted: false }]);

      // A ajoute B avec son lien d'invitation, puis compare.
      await page.goto(`/#/invite/${bCode}`);
      await page.getByRole('button', { name: 'Ajouter Bob Test à mes amis' }).click();
      await page.getByRole('link', { name: 'À deux →' }).click();
      await expect(page.locator('.row-text', { hasText: 'Le conseil de Bob' })).toBeVisible(); // son top
      await page.locator('button.chip', { hasText: 'Conseils' }).click();
      await page.getByRole('button', { name: 'Ajouter à ta wishlist' }).first().click();
      await expect(page.getByText('Dans ta wishlist')).toBeVisible();
      // Seulement les lignes de A : une fois amis, A lit aussi ce que B partage.
      await expect.poll(async () => (await a!.from('answers').select('status').eq('user_id', A).eq('key', 'movie:2')).data, { timeout: 20_000 }).toEqual([{ status: 'wish' }]);

      // Suppression du compte depuis l'appli.
      page.on('dialog', (d) => d.accept());
      await page.goto('/#/settings');
      await page.getByRole('button', { name: 'Supprimer mon compte' }).click();
      await expect(page.getByText('Continuer avec Google')).toBeVisible({ timeout: 20_000 });
      const { error: gone } = await client().auth.signInWithPassword({ email: emailA, password: PASSWORD });
      expect(gone).not.toBeNull();
      a = null;
    } finally {
      if (a) await a.rpc('delete_account');
      await b.rpc('delete_account');
    }
  });
});
