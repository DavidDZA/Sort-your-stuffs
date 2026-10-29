import { splitAnimeRankings } from './ranking';
import { db, detailsMarks, isUserMeta, setMeta, type Answer, type Meta, type Title } from './db';

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
  const meta = (await db.meta.toArray()).filter((m) => isUserMeta(m.key));
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
  // Sauvegardes d'avant le 30/10 : les fiches détaillées sont dans les titres, on les range à part.
  const details = backup.titles.filter((t) => t.details).map((t) => ({ ...t.details!, key: t.key }));
  const titles = backup.titles.map((t) => (t.details ? { ...t, ...detailsMarks(t.type, t.details), details: undefined } : t));
  await db.transaction('rw', [db.titles, db.answers, db.meta, db.details], async () => {
    await db.answers.clear();
    await db.meta.where('key').startsWith('ranking:').delete();
    await db.meta.where('key').startsWith('insert:').delete();
    await db.titles.bulkPut(titles);
    await db.details.bulkPut(details);
    await db.answers.bulkPut(backup.answers);
    await db.meta.bulkPut(backup.meta.map((m) => ({ ...m, updatedAt: Date.now() }))); // restaurés = modifiés maintenant
  });
  await splitAnimeRankings(); // sauvegarde d'avant la catégorie Animes
  return backup.answers.length;
}
