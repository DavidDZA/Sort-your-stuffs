import { getMeta, setMeta } from './db';

/** Nombre d'actions (swipes, duels) par jour : { "2026-10-15": 42, ... } */
export type Activity = Record<string, number>;

const KEY = 'activity';

const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const loadActivity = () => getMeta<Activity>(KEY, {});

export async function recordActivity(delta = 1): Promise<void> {
  const a = await loadActivity();
  const today = day(new Date());
  a[today] = Math.max(0, (a[today] ?? 0) + delta);
  await setMeta(KEY, a);
}

export const todayCount = (a: Activity) => a[day(new Date())] ?? 0;

/** Jours d'affilée avec au moins une action (aujourd'hui pas encore compté ne casse pas la série). */
export function streak(a: Activity): number {
  const d = new Date();
  if (!a[day(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (a[day(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
