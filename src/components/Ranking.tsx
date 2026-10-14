import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Title } from '../db';
import {
  duelsLeft,
  loadInsert,
  loadRanking,
  readRanking,
  saveInsert,
  saveRanking,
  unrankedKeys,
  type InsertState,
  type Scope,
} from '../ranking';
import { Poster, TitleText } from './common';
import { burst, centerOf, toast } from '../fun';
import { recordActivity } from '../activity';

interface DuelState {
  ranking: string[];
  ins: InsertState | null;
  candidate?: Title;
  opponent?: Title;
  candidateLeft: boolean;
  unranked: number;
}

/**
 * Chaque titre non classé est inséré par dichotomie : on le compare au titre du milieu
 * de l'intervalle possible, ce qui divise l'intervalle par deux à chaque duel.
 */
export function Duel({ scope, question, emptyText }: { scope: Scope; question: string; emptyText: string }) {
  const [st, setSt] = useState<DuelState | null>(null);
  const [placed, setPlaced] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const skipped = useRef(new Set<string>());
  const undoStack = useRef<{ ranking: string[]; ins: InsertState }[]>([]);
  const busy = useRef(false);

  const show = async (ranking: string[], ins: InsertState, unranked: number) => {
    const mid = Math.floor((ins.lo + ins.hi) / 2);
    const [candidate, opponent] = await db.titles.bulkGet([ins.key, ranking[mid]]);
    setSt({ ranking, ins, candidate, opponent, candidateLeft: Math.random() < 0.5, unranked });
  };

  /** Choisit le prochain titre à placer (le premier entre directement dans le classement). */
  const next = async (ranking: string[]) => {
    let r = ranking;
    for (;;) {
      const pool = (await unrankedKeys(scope, r)).filter((k) => !skipped.current.has(k));
      if (!pool.length) {
        await saveInsert(scope, null);
        setSt({ ranking: r, ins: null, candidateLeft: true, unranked: 0 });
        return;
      }
      const key = pool[Math.floor(Math.random() * pool.length)];
      if (!r.length) {
        r = [key];
        await saveRanking(scope, r);
        continue;
      }
      const ins = { key, lo: 0, hi: r.length };
      await saveInsert(scope, ins);
      await show(r, ins, pool.length);
      return;
    }
  };

  useEffect(() => {
    (async () => {
      const ranking = await loadRanking(scope);
      const ins = await loadInsert(scope);
      const unranked = await unrankedKeys(scope, ranking);
      // Reprend le placement en cours s'il est toujours valide.
      if (ins && unranked.includes(ins.key) && ins.lo >= 0 && ins.lo < ins.hi && ins.hi <= ranking.length) {
        await show(ranking, ins, unranked.length);
      } else {
        await next(ranking);
      }
    })();
  }, [scope.type, scope.list]);

  const choose = async (choice: 'candidate' | 'opponent' | 'tie') => {
    if (!st?.ins || busy.current) return;
    busy.current = true;
    try {
      const { ranking, ins } = st;
      undoStack.current.push({ ranking, ins });
      recordActivity();
      const mid = Math.floor((ins.lo + ins.hi) / 2);
      let { lo, hi } = ins;
      if (choice === 'tie') lo = hi = mid;
      else if (choice === 'candidate') hi = mid;
      else lo = mid + 1;

      if (lo >= hi) {
        const updated = [...ranking];
        updated.splice(lo, 0, ins.key);
        await saveRanking(scope, updated);
        setPlaced((n) => n + 1);
        const title = st.candidate?.title ?? '';
        toast(scope.list === 'seen' ? `🏆 « ${title} » classé n°${lo + 1}` : `💖 « ${title} » priorité n°${lo + 1}`);
        await next(updated);
      } else {
        const updated = { ...ins, lo, hi };
        await saveInsert(scope, updated);
        await show(ranking, updated, st.unranked);
      }
    } finally {
      busy.current = false;
      setPicked(null);
    }
  };

  const undo = async () => {
    const prev = undoStack.current.pop();
    if (!prev || busy.current) return;
    if (st && prev.ranking.length < st.ranking.length) setPlaced((n) => Math.max(0, n - 1));
    await saveRanking(scope, prev.ranking);
    await saveInsert(scope, prev.ins);
    await show(prev.ranking, prev.ins, (await unrankedKeys(scope, prev.ranking)).length);
  };

  const skip = async () => {
    if (!st?.ins) return;
    skipped.current.add(st.ins.key);
    await next(st.ranking);
  };

  if (!st) return <p className="muted center">Chargement…</p>;

  if (!st.ins || !st.candidate || !st.opponent) {
    return (
      <div className="empty">
        <span className="big-emoji">{st.ranking.length ? '🏆' : '🍿'}</span>
        <p>{st.ranking.length ? 'Tout est classé !' : emptyText}</p>
        {undoStack.current.length > 0 && (
          <button className="btn" onClick={undo} title="Revenir sur le dernier choix">
            ↶ Annuler le dernier choix
          </button>
        )}
      </div>
    );
  }

  const left = st.candidateLeft ? st.candidate : st.opponent;
  const right = st.candidateLeft ? st.opponent : st.candidate;
  const pick = (t: Title, el: HTMLElement) => {
    if (picked || busy.current) return;
    setPicked(t.key);
    burst(scope.list === 'seen' ? ['⭐', '👑'] : ['💖', '✨'], centerOf(el), 8);
    setTimeout(() => choose(t.key === st.candidate!.key ? 'candidate' : 'opponent'), 320);
  };

  return (
    <>
      <p className="question">{question}</p>
      <div className="duel">
        <span className="vs" aria-hidden>
          VS
        </span>
        {[left, right].map((t) => (
          <button
            key={t.key}
            className={`duel-card ${picked === t.key ? 'winner' : picked ? 'loser' : ''}`}
            onClick={(e) => pick(t, e.currentTarget)}
            title={`Choisir « ${t.title} »`}
          >
            <Poster title={t} size="w342" />
            <TitleText title={t} credits />
          </button>
        ))}
      </div>
      <div className="row center">
        <button className="btn" onClick={undo} disabled={!undoStack.current.length} title="Revenir sur le dernier choix">
          ↶ Annuler
        </button>
        <button className="btn" onClick={() => choose('tie')} title="Impossible de départager : les placer côte à côte">
          Égalité
        </button>
        <button className="btn" onClick={skip} title="Laisser ce titre de côté pour cette session">
          Passer ce titre
        </button>
      </div>
      <p className="muted small center">
        Encore ~{duelsLeft(st.ins)} duel(s) pour placer « {st.candidate.title} »
        <br />
        {st.ranking.length} classés · {st.unranked} non classés · {placed} placés cette session
      </p>
    </>
  );
}

/** Classement numéroté, suivi des titres pas encore classés. */
export function RankedList({ scope, empty, actions }: { scope: Scope; empty: string; actions: (t: Title, ranked: boolean) => ReactNode }) {
  const data = useLiveQuery(async () => {
    const ranking = await readRanking(scope);
    const unranked = await unrankedKeys(scope, ranking);
    const [r, u] = await Promise.all([db.titles.bulkGet(ranking), db.titles.bulkGet(unranked)]);
    const ok = (t: Title | undefined): t is Title => !!t;
    return { ranked: r.filter(ok), unranked: u.filter(ok).sort((a, b) => a.title.localeCompare(b.title, 'fr')) };
  }, [scope.type, scope.list]);

  if (!data) return <p className="muted center">Chargement…</p>;
  if (!data.ranked.length && !data.unranked.length) return <p className="muted center">{empty}</p>;

  return (
    <>
      <ol className="list">
        {data.ranked.map((t, i) => (
          <li key={t.key} className="list-item">
            <span className={`rank-num ${i < 3 ? 'medal' : ''}`}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
            <Poster title={t} size="w92" className="thumb" />
            <TitleText title={t} />
            <div className="item-actions">{actions(t, true)}</div>
          </li>
        ))}
      </ol>
      {data.unranked.length > 0 && (
        <>
          <h3 className="section-title">Non classés ({data.unranked.length})</h3>
          <ul className="list">
            {data.unranked.map((t) => (
              <li key={t.key} className="list-item">
                <Poster title={t} size="w92" className="thumb" />
                <TitleText title={t} />
                <div className="item-actions">{actions(t, false)}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
