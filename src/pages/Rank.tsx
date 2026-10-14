import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type MediaType, type Title } from '../db';
import { duelsLeft, loadInsert, loadRanking, readRanking, saveInsert, saveRanking, unrankedKeys, type InsertState } from '../ranking';
import { Poster, TitleText, TopBar, TypeFilter } from '../components/common';

type View = 'duel' | 'list';

export default function Rank({ type }: { type: MediaType }) {
  const [view, setView] = useState<View>('duel');
  return (
    <main className="page">
      <TopBar title={type === 'movie' ? 'Classer les films' : 'Classer les séries'} />
      <TypeFilter<View>
        value={view}
        options={[
          ['duel', 'Duels'],
          ['list', 'Mon classement'],
        ]}
        onChange={setView}
      />
      {view === 'duel' ? <Duel type={type} /> : <RankingList type={type} />}
    </main>
  );
}

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
function Duel({ type }: { type: MediaType }) {
  const [st, setSt] = useState<DuelState | null>(null);
  const [placed, setPlaced] = useState(0);
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
      const pool = (await unrankedKeys(type, r)).filter((k) => !skipped.current.has(k));
      if (!pool.length) {
        await saveInsert(type, null);
        setSt({ ranking: r, ins: null, candidateLeft: true, unranked: 0 });
        return;
      }
      const key = pool[Math.floor(Math.random() * pool.length)];
      if (!r.length) {
        r = [key];
        await saveRanking(type, r);
        continue;
      }
      const ins = { key, lo: 0, hi: r.length };
      await saveInsert(type, ins);
      await show(r, ins, pool.length);
      return;
    }
  };

  useEffect(() => {
    (async () => {
      const ranking = await loadRanking(type);
      const ins = await loadInsert(type);
      const unranked = await unrankedKeys(type, ranking);
      // Reprend le placement en cours s'il est toujours valide.
      if (ins && unranked.includes(ins.key) && ins.lo >= 0 && ins.lo < ins.hi && ins.hi <= ranking.length) {
        await show(ranking, ins, unranked.length);
      } else {
        await next(ranking);
      }
    })();
  }, [type]);

  const choose = async (choice: 'candidate' | 'opponent' | 'tie') => {
    if (!st?.ins || busy.current) return;
    busy.current = true;
    try {
      const { ranking, ins } = st;
      undoStack.current.push({ ranking, ins });
      const mid = Math.floor((ins.lo + ins.hi) / 2);
      let { lo, hi } = ins;
      if (choice === 'tie') lo = hi = mid;
      else if (choice === 'candidate') hi = mid;
      else lo = mid + 1;

      if (lo >= hi) {
        const updated = [...ranking];
        updated.splice(lo, 0, ins.key);
        await saveRanking(type, updated);
        setPlaced((n) => n + 1);
        await next(updated);
      } else {
        const updated = { ...ins, lo, hi };
        await saveInsert(type, updated);
        await show(ranking, updated, st.unranked);
      }
    } finally {
      busy.current = false;
    }
  };

  const undo = async () => {
    const prev = undoStack.current.pop();
    if (!prev || busy.current) return;
    if (st && prev.ranking.length < st.ranking.length) setPlaced((n) => Math.max(0, n - 1));
    await saveRanking(type, prev.ranking);
    await saveInsert(type, prev.ins);
    await show(prev.ranking, prev.ins, (await unrankedKeys(type, prev.ranking)).length);
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
        <p>{st.ranking.length ? 'Tous les titres vus sont classés !' : 'Aucun titre vu pour l’instant.'}</p>
        <p className="muted">Swipe ou ajoute des titres vus pour continuer le classement.</p>
        {undoStack.current.length > 0 && (
          <button className="btn" onClick={undo}>
            ↶ Annuler le dernier choix
          </button>
        )}
      </div>
    );
  }

  const left = st.candidateLeft ? st.candidate : st.opponent;
  const right = st.candidateLeft ? st.opponent : st.candidate;
  const pick = (t: Title) => choose(t.key === st.candidate!.key ? 'candidate' : 'opponent');

  return (
    <>
      <p className="question">Lequel préfères-tu ?</p>
      <div className="duel">
        {[left, right].map((t) => (
          <button key={t.key} className="duel-card" onClick={() => pick(t)}>
            <Poster title={t} size="w342" />
            <TitleText title={t} credits />
          </button>
        ))}
      </div>
      <div className="row center">
        <button className="btn" onClick={undo} disabled={!undoStack.current.length}>
          ↶ Annuler
        </button>
        <button className="btn" onClick={() => choose('tie')}>
          Égalité
        </button>
        <button className="btn" onClick={skip}>
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

function RankingList({ type }: { type: MediaType }) {
  const data = useLiveQuery(async () => {
    const ranking = await readRanking(type);
    const titles = await db.titles.bulkGet(ranking);
    return titles.filter((t): t is Title => !!t);
  }, [type]);

  const rerank = async (key: string) => {
    const ranking = await loadRanking(type);
    await saveRanking(
      type,
      ranking.filter((k) => k !== key),
    );
    await saveInsert(type, null); // les positions changent : on repart d'un placement neuf
  };

  if (!data) return <p className="muted center">Chargement…</p>;
  if (!data.length) return <p className="muted center">Ton classement est vide pour l’instant.</p>;

  return (
    <ol className="list">
      {data.map((t, i) => (
        <li key={t.key} className="list-item">
          <span className="rank-num">{i + 1}</span>
          <Poster title={t} size="w92" className="thumb" />
          <TitleText title={t} />
          <button className="btn small" onClick={() => rerank(t.key)} title="Retirer du classement pour le replacer">
            ↺
          </button>
        </li>
      ))}
    </ol>
  );
}
