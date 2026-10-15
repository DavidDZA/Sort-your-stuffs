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
  if (delta > 0) dispatchEvent(new Event('activity'));
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

/** Plus longue série de jours consécutifs avec au moins une action. */
export function bestStreak(a: Activity): number {
  const days = Object.keys(a)
    .filter((k) => a[k] > 0)
    .sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of days) {
    const d = new Date(`${k}T12:00:00`);
    run = prev && Math.round((d.getTime() - prev.getTime()) / 86_400_000) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Les `n` derniers jours (du plus ancien à aujourd'hui) avec leur nombre d'actions. */
export function lastDays(a: Activity, n: number): { date: Date; count: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return { date: d, count: a[day(d)] ?? 0 };
  });
}
