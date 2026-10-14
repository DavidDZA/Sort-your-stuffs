import { db, setMeta, type Answer, type Meta, type Title } from './db';

interface Backup {
  app: 'sort-my-stuffs';
  version: 1;
  exportedAt: string;
  titles: Title[];
  answers: Answer[];
  meta: Meta[];
}

/** Exporte les réponses, les classements et les titres concernés (pas besoin du catalogue pour restaurer). */
export async function exportData(): Promise<void> {
  const answers = await db.answers.toArray();
  const titles = (await db.titles.bulkGet(answers.map((a) => a.key))).filter((t): t is Title => !!t);
  const meta = (await db.meta.toArray()).filter((m) => /^(ranking:|saga:)/.test(m.key) || m.key === 'activity' || m.key === 'badges');
  const backup: Backup = { app: 'sort-my-stuffs', version: 1, exportedAt: new Date().toISOString(), titles, answers, meta };

  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sort-my-stuffs-${backup.exportedAt.slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  await setMeta('lastExport', Date.now());
}

/** Restaure une sauvegarde : remplace toutes les réponses et classements actuels. */
export async function importData(file: File): Promise<number> {
  const backup = JSON.parse(await file.text()) as Backup;
  if (backup.app !== 'sort-my-stuffs' || !Array.isArray(backup.answers)) throw new Error('Fichier de sauvegarde invalide.');
  await db.transaction('rw', db.titles, db.answers, db.meta, async () => {
    await db.answers.clear();
    await db.meta.where('key').startsWith('ranking:').delete();
    await db.meta.where('key').startsWith('insert:').delete();
    await db.titles.bulkPut(backup.titles);
    await db.answers.bulkPut(backup.answers);
    await db.meta.bulkPut(backup.meta);
  });
  return backup.answers.length;
}
