import { useEffect, useRef, useState } from 'react';
import { clearStatus, db, setStatus, type MediaType, type Title } from '../db';
import { ensureCredits, posterUrl } from '../tmdb';
import { Poster, TitleText, TopBar } from '../components/common';
import SwipeCard, { type Dir } from '../components/SwipeCard';
import { burst, centerOf, MILESTONES, pick, toast } from '../fun';
import { recordActivity } from '../activity';

/**
 * Tirage aléatoire pondéré par le nombre de votes TMDB : les titres connus sortent
 * plus souvent, donc on tombe vite sur des films qu'on a vus. 1 = proportionnel.
 */
const WEIGHT_EXP = 0.9;
const QUEUE_SIZE = 4;

interface Pool {
  items: { title: Title; w: number }[];
  total: number;
}

function draw(pool: Pool): Title | null {
  if (!pool.items.length) return null;
  let r = Math.random() * pool.total;
  let i = 0;
  while (i < pool.items.length - 1 && r >= pool.items[i].w) r -= pool.items[i++].w;
  const [picked] = pool.items.splice(i, 1);
  pool.total -= picked.w;
  return picked.title;
}

function preload(title: Title) {
  const src = posterUrl(title.posterPath, 'w500');
  if (src) new Image().src = src;
}

type Phase = 'seen' | 'wish';

interface PhaseText {
  question: string;
  left: string;
  right: string;
  leftBtn: string;
  rightBtn: string;
  leftCap: string;
  rightCap: string;
  leftTip: string;
  rightTip: string;
}

const PHASES: Record<Phase, PhaseText> = {
  seen: {
    question: 'Tu l’as vu ?',
    left: 'PAS VU 🙈',
    right: 'VU ✅',
    leftBtn: '✕',
    rightBtn: '✓',
    leftCap: 'Pas vu',
    rightCap: 'Vu',
    leftTip: 'Je ne l’ai pas vu (swipe à gauche ou flèche ←)',
    rightTip: 'Je l’ai vu (swipe à droite ou flèche →)',
  },
  wish: {
    question: 'Pas vu… envie de le voir ?',
    left: 'BOF 💤',
    right: 'ENVIE 💖',
    leftBtn: '✕',
    rightBtn: '♥',
    leftCap: 'Non',
    rightCap: 'Wishlist',
    leftTip: 'Pas envie : il ne sera plus proposé (swipe à gauche ou flèche ←)',
    rightTip: 'Ajouter à la wishlist (swipe à droite ou flèche →)',
  },
};

export default function Swipe({ type }: { type: MediaType }) {
  const pool = useRef<Pool>({ items: [], total: 0 });
  const [queue, setQueue] = useState<Title[] | null>(null);
  const [phase, setPhase] = useState<Phase>('seen');
  const [fling, setFling] = useState<Dir | null>(null);
  const [history, setHistory] = useState<Title[]>([]);
  const [count, setCount] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [catalogueSize, setCatalogueSize] = useState(0);
  const cardArea = useRef<HTMLDivElement>(null);

  const fill = (q: Title[]) => {
    const next = [...q];
    while (next.length < QUEUE_SIZE) {
      const t = draw(pool.current);
      if (!t) break;
      preload(t);
      ensureCredits(t);
      next.push(t);
    }
    return next;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [titles, answered] = await Promise.all([
        db.titles.where('type').equals(type).toArray(),
        db.answers.where('type').equals(type).primaryKeys(),
      ]);
      if (cancelled) return;
      const done = new Set(answered);
      const items = titles.filter((t) => !done.has(t.key)).map((title) => ({ title, w: Math.pow(Math.max(title.voteCount, 1), WEIGHT_EXP) }));
      pool.current = { items, total: items.reduce((s, i) => s + i.w, 0) };
      setCatalogueSize(titles.length);
      setQueue(fill([]));
    })();
    return () => {
      cancelled = true;
    };
  }, [type]);

  const current = queue?.[0];
  const busy = fling !== null;

  const advance = (q: Title[]) => {
    setPhase('seen');
    setShowInfo(false);
    setQueue(fill(q.slice(1)));
  };

  const onSwipe = async (dir: Dir) => {
    setFling(null);
    if (!current || !queue) return;
    if (phase === 'seen' && dir === 'left') {
      setPhase('wish');
      return;
    }
    const status = phase === 'seen' ? 'seen' : dir === 'right' ? 'wish' : 'unseen';
    await setStatus(current, status);
    recordActivity();
    const origin = centerOf(cardArea.current);
    if (status === 'seen') burst(['✅', '🍿', '⭐'], origin, 10);
    else if (status === 'wish') burst(['💖', '💕', '✨'], origin, 14);
    const n = count + 1;
    if (n % 25 === 0) {
      toast(`${pick(MILESTONES)} ${n} titres triés`);
      burst(['🎉', '🎊', '✨', '🥳'], undefined, 28);
    }
    setHistory((h) => [...h.slice(-49), current]);
    setCount(n);
    advance(queue);
  };

  const skip = () => {
    if (!busy && queue?.length) advance(queue);
  };

  const undo = async () => {
    if (busy || !queue) return;
    if (phase === 'wish') {
      setPhase('seen');
      return;
    }
    const last = history.at(-1);
    if (!last) return;
    await clearStatus(last.key);
    recordActivity(-1);
    setHistory((h) => h.slice(0, -1));
    setCount((c) => Math.max(0, c - 1));
    setShowInfo(false);
    setQueue([last, ...queue]);
  };

  const press = (dir: Dir) => {
    if (!busy && current) setFling(dir);
  };

  // Fond différent pendant la question « wishlist ? ».
  useEffect(() => {
    document.body.classList.toggle('wish-phase', phase === 'wish');
    return () => document.body.classList.remove('wish-phase');
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') press('right');
      else if (e.key === 'ArrowLeft') press('left');
      else if (e.key === 'ArrowDown') skip();
      else if (e.key === 'Backspace') undo();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const remaining = pool.current.items.length + (queue?.length ?? 0);
  const p = PHASES[phase];

  return (
    <main className="page swipe-page">
      <TopBar
        title={type === 'movie' ? '🎬 Films' : '📺 Séries'}
        right={
          <span className="pill" title="Titres triés pendant cette session">
            🔥 {count}
          </span>
        }
      />

      {queue === null ? (
        <p className="muted center">Chargement…</p>
      ) : !current ? (
        <div className="empty">
          {catalogueSize === 0 ? (
            <>
              <span className="big-emoji">📦</span>
              <p>Le catalogue est vide.</p>
              <a className="btn primary" href="#/settings">
                Télécharger le catalogue
              </a>
            </>
          ) : (
            <>
              <span className="big-emoji">🏁</span>
              <p>Tout est trié ! Mets à jour le catalogue de temps en temps pour récupérer les nouveautés.</p>
            </>
          )}
        </div>
      ) : (
        <>
          <p className={`question ${phase}`}>{p.question}</p>
          <div className="card-area" ref={cardArea}>
            {queue[1] && (
              <div className="swipe-card card-behind" aria-hidden>
                <Poster title={queue[1]} size="w500" className="card-poster" />
              </div>
            )}
            <SwipeCard key={`${current.key}-${phase}`} labels={{ left: p.left, right: p.right }} fling={fling} onSwipe={onSwipe} onTap={() => setShowInfo((s) => !s)}>
              <Poster title={current} size="w500" className="card-poster" />
              {showInfo && <div className="card-overview">{current.overview || 'Pas de résumé disponible.'}</div>}
              <TitleText title={current} credits />
            </SwipeCard>
          </div>
          <div className="swipe-actions">
            <ActionButton className="no" icon={p.leftBtn} caption={p.leftCap} tip={p.leftTip} onClick={() => press('left')} />
            <ActionButton
              className="small"
              icon="↶"
              caption="Annuler"
              tip="Revenir au titre précédent (touche Retour arrière)"
              onClick={undo}
              disabled={phase === 'seen' && !history.length}
            />
            <ActionButton className="small" icon="⤼" caption="Passer" tip="Je ne sais pas : le titre reviendra plus tard (flèche ↓)" onClick={skip} />
            <ActionButton className={`yes ${phase}`} icon={p.rightBtn} caption={p.rightCap} tip={p.rightTip} onClick={() => press('right')} />
          </div>
          <p className="muted small center">
            Touche l’affiche pour le résumé · {remaining.toLocaleString('fr-FR')} restants
          </p>
        </>
      )}
    </main>
  );
}

function ActionButton(props: { className: string; icon: string; caption: string; tip: string; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="action">
      <button className={`round-btn ${props.className}`} onClick={props.onClick} disabled={props.disabled} title={props.tip} aria-label={props.caption}>
        {props.icon}
      </button>
      <span className="action-caption">{props.caption}</span>
    </div>
  );
}
