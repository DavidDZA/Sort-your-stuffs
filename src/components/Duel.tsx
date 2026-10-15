import { useEffect, useRef, useState } from 'react';
import { db, type Tier, type Title } from '../lib/db';
import {
  duelsLeft,
  initialBounds,
  loadInsert,
  loadRanking,
  pickVerifyPair,
  priorityPool,
  saveInsert,
  saveRanking,
  swapAdjacent,
  tiersOf,
  unrankedKeys,
  type InsertState,
  type Scope,
} from '../lib/ranking';
import { useLongPress } from '../lib/hooks';
import { burst, centerOf, toast } from '../lib/fun';
import { recordActivity } from '../lib/activity';
import { Poster, RatingBadge, TitleText } from './common';
import { openFiche } from './Fiche';

interface DuelState {
  ranking: string[];
  ins: InsertState | null;
  /** Duel de vérification entre ranking[verify] et ranking[verify + 1]. */
  verify: number | null;
  candidate?: Title; // titre à placer, ou le moins bien classé des deux en vérification
  opponent?: Title;
  candidateLeft: boolean;
  unranked: number;
  /** Titres non classés par avis : les « bien » passent avant les « bof ». */
  waiting: { good: number; meh: number };
  tier?: Tier;
}

interface Snapshot {
  ranking: string[];
  ins: InsertState | null;
  verify: number | null;
}

/** Un duel de vérification tous les 5 titres placés. */
const VERIFY_EVERY = 5;

/**
 * Chaque titre non classé est inséré par dichotomie : on le compare au titre du milieu
 * de l'intervalle possible, ce qui divise l'intervalle par deux à chaque duel.
 * De temps en temps, un duel de vérification entre deux voisins affine le classement.
 */
export function Duel({ scope, question, emptyText }: { scope: Scope; question: string; emptyText: string }) {
  const [st, setSt] = useState<DuelState | null>(null);
  const [placed, setPlaced] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const skipped = useRef(new Set<string>());
  const undoStack = useRef<Snapshot[]>([]);
  const busy = useRef(false);
  const placedCount = useRef(0);
  const verifyOnly = useRef(false); // « Affiner mon classement » : uniquement des vérifications

  /** Nombre de titres non classés, et combien sont « bien » / « bof ». */
  const waitingFor = async (ranking: string[]) => {
    const keys = await unrankedKeys(scope, ranking);
    const tiers = await tiersOf(scope, keys);
    return {
      unranked: keys.length,
      waiting: { good: tiers.filter((t) => t === 'good').length, meh: tiers.filter((t) => t === 'meh').length },
    };
  };

  const show = async (ranking: string[], ins: InsertState) => {
    const mid = Math.floor((ins.lo + ins.hi) / 2);
    const [[candidate, opponent], answer, counts] = await Promise.all([
      db.titles.bulkGet([ins.key, ranking[mid]]),
      db.answers.get(ins.key),
      waitingFor(ranking),
    ]);
    setSt({
      ranking,
      ins,
      verify: null,
      candidate,
      opponent,
      candidateLeft: Math.random() < 0.5,
      ...counts,
      tier: scope.list === 'seen' ? answer?.tier : undefined,
    });
  };

  /** Duel de vérification entre ranking[i] et ranking[i + 1] (choisis en priorité parmi les « bien »). */
  const showVerify = async (ranking: string[], index?: number | null) => {
    const i = index === undefined ? pickVerifyPair(await tiersOf(scope, ranking)) : index;
    if (i === null) return next(ranking);
    const [[upper, lower], counts] = await Promise.all([db.titles.bulkGet([ranking[i], ranking[i + 1]]), waitingFor(ranking)]);
    setSt({ ranking, ins: null, verify: i, candidate: lower, opponent: upper, candidateLeft: Math.random() < 0.5, ...counts });
  };

  /** Choisit le prochain titre à placer (le premier entre directement dans le classement). */
  const next = async (ranking: string[]) => {
    let r = ranking;
    for (;;) {
      const pool = (await unrankedKeys(scope, r)).filter((k) => !skipped.current.has(k));
      if (!pool.length) {
        await saveInsert(scope, null);
        setSt({ ranking: r, ins: null, verify: null, candidateLeft: true, unranked: 0, waiting: { good: 0, meh: 0 } });
        return;
      }
      // Les « bien » d'abord : les « bof » attendent qu'ils soient tous classés.
      const choices = priorityPool(pool, await tiersOf(scope, pool));
      const key = choices[Math.floor(Math.random() * choices.length)];
      if (!r.length) {
        r = [key];
        await saveRanking(scope, r);
        continue;
      }
      // Avec un avis « bien » / « bof », l'intervalle de départ est réduit (parfois à une seule place).
      const { lo, hi } = await initialBounds(scope, r, key);
      if (lo >= hi) {
        r = [...r];
        r.splice(lo, 0, key);
        await saveRanking(scope, r);
        setPlaced((n) => n + 1);
        const t = await db.titles.get(key);
        toast(`🏆 « ${t?.title ?? ''} » classé n°${lo + 1} sans duel`);
        continue;
      }
      const ins = { key, lo, hi };
      await saveInsert(scope, ins);
      await show(r, ins);
      return;
    }
  };

  /** Après une décision : vérification seule, vérification périodique, ou titre suivant. */
  const afterDecision = async (ranking: string[], justPlaced: boolean) => {
    if (verifyOnly.current) return showVerify(ranking);
    if (justPlaced && placedCount.current % VERIFY_EVERY === 0 && ranking.length >= 4) return showVerify(ranking);
    return next(ranking);
  };

  useEffect(() => {
    (async () => {
      const ranking = await loadRanking(scope);
      const ins = await loadInsert(scope);
      const unranked = await unrankedKeys(scope, ranking);
      // Reprend le placement en cours s'il est toujours valide.
      if (ins && unranked.includes(ins.key) && ins.lo >= 0 && ins.lo < ins.hi && ins.hi <= ranking.length) {
        await show(ranking, ins);
      } else {
        await next(ranking);
      }
    })();
  }, [scope.type, scope.list]);

  const choose = async (choice: 'candidate' | 'opponent' | 'tie') => {
    if (!st || (!st.ins && st.verify === null) || busy.current) return;
    busy.current = true;
    try {
      const { ranking, ins, verify } = st;
      undoStack.current.push({ ranking, ins, verify });
      recordActivity();

      if (verify !== null) {
        // Vérification : on échange les deux voisins seulement si le moins bien classé est préféré.
        let updated = ranking;
        if (choice === 'candidate') {
          updated = swapAdjacent(ranking, verify);
          await saveRanking(scope, updated);
          toast(`↕️ « ${st.candidate?.title ?? ''} » remonte n°${verify + 1}`);
        }
        await afterDecision(updated, false);
        return;
      }

      const mid = Math.floor((ins!.lo + ins!.hi) / 2);
      let { lo, hi } = ins!;
      if (choice === 'tie') lo = hi = mid;
      else if (choice === 'candidate') hi = mid;
      else lo = mid + 1;

      if (lo >= hi) {
        const updated = [...ranking];
        updated.splice(lo, 0, ins!.key);
        await saveRanking(scope, updated);
        setPlaced((n) => n + 1);
        placedCount.current++;
        const title = st.candidate?.title ?? '';
        toast(scope.list === 'seen' ? `🏆 « ${title} » classé n°${lo + 1}` : `💖 « ${title} » priorité n°${lo + 1}`);
        await afterDecision(updated, true);
      } else {
        const updated = { ...ins!, lo, hi };
        await saveInsert(scope, updated);
        await show(ranking, updated);
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
    if (prev.verify !== null) await showVerify(prev.ranking, prev.verify);
    else if (prev.ins) await show(prev.ranking, prev.ins);
  };

  const skip = async () => {
    if (!st) return;
    if (st.verify !== null) return verifyOnly.current ? showVerify(st.ranking) : next(st.ranking);
    if (!st.ins) return;
    skipped.current.add(st.ins.key);
    await next(st.ranking);
  };

  const refine = () => {
    if (!st) return;
    verifyOnly.current = true;
    showVerify(st.ranking);
  };

  const left = st?.candidateLeft ? st.candidate : st?.opponent;
  const right = st?.candidateLeft ? st.opponent : st?.candidate;
  const pick = (t: Title, el: HTMLElement | null) => {
    if (!st || picked || busy.current) return;
    setPicked(t.key);
    burst(scope.list === 'seen' ? ['⭐', '👑'] : ['💖', '✨'], centerOf(el), 8);
    setTimeout(() => choose(t.key === st.candidate!.key ? 'candidate' : 'opponent'), 320);
  };

  // Raccourcis clavier (PC) : ← / → choisir, ↓ égalité, Retour arrière annuler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.sheet-backdrop') || (e.target as HTMLElement).closest('input, textarea')) return;
      const cards = document.querySelectorAll<HTMLElement>('.duel-card');
      if (e.key === 'ArrowLeft' && left) pick(left, cards[0]);
      else if (e.key === 'ArrowRight' && right) pick(right, cards[1]);
      else if (e.key === 'ArrowDown' && left) choose('tie');
      else if (e.key === 'Backspace') undo();
      else return;
      e.preventDefault();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  if (!st) return <p className="muted center">Chargement…</p>;

  if ((!st.ins && st.verify === null) || !st.candidate || !st.opponent || !left || !right) {
    return (
      <div className="empty">
        <span className="big-emoji">{st.ranking.length ? '🏆' : '🍿'}</span>
        <p>{st.ranking.length ? 'Tout est classé !' : emptyText}</p>
        {st.ranking.length >= 2 && (
          <button className="btn primary" onClick={refine} title="Des duels entre titres voisins pour corriger le classement">
            🔍 Affiner mon classement
          </button>
        )}
        {undoStack.current.length > 0 && (
          <button className="btn" onClick={undo} title="Revenir sur le dernier choix">
            ↶ Annuler le dernier choix
          </button>
        )}
      </div>
    );
  }

  const verifying = st.verify !== null;

  return (
    <>
      <p className="question">
        {verifying && <span className="verify-tag">🔍 Vérification</span>}
        {question}
      </p>
      <div className="duel">
        <span className="vs" aria-hidden>
          VS
        </span>
        {[left, right].map((t) => (
          <DuelCard
            key={t.key}
            title={t}
            state={picked === t.key ? 'winner' : picked ? 'loser' : ''}
            showInfo={showInfo}
            onPick={(el) => pick(t, el)}
            onToggleInfo={() => setShowInfo((s) => !s)}
          />
        ))}
      </div>
      <div className="row center">
        <button className="btn" onClick={undo} disabled={!undoStack.current.length} title="Revenir sur le dernier choix (Retour arrière)">
          ↶ Annuler
        </button>
        <button className="btn" onClick={() => choose('tie')} title={verifying ? 'Les deux se valent : on ne change rien (↓)' : 'Impossible de départager : les placer côte à côte (↓)'}>
          Égalité
        </button>
        <button className="btn" onClick={skip} title={verifying ? 'Passer à une autre vérification' : 'Laisser ce titre de côté pour cette session'}>
          {verifying ? 'Passer' : 'Passer ce titre'}
        </button>
        {verifying && verifyOnly.current && (
          <button
            className="btn"
            onClick={() => {
              verifyOnly.current = false;
              next(st.ranking);
            }}
            title="Arrêter les vérifications"
          >
            Terminer
          </button>
        )}
      </div>
      <p className="muted small center">
        {verifying ? (
          <>Ces deux titres sont voisins dans ton classement (n°{st.verify! + 1} et n°{st.verify! + 2}) : toujours d’accord ?</>
        ) : (
          <>
            Encore ~{duelsLeft(st.ins!)} duel(s) pour placer « {st.candidate.title} »
            {st.tier && (st.tier === 'good' ? ' · 👍 parmi tes titres « bien »' : ' · 😐 parmi tes titres « bof »')}
          </>
        )}
        <br />
        {st.ranking.length} classés · {st.unranked} non classés · {placed} placés cette session
        {st.waiting.good > 0 && st.waiting.meh > 0 && (
          <>
            <br />👍 {st.waiting.good} « bien » d’abord, puis 😐 {st.waiting.meh} « bof »
          </>
        )}
      </p>
      <p className="muted tiny center kbd-hint">Clavier : ← → choisir · ↓ égalité · ⌫ annuler</p>
    </>
  );
}

function DuelCard(props: {
  title: Title;
  state: string;
  showInfo: boolean;
  onPick: (el: HTMLElement) => void;
  onToggleInfo: () => void;
}) {
  const { title: t, showInfo } = props;
  const longPress = useLongPress(() => openFiche(t));
  return (
    <div
      role="button"
      tabIndex={0}
      className={`duel-card ${props.state}`}
      {...longPress}
      onClick={(e) => props.onPick(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onPick(e.currentTarget);
        }
      }}
      title={`Choisir « ${t.title} » · Appui long : fiche complète`}
    >
      <div className="duel-poster">
        <Poster title={t} size="w342" />
        <RatingBadge title={t} className="corner-left" />
        {showInfo && (
          <div
            className="duel-overview"
            onClick={(e) => {
              e.stopPropagation();
              props.onToggleInfo();
            }}
            title="Toucher pour masquer les résumés"
          >
            <p>{t.overview || 'Pas de résumé disponible.'}</p>
            <button
              className="btn small"
              onClick={(e) => {
                e.stopPropagation();
                openFiche(t);
              }}
              title="Ouvrir la fiche complète"
            >
              📄 Fiche
            </button>
          </div>
        )}
        <button
          className="info-btn"
          onClick={(e) => {
            e.stopPropagation();
            props.onToggleInfo();
          }}
          title={showInfo ? 'Masquer les résumés' : 'Afficher les résumés des deux titres'}
          aria-label={showInfo ? 'Masquer les résumés' : 'Afficher les résumés'}
        >
          {showInfo ? '✕' : 'ℹ'}
        </button>
      </div>
      <TitleText title={t} credits />
    </div>
  );
}
