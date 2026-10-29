import { db, getMeta, type Title } from '../../lib/db';
import { categoryOf, mediaOf, type Category } from '../../lib/category';
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

/** Retire des titres du tirage (ils sont déjà dans la file). */
export function removeFromPool(pool: Pool, keys: Set<string>) {
  pool.items = pool.items.filter((i) => !keys.has(i.title.key));
  pool.total = pool.items.reduce((s, i) => s + i.w, 0);
}

/** Précharge l'affiche (téléchargée et décodée) et la fiche détaillée. */
export function prefetch(title: Title) {
  const src = posterUrl(title.posterPath, 'w500');
  if (src) {
    // Décodée à l'avance : pas d'accroc quand la carte arrive à l'écran.
    const img = new Image();
    img.src = src;
    img.decode?.().catch(() => undefined);
  }
  ensureDetails(title);
}

// Catalogue gardé en mémoire d'une visite du swipe à l'autre (sa lecture prend du temps sur un gros
// catalogue), préchargé depuis l'accueil ; relu après une mise à jour du catalogue.
const catalogues = new Map<Category, { lastSync: number | null; titles: Promise<Title[]> }>();

/** Titres du catalogue de cette catégorie (le tableau gardé en mémoire : les ajouts du swipe y restent). */
export async function loadCatalogue(type: Category): Promise<Title[]> {
  const lastSync = await getMeta<number | null>('lastSync', null);
  let cached = catalogues.get(type);
  if (!cached || cached.lastSync !== lastSync) {
    const titles = db.titles.where('type').equals(mediaOf(type)).toArray();
    cached = { lastSync, titles: type === 'movie' ? titles : titles.then((list) => list.filter((t) => categoryOf(t) === type)) };
    cached.titles.catch(() => catalogues.delete(type));
    catalogues.set(type, cached);
  }
  return cached.titles;
}

/** La saga d'un titre se déduit sans réseau : sa fiche (même ancienne) dit déjà s'il en fait partie. */
export const sagaKnownLocally = (t: Title) => t.type !== 'movie' || t.details?.collection !== undefined;

export interface SagaInfo {
  id: number;
  name: string;
  parts: Title[]; // films sortis, par ordre de sortie
}

/**
 * Saga d'un film (ou null), avec ses films dans la version enregistrée dans la base.
 * Il faut au moins 2 films sortis : une « saga » dont la suite n'est pas encore sortie n'en est pas une.
 */
export async function sagaOf(title: Title): Promise<SagaInfo | null> {
  if (title.type !== 'movie') return null;
  // Une fiche ancienne suffit pour savoir si le film est dans une saga : pas besoin de la récupérer à nouveau.
  const d = title.details?.collection !== undefined ? title.details : await ensureDetails(title);
  if (!d?.collection) return null;
  const saga = await fetchSaga(d.collection.id);
  if (!saga || saga.parts.length < 2) return null;
  const stored = await db.titles.bulkGet(saga.parts.map((p) => p.key));
  return { id: saga.id, name: saga.name, parts: saga.parts.map((p, i) => stored[i] ?? p) };
}

/**
 * Enchaîne une saga dans la file : à la place du titre tiré (à `index`), tous les films
 * à trier de la saga, dans l'ordre de sortie, sans doublon ailleurs dans la file.
 * Les cartes avant `index` ne bougent pas ; si `keepFirst`, le titre tiré (déjà affiché) reste en premier.
 */
export function chainSaga(queue: Title[], index: number, parts: Title[], keepFirst = false): Title[] {
  const before = queue.slice(0, index);
  const fixed = new Set(before.map((t) => t.key));
  const drawn = queue[index];
  let chain = parts.filter((p) => !fixed.has(p.key));
  if (keepFirst) chain = [drawn, ...chain.filter((p) => p.key !== drawn.key)];
  const inChain = new Set(chain.map((t) => t.key));
  return [...before, ...chain, ...queue.slice(index).filter((t) => !inChain.has(t.key))];
}

/** Étiquette affichée sur l'affiche d'un film de saga : « 🎞️ Harry Potter · 2/8 ». */
export interface SagaTag {
  name: string;
  position: number; // place du film dans la saga complète (ordre de sortie)
  total: number;
}

/** Nom de saga sans le mot « Saga » / « Collection » ajouté par TMDB (« Harry Potter - Saga » → « Harry Potter »). */
export const shortSagaName = (name: string) =>
  name
    .replace(/\s*[-–:]\s*(saga|collection)$/i, '')
    .replace(/^(saga|collection)\s+/i, '')
    .trim();

/** Étiquettes de tous les films d'une saga, par clé de titre. */
export function sagaTags(saga: SagaInfo): Record<string, SagaTag> {
  if (saga.parts.length < 2) return {};
  const name = shortSagaName(saga.name);
  return Object.fromEntries(saga.parts.map((p, i) => [p.key, { name, position: i + 1, total: saga.parts.length }]));
}
