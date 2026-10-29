/**
 * Fusion entre l'appareil et le compte (logique pure, sans base ni réseau).
 *
 * Chaque ligne (réponse « a:<clé> » ou meta « m:<clé> ») est comparée à sa dernière version synchronisée
 * (« ombre ») : différente = modifiée sur l'appareil depuis la dernière synchro. Une ligne reçue du compte
 * remplace la version locale si celle-ci n'a pas bougé ; si les deux ont changé, la plus récente gagne
 * (ou les deux sont fusionnées, pour l'activité et les badges).
 */

/** Une ligne synchronisable ; `data` absent = supprimée (pierre tombale). `at` : date de modification (ms). */
export interface Row {
  id: string;
  data?: unknown;
  at: number;
  /** Copie du titre jointe à une réponse reçue, pour l'afficher s'il manque au catalogue local. */
  title?: unknown;
}

/** JSON aux clés triées : PostgreSQL (jsonb) ne garde pas l'ordre des clés d'un objet. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => stableStringify(x ?? null)).join(',')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    return `{${entries
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, x]) => `${JSON.stringify(k)}:${stableStringify(x)}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Empreinte courte d'un contenu (cyrb53) ; `undefined` pour une ligne absente ou supprimée. */
export function hashOf(data: unknown): string | undefined {
  if (data === undefined) return undefined;
  const str = stableStringify(data);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Fusion de deux versions modifiées des deux côtés ; `undefined` = la plus récente gagne. */
export function mergeMeta(id: string, mine: unknown, theirs: unknown): unknown {
  if (mine === undefined || theirs === undefined) return undefined;
  if (id === 'm:activity') {
    // Actions par jour : le maximum de chaque jour (les deux appareils ont compté de leur côté).
    const out: Record<string, number> = { ...(theirs as Record<string, number>) };
    for (const [day, n] of Object.entries(mine as Record<string, number>)) out[day] = Math.max(out[day] ?? 0, n);
    return out;
  }
  if (id === 'm:badges') return [...new Set([...(theirs as string[]), ...(mine as string[])])];
  return undefined;
}

export interface Plan {
  /** Lignes du compte à écrire sur l'appareil. */
  apply: Row[];
  /** Lignes de l'appareil à envoyer au compte. */
  push: Row[];
  /** Nouvelles ombres après application (`null` = supprimer l'ombre). */
  shadow: Map<string, string | null>;
}

/**
 * Décide quoi appliquer et quoi envoyer.
 * @param local  état actuel de l'appareil (lignes présentes)
 * @param shadow dernière version synchronisée de chaque ligne
 * @param remote lignes modifiées sur le compte depuis la dernière synchro
 * @param now    date utilisée pour les suppressions et fusions locales
 */
export function plan(local: Map<string, Row>, shadow: Map<string, string>, remote: Row[], now: number): Plan {
  // Modifications locales : contenu différent de la dernière version synchronisée.
  const changed = new Map<string, Row>();
  for (const id of new Set([...local.keys(), ...shadow.keys()])) {
    const row = local.get(id);
    if (hashOf(row?.data) !== shadow.get(id)) changed.set(id, row ?? { id, at: now });
  }

  const apply: Row[] = [];
  const shadowNext = new Map<string, string | null>();
  // Une même ligne peut revenir plusieurs fois (relecture avec recouvrement) : la dernière compte.
  const latest = new Map(remote.map((r) => [r.id, r]));
  for (const r of latest.values()) {
    const theirs = hashOf(r.data);
    const mine = changed.get(r.id);
    if (!mine) {
      if (theirs !== hashOf(local.get(r.id)?.data)) apply.push(r);
      shadowNext.set(r.id, theirs ?? null);
      continue;
    }
    if (hashOf(mine.data) === theirs) {
      // Même contenu des deux côtés : rien à faire.
      changed.delete(r.id);
      shadowNext.set(r.id, theirs ?? null);
      continue;
    }
    const merged = mergeMeta(r.id, mine.data, r.data);
    if (merged !== undefined) {
      const row = { id: r.id, data: merged, at: now };
      apply.push(row);
      changed.set(r.id, row);
    } else if (r.at >= mine.at) {
      // À égalité (anciennes lignes sans date), le compte gagne : le premier appareil connecté fait référence.
      apply.push(r);
      changed.delete(r.id);
      shadowNext.set(r.id, theirs ?? null);
    }
    // Sinon la version locale, plus récente, est envoyée.
  }
  return { apply, push: [...changed.values()], shadow: shadowNext };
}
