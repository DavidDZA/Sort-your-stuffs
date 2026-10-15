/** Paliers d'une tier list, du meilleur au moins bon, avec leur part du classement. */
export const TIERS = [
  { label: 'S', share: 0.1, color: '#ff5f6d' },
  { label: 'A', share: 0.2, color: '#ff9f43' },
  { label: 'B', share: 0.3, color: '#ffd166' },
  { label: 'C', share: 0.25, color: '#3ee08f' },
  { label: 'D', share: 0.15, color: '#5b8cff' },
] as const;

export type TierLabel = (typeof TIERS)[number]['label'];

/**
 * Répartit un classement (du préféré au moins aimé) en paliers selon leur part.
 * Chaque palier non vide garde au moins un titre tant qu'il en reste.
 */
export function tierize<T>(ranking: T[]): { label: TierLabel; color: string; items: T[] }[] {
  const n = ranking.length;
  let start = 0;
  let cumulative = 0;
  return TIERS.map((tier, i) => {
    cumulative += tier.share;
    let end = i === TIERS.length - 1 ? n : Math.round(cumulative * n);
    if (end <= start && start < n) end = start + 1; // au moins un titre par palier
    const items = ranking.slice(start, end);
    start = Math.max(start, end);
    return { label: tier.label, color: tier.color, items };
  });
}
