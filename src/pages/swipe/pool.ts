import { db, type Title } from '../../lib/db';
import { ensureDetails, fetchSaga, posterUrl } from '../../lib/tmdb';

/**
 * Tirage aléatoire pondéré par le nombre de votes TMDB : les titres connus sortent
 * plus souvent, donc on tombe vite sur des films qu'on a vus. 1 = proportionnel.
 */
export const WEIGHT_EXP = 0.9;
export const QUEUE_SIZE = 4;

export interface Pool {
  items: { title: Title; w: number }[];
  total: number;
}

/** Tire un titre (pondéré) et le retire du tirage. */
export function draw(pool: Pool): Title | null {
  if (!pool.items.length) return null;
  let r = Math.random() * pool.total;
  let i = 0;
  while (i < pool.items.length - 1 && r >= pool.items[i].w) r -= pool.items[i++].w;
  const [picked] = pool.items.splice(i, 1);
  pool.total -= picked.w;
  return picked.title;
}

/** Précharge l'affiche, la fiche détaillée et, pour un film de saga, la liste de ses suites. */
export function prefetch(title: Title) {
  const src = posterUrl(title.posterPath, 'w500');
  if (src) {
    // Téléchargée ET décodée à l'avance : pas d'accroc quand la carte arrive à l'écran.
    const img = new Image();
    img.src = src;
    img.decode?.().catch(() => undefined);
  }
  ensureDetails(title).then((d) => {
    if (d?.collection) fetchSaga(d.collection.id);
  });
}

/** Films de la même saga pas encore triés, dans l'ordre de sortie. */
export async function sagaFollowUps(title: Title): Promise<{ name: string; parts: Title[] } | null> {
  if (title.type !== 'movie') return null;
  const d = await ensureDetails(title);
  if (!d?.collection) return null;
  const saga = await fetchSaga(d.collection.id);
  if (!saga) return null;
  const others = saga.parts.filter((p) => p.key !== title.key);
  const [answers, stored] = await Promise.all([db.answers.bulkGet(others.map((p) => p.key)), db.titles.bulkGet(others.map((p) => p.key))]);
  const parts = others.map((p, i) => stored[i] ?? p).filter((_, i) => !answers[i]);
  return parts.length ? { name: saga.name, parts } : null;
}
