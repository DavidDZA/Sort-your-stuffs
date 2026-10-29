import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Table } from 'dexie';
import { db, setMeta, setStatus, clearStatus } from '../src/lib/db';
import { hashOf, mergeMeta, plan, stableStringify, type Row } from '../src/lib/cloudMerge';
import { syncWith, type Remote } from '../src/lib/cloud';
import { readRanking, saveRanking } from '../src/lib/ranking';
import { DEFAULT_MIN_VOTES, getMinVotes, migrateMinVotes } from '../src/lib/settings';
import { makeTitle } from './helpers';

const row = (id: string, data: unknown, at: number): Row => ({ id, data, at });
const rows = (...r: Row[]) => new Map(r.map((x) => [x.id, x]));
const shadowOf = (...r: Row[]) => new Map(r.map((x) => [x.id, hashOf(x.data)!]));

describe('fusion (logique pure)', () => {
  it('ignore l’ordre des clés (jsonb le change)', () => {
    expect(stableStringify({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(stableStringify({ a: [{ c: 3, d: 2 }], b: 1 }));
    expect(hashOf({ b: 1, a: 2 })).toBe(hashOf({ a: 2, b: 1 }));
  });

  it('envoie les lignes modifiées sur l’appareil, y compris les suppressions', () => {
    const synced = row('a:movie:1', { status: 'seen', tier: null }, 1);
    const p = plan(rows(row('a:movie:2', { status: 'wish', tier: null }, 5)), shadowOf(synced), [], 100);
    expect(p.apply).toEqual([]);
    expect(p.push).toEqual([row('a:movie:2', { status: 'wish', tier: null }, 5), { id: 'a:movie:1', at: 100 }]);
  });

  it('applique une ligne du compte si l’appareil ne l’a pas modifiée', () => {
    const old = row('a:movie:1', { status: 'wish', tier: null }, 1);
    const remote = row('a:movie:1', { status: 'seen', tier: 'good' }, 9);
    const p = plan(rows(old), shadowOf(old), [remote], 100);
    expect(p.apply).toEqual([remote]);
    expect(p.push).toEqual([]);
    expect(p.shadow.get('a:movie:1')).toBe(hashOf(remote.data));
  });

  it('en cas de conflit, la version la plus récente gagne', () => {
    const old = row('a:movie:1', { status: 'wish', tier: null }, 1);
    const mine = row('a:movie:1', { status: 'unseen', tier: null }, 50);
    const older = row('a:movie:1', { status: 'seen', tier: null }, 40);
    const newer = row('a:movie:1', { status: 'seen', tier: null }, 60);
    expect(plan(rows(mine), shadowOf(old), [older], 100)).toMatchObject({ apply: [], push: [mine] });
    expect(plan(rows(mine), shadowOf(old), [newer], 100)).toMatchObject({ apply: [newer], push: [] });
  });

  it('applique une suppression reçue', () => {
    const old = row('m:ranking:movie', ['a', 'b'], 1);
    const p = plan(rows(old), shadowOf(old), [{ id: 'm:ranking:movie', at: 9 }], 100);
    expect(p.apply).toEqual([{ id: 'm:ranking:movie', at: 9 }]);
    expect(p.shadow.get('m:ranking:movie')).toBeNull();
  });

  it('ne fait rien quand les deux côtés ont le même contenu', () => {
    const mine = row('a:movie:1', { status: 'seen', tier: null }, 5);
    const p = plan(rows(mine), new Map(), [row('a:movie:1', { tier: null, status: 'seen' }, 3)], 100);
    expect(p).toMatchObject({ apply: [], push: [] });
  });

  it('fusionne l’activité et les badges modifiés des deux côtés', () => {
    expect(mergeMeta('m:activity', { d1: 3, d2: 1 }, { d1: 5, d3: 2 })).toEqual({ d1: 5, d2: 1, d3: 2 });
    expect(mergeMeta('m:badges', ['a', 'b'], ['b', 'c'])).toEqual(['b', 'c', 'a']);
    const p = plan(rows(row('m:badges', ['a'], 5)), new Map(), [row('m:badges', ['b'], 9)], 100);
    expect(p.apply).toEqual([row('m:badges', ['b', 'a'], 100)]);
    expect(p.push).toEqual([row('m:badges', ['b', 'a'], 100)]);
  });
});

/** Compte en mémoire : se comporte comme les tables Supabase (curseur = numéro d'écriture). */
function fakeRemote(): Remote & { data: Map<string, Row & { n: number }> } {
  let n = 0;
  const data = new Map<string, Row & { n: number }>();
  return {
    data,
    async pull(table, since) {
      const prefix = table === 'answers' ? 'a:' : 'm:';
      const list = [...data.values()].filter((r) => r.id.startsWith(prefix) && r.n > Number(since ?? 0)).sort((a, b) => a.n - b.n);
      return { rows: list.map(({ n: _n, ...r }) => r), cursor: list.length ? String(list[list.length - 1].n) : since };
    },
    async push(_table, rows) {
      for (const r of rows) data.set(r.id, { ...r, n: ++n });
    },
  };
}

const tables = [db.titles, db.answers, db.meta, db.synced] as unknown as Table<unknown, string>[];
/** Contenu de la base locale, pour simuler deux appareils avec une seule base. */
const snapshot = async () => Promise.all(tables.map((t) => t.toArray()));
async function restore(s: unknown[][]) {
  await Promise.all(tables.map((t) => t.clear()));
  await Promise.all(tables.map((t, i) => t.bulkPut(s[i])));
}

const USER = 'user-1';
const seen = { type: 'movie' as const, list: 'seen' as const };

beforeEach(async () => {
  await Promise.all(tables.map((t) => t.clear()));
});

describe('synchro entre deux appareils', () => {
  it('envoie tout au premier login, puis un nouvel appareil récupère tout', async () => {
    const remote = fakeRemote();
    await setStatus(makeTitle(1), 'seen', 'good');
    await setStatus(makeTitle(2, { manual: true }), 'wish');
    await saveRanking(seen, ['movie:1']);
    await db.meta.put({ key: 'lastSync', value: 123 }); // propre à l'appareil : pas envoyé
    await syncWith(remote, USER);
    expect([...remote.data.keys()].sort()).toEqual(['a:movie:1', 'a:movie:2', 'm:ranking:movie']);
    expect(remote.data.get('a:movie:2')?.title).toMatchObject({ title: 'Titre 2', manual: true });

    // Nouvel appareil, sans catalogue.
    await restore([[], [], [], []]);
    await syncWith(remote, USER);
    expect((await db.answers.get('movie:1'))?.tier).toBe('good');
    expect((await db.titles.get('movie:2'))?.title).toBe('Titre 2');
    expect(await readRanking(seen)).toEqual(['movie:1']);
  });

  it('propage les modifications et les suppressions', async () => {
    const remote = fakeRemote();
    await setStatus(makeTitle(1), 'wish');
    await setStatus(makeTitle(2), 'seen');
    await syncWith(remote, USER);
    const deviceA = await snapshot();

    await restore([[], [], [], []]);
    await syncWith(remote, USER); // appareil B
    await setStatus(makeTitle(1), 'seen', 'meh');
    await clearStatus('movie:2');
    await syncWith(remote, USER);

    await restore(deviceA);
    await syncWith(remote, USER); // retour sur A
    expect(await db.answers.get('movie:1')).toMatchObject({ status: 'seen', tier: 'meh' });
    expect(await db.answers.get('movie:2')).toBeUndefined();
    // Une synchro de plus ne change rien et n'envoie rien.
    const before = remote.data.size;
    const pushed = [...remote.data.values()].map((r) => r.n);
    await syncWith(remote, USER);
    expect(remote.data.size).toBe(before);
    expect([...remote.data.values()].map((r) => r.n)).toEqual(pushed);
  });

  it('garde la réponse la plus récente quand deux appareils changent le même titre', async () => {
    const remote = fakeRemote();
    await setStatus(makeTitle(1), 'wish');
    await syncWith(remote, USER);
    const deviceA = await snapshot();

    await db.answers.put({ key: 'movie:1', type: 'movie', status: 'unseen', updatedAt: Date.now() + 10_000 }); // B, plus tard
    await syncWith(remote, USER);

    await restore(deviceA);
    await db.answers.put({ key: 'movie:1', type: 'movie', status: 'seen', updatedAt: Date.now() }); // A, plus tôt, pas encore synchronisé
    await syncWith(remote, USER);
    expect((await db.answers.get('movie:1'))?.status).toBe('unseen');
  });

  it('fusionne tout quand un appareil se connecte à un autre compte', async () => {
    const remote = fakeRemote();
    await setStatus(makeTitle(1), 'seen');
    await syncWith(remote, USER);
    const other = fakeRemote();
    await syncWith(other, 'user-2');
    expect([...other.data.keys()]).toEqual(['a:movie:1']); // ombres remises à zéro : tout est envoyé
  });

  it('les modifications de meta ont une date (pour arbitrer les conflits)', async () => {
    const before = Date.now();
    await setMeta('badges', ['first']);
    expect((await db.meta.get('badges'))?.updatedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('seuils de votes', () => {
  it('reprend les seuils de localStorage dans la base, puis les synchronise', async () => {
    const store = new Map<string, string>([['min-votes', JSON.stringify({ movie: 150, tv: 50 })]]);
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;
    try {
      expect(await getMinVotes()).toEqual(DEFAULT_MIN_VOTES);
      await migrateMinVotes();
      expect(await getMinVotes()).toEqual({ ...DEFAULT_MIN_VOTES, movie: 150 });
      expect(store.has('min-votes')).toBe(false);

      const remote = fakeRemote();
      await syncWith(remote, USER);
      await restore([[], [], [], []]); // autre appareil
      expect(await getMinVotes()).toEqual(DEFAULT_MIN_VOTES);
      await syncWith(remote, USER);
      expect(await getMinVotes()).toEqual({ ...DEFAULT_MIN_VOTES, movie: 150 });
    } finally {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  });
});
