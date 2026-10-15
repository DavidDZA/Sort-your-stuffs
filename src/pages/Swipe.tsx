import { useEffect, useRef, useState } from 'react';
import { clearStatus, db, setStatus, type MediaType, type Status, type Tier, type Title } from '../db';
import { ensureDetails, fetchSaga, posterUrl } from '../tmdb';
import { Poster, Sheet, TitleText } from '../components/common';
import SwipeCard, { type Dir, type Tone } from '../components/SwipeCard';
import { openFiche } from '../components/Fiche';
import { burst, centerOf, MILESTONES, pick, toast } from '../fun';
import { recordActivity } from '../activity';
import { getSwipeMode, readPref, writePref } from '../settings';
import { genreOptions, isNoTheme, LANGS, matchesTheme, NO_THEME, PERIODS, themeLabel, type Theme } from '../themes';

/**
 * Tirage aléatoire pondéré par le nombre de votes TMDB : les titres connus sortent
 * plus souvent, donc on tombe vite sur des films qu'on a vus. 1 = proportionnel.
 */
const WEIGHT_EXP = 0.9;
const QUEUE_SIZE = 4;
const FLIP_MS = 350; // durée du retournement de la carte (animation flip-in)

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

/** Précharge l'affiche, la fiche détaillée et, pour un film de saga, la liste de ses suites. */
function prefetch(title: Title) {
  const src = posterUrl(title.posterPath, 'w500');
  if (src) {
    // Téléchargée ET décodée à l'avance : pas d'accroc quand la carte arrive à l'écran.
    const img = new Image();
    img.src = src;
    img.decode?.().catch(() => undefined);
  }
  ensureDetails(title).then((d) => {
    if (d?.collection) fetchSaga(d.collection.id);
  });
}

/** Films de la même saga pas encore triés, dans l'ordre de sortie. */
async function sagaFollowUps(title: Title): Promise<{ name: string; parts: Title[] } | null> {
  if (title.type !== 'movie') return null;
  const d = await ensureDetails(title);
  if (!d?.collection) return null;
  const saga = await fetchSaga(d.collection.id);
  if (!saga) return null;
  const others = saga.parts.filter((p) => p.key !== title.key);
  const [answers, stored] = await Promise.all([db.answers.bulkGet(others.map((p) => p.key)), db.titles.bulkGet(others.map((p) => p.key))]);
  const parts = others.map((p, i) => stored[i] ?? p).filter((_, i) => !answers[i]);
  return parts.length ? { name: saga.name, parts } : null;
}

/** Mode 2 directions : vu / pas vu, puis « aimé ou bof ? » (vu) ou « envie ? » (pas vu). */
type Phase = 'seen' | 'wish' | 'rate';

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
    left: 'PAS ENVIE 💤',
    right: 'ENVIE 💖',
    leftBtn: '✕',
    rightBtn: '♥',
    leftCap: 'Pas envie',
    rightCap: 'Wishlist',
    leftTip: 'Pas envie : il ne sera plus proposé (swipe à gauche ou flèche ←)',
    rightTip: 'Ajouter à la wishlist (swipe à droite ou flèche →)',
  },
  rate: {
    question: 'Vu ! Tu as aimé ?',
    left: 'BOF 😐',
    right: 'AIMÉ 👍',
    leftBtn: '😐',
    rightBtn: '👍',
    leftCap: 'Bof',
    rightCap: 'Aimé',
    leftTip: 'Vu, mais bof : classé avec les « bof » (swipe à gauche ou flèche ←)',
    rightTip: 'Vu et aimé : classé avec les « bien » (swipe à droite ou flèche →)',
  },
};

const TONES: Record<Phase, { left: Tone; right: Tone }> = {
  seen: { left: 'no', right: 'yes' },
  wish: { left: 'no', right: 'wish' },
  rate: { left: 'meh', right: 'yes' },
};

type Corner = 'ul' | 'ur' | 'dl' | 'dr';

/** Mode 4 coins : haut = positif. Les boutons reprennent la même disposition. */
const CORNERS: Record<Corner, { status: Status; tier?: Tier; text: string; tone: Tone; icon: string; caption: string; tip: string; key: string }> = {
  ul: { status: 'wish', text: 'ENVIE 💖', tone: 'wish', icon: '💖', caption: 'Envie', tip: 'Pas vu, envie de le voir : wishlist (↖ ou touche 7)', key: '7' },
  ur: { status: 'seen', tier: 'good', text: 'VU 👍', tone: 'yes', icon: '👍', caption: 'Vu · bien', tip: 'Vu, et j’ai aimé (↗ ou touche 9)', key: '9' },
  dl: { status: 'unseen', text: 'PAS ENVIE 💤', tone: 'no', icon: '💤', caption: 'Pas envie', tip: 'Pas vu, pas envie : il ne sera plus proposé (↙ ou touche 1)', key: '1' },
  dr: { status: 'seen', tier: 'meh', text: 'VU 😐', tone: 'meh', icon: '😐', caption: 'Vu · bof', tip: 'Vu, mais bof (↘ ou touche 3)', key: '3' },
};

const isCorner = (d: Dir): d is Corner => d in CORNERS;

export default function Swipe({ type }: { type: MediaType }) {
  const [mode] = useState(getSwipeMode);
  const themeKey = `swipe-theme:${type}`;
  const pool = useRef<Pool>({ items: [], total: 0 });
  const catalogue = useRef<Title[]>([]);
  const answered = useRef(new Set<string>());
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => readPref(themeKey, NO_THEME));
  const [showThemes, setShowThemes] = useState(false);
  const [queue, setQueue] = useState<Title[] | null>(null);
  const [phase, setPhase] = useState<Phase>('seen');
  const [fling, setFling] = useState<Dir | null>(null);
  const [history, setHistory] = useState<Title[]>([]);
  const [count, setCount] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  // Suites de saga du titre affiché, calculées à l'avance pour mettre le bon titre derrière.
  const [saga, setSaga] = useState<{ forKey: string; name: string; parts: Title[] } | null>(null);
  // Pivot : l'ancien titre de derrière tourne pour laisser place au film de la saga.
  const [flip, setFlip] = useState<{ out: Title; inKey: string } | null>(null);
  // Mode 2 directions : la carte de derrière attend la fin du retournement pour la 2e question.
  const [flipping, setFlipping] = useState(false);
  const cardArea = useRef<HTMLDivElement>(null);

  const fill = (q: Title[]) => {
    const next = [...q];
    while (next.length < QUEUE_SIZE) {
      const t = draw(pool.current);
      if (!t) break;
      prefetch(t);
      next.push(t);
    }
    return next;
  };

  // Charge le catalogue de ce type une seule fois.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [titles, keys] = await Promise.all([db.titles.where('type').equals(type).toArray(), db.answers.where('type').equals(type).primaryKeys()]);
      if (cancelled) return;
      catalogue.current = titles;
      answered.current = new Set(keys);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [type]);

  // (Re)construit le tirage quand le thème change.
  useEffect(() => {
    if (!loaded) return;
    const items = catalogue.current
      .filter((t) => !answered.current.has(t.key) && matchesTheme(t, theme))
      .map((title) => ({ title, w: Math.pow(Math.max(title.voteCount, 1), WEIGHT_EXP) }));
    pool.current = { items, total: items.reduce((s, i) => s + i.w, 0) };
    setPhase('seen');
    setShowInfo(false);
    setQueue(fill([]));
  }, [loaded, theme]);

  const current = queue?.[0];
  const busy = fling !== null;
  const sagaNext = saga && current && saga.forKey === current.key ? saga.parts[0] : undefined;
  // Carte de derrière : aucune au 1er swipe du mode 2 directions (la carte va revenir pour la 2e question) ;
  // le film de la saga quand on sait déjà que le titre est vu.
  const behind =
    !queue || flip || flipping || (mode === 'horizontal' && phase === 'seen') ? undefined : phase === 'rate' && sagaNext ? sagaNext : queue[1];

  useEffect(() => {
    setSaga(null);
    if (!current || current.type !== 'movie') return;
    let alive = true;
    sagaFollowUps(current).then((s) => alive && s && setSaga({ forKey: current.key, ...s }));
    return () => {
      alive = false;
    };
  }, [current?.key]);

  const advance = (rest: Title[]) => {
    setPhase('seen');
    setShowInfo(false);
    setQueue(fill(rest));
  };

  const onSwipe = async (dir: Dir) => {
    setFling(null);
    if (!current || !queue) return;
    if (phase === 'seen' && (dir === 'left' || dir === 'right')) {
      // Masque la carte de derrière dans le même rendu que le changement de question.
      setFlipping(true);
      setTimeout(() => setFlipping(false), FLIP_MS);
      setPhase(dir === 'left' ? 'wish' : 'rate');
      return;
    }
    let status: Status;
    let tier: Tier | undefined;
    if (isCorner(dir)) ({ status, tier } = CORNERS[dir]);
    else if (phase === 'rate') {
      status = 'seen';
      tier = dir === 'right' ? 'good' : 'meh';
    } else status = dir === 'right' ? 'wish' : 'unseen';
    await setStatus(current, status, tier);
    answered.current.add(current.key);
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

    let rest = queue.slice(1);
    const shownBehind = behind;
    // Vu un film de saga ? Les suites pas encore triées passent en tête de file.
    const follow = status === 'seen' ? (saga?.forKey === current.key ? saga : await sagaFollowUps(current)) : null;
    if (follow) {
      const keys = new Set(follow.parts.map((p) => p.key));
      const added = follow.parts.filter((p) => !rest.slice(0, follow.parts.length).some((t) => t.key === p.key)).length;
      rest = [...follow.parts, ...rest.filter((t) => !keys.has(t.key))];
      pool.current.items = pool.current.items.filter((i) => !keys.has(i.title.key));
      pool.current.total = pool.current.items.reduce((s, i) => s + i.w, 0);
      follow.parts.forEach(prefetch);
      if (added) toast(`🎞️ ${follow.name} : ${follow.parts.length} film${follow.parts.length > 1 ? 's' : ''} à suivre`);
    }
    // Le titre visible derrière n'est plus le suivant : il pivote pour devenir le bon.
    if (shownBehind && rest[0] && shownBehind.key !== rest[0].key) {
      setFlip({ out: shownBehind, inKey: rest[0].key });
      setTimeout(() => setFlip(null), 420);
    }
    advance(rest);
  };

  const skip = () => {
    if (!busy && queue?.length) advance(queue.slice(1));
  };

  const undo = async () => {
    if (busy || !queue) return;
    if (phase !== 'seen') {
      setPhase('seen');
      return;
    }
    const last = history.at(-1);
    if (!last) return;
    await clearStatus(last.key);
    answered.current.delete(last.key);
    recordActivity(-1);
    setHistory((h) => h.slice(0, -1));
    setCount((c) => Math.max(0, c - 1));
    setShowInfo(false);
    setQueue([last, ...queue]);
  };

  const press = (dir: Dir) => {
    if (!busy && current) setFling(dir);
  };

  const applyTheme = (t: Theme) => {
    writePref(themeKey, t);
    setTheme(t);
    setShowThemes(false);
  };

  // Fond différent pendant la question « wishlist ? ».
  useEffect(() => {
    document.body.classList.toggle('wish-phase', phase === 'wish');
    document.body.classList.toggle('rate-phase', phase === 'rate');
    return () => document.body.classList.remove('wish-phase', 'rate-phase');
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showThemes) return;
      const corner = (Object.keys(CORNERS) as Corner[]).find((c) => CORNERS[c].key === e.key);
      if (mode === 'corners' && corner) press(corner);
      else if (mode === 'horizontal' && e.key === 'ArrowRight') press('right');
      else if (mode === 'horizontal' && e.key === 'ArrowLeft') press('left');
      else if (e.key === 'ArrowDown') skip();
      else if (e.key === 'Backspace') undo();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const remaining = pool.current.items.length + (queue?.length ?? 0);
  const p = PHASES[phase];
  const labels: Partial<Record<Dir, { text: string; tone: Tone }>> =
    mode === 'corners'
      ? Object.fromEntries((Object.keys(CORNERS) as Corner[]).map((c) => [c, { text: CORNERS[c].text, tone: CORNERS[c].tone }]))
      : { left: { text: p.left, tone: TONES[phase].left }, right: { text: p.right, tone: TONES[phase].right } };
  const undoButton = (
    <ActionButton
      className="small"
      icon="↶"
      caption="Annuler"
      tip="Revenir au titre précédent (touche Retour arrière)"
      onClick={undo}
      disabled={phase === 'seen' && !history.length}
    />
  );
  const skipButton = <ActionButton className="small" icon="⤼" caption="Passer" tip="Je ne sais pas : le titre reviendra plus tard (flèche ↓)" onClick={skip} />;
  const ARROWS: Record<Corner, string> = { ul: '↖', ur: '↗', dl: '↙', dr: '↘' };
  const cornerButton = (c: Corner) => (
    <ActionButton
      className={`corner tone-${CORNERS[c].tone}`}
      icon={CORNERS[c].icon}
      badge={ARROWS[c]}
      caption={CORNERS[c].caption}
      tip={CORNERS[c].tip}
      onClick={() => press(c)}
    />
  );
  const typeTitle = type === 'movie' ? '🎬 Films' : '📺 Séries';

  return (
    <main className={`page swipe-page ${mode}`}>
      <header className="swipe-top">
        <a className="icon-btn" href="#/" aria-label="Retour" title="Retour à l’accueil">
          ‹
        </a>
        <h2 className={`swipe-title ${mode === 'horizontal' && current ? `question ${phase}` : ''}`}>
          {mode === 'horizontal' && current ? p.question : typeTitle}
        </h2>
        <button
          className={`icon-btn theme-icon ${isNoTheme(theme) ? '' : 'active'}`}
          onClick={() => setShowThemes(true)}
          aria-label="Thème de la session"
          title={`Thème : ${themeLabel(type, theme)} · ${remaining.toLocaleString('fr-FR')} titres restants`}
        >
          🎯
        </button>
        <span className="pill" title="Titres triés pendant cette session">
          🔥 {count}
        </span>
      </header>
      {!isNoTheme(theme) && (
        <button className="theme-strip" onClick={() => setShowThemes(true)} title="Changer de thème">
          🎯 {themeLabel(type, theme)} · {remaining.toLocaleString('fr-FR')} restants
        </button>
      )}

      {queue === null ? (
        <p className="muted center">Chargement…</p>
      ) : !current ? (
        <div className="empty">
          {catalogue.current.length === 0 ? (
            <>
              <span className="big-emoji">📦</span>
              <p>Le catalogue est vide.</p>
              <a className="btn primary" href="#/settings">
                Télécharger le catalogue
              </a>
            </>
          ) : !isNoTheme(theme) ? (
            <>
              <span className="big-emoji">🎯</span>
              <p>Plus rien à trier dans ce thème !</p>
              <button className="btn primary" onClick={() => setShowThemes(true)}>
                Changer de thème
              </button>
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
          <div className="card-area" ref={cardArea}>
            {behind && (
              <div key={behind.key} className="swipe-card card-behind" aria-hidden>
                <Poster title={behind} size="w500" className="card-poster" />
                <TitleText title={behind} credits />
              </div>
            )}
            {flip && (
              <div key={`out-${flip.out.key}`} className="swipe-card card-behind flip-out" aria-hidden>
                <Poster title={flip.out} size="w500" className="card-poster" />
                <TitleText title={flip.out} credits />
              </div>
            )}
            <SwipeCard
              key={`${current.key}-${phase}`}
              mode={mode}
              labels={labels}
              fling={fling}
              onSwipe={onSwipe}
              onAmbiguous={() => toast('↖ ↗ ↙ ↘ Swipe en diagonale, vers un coin')}
              stay={mode === 'horizontal' && phase === 'seen' ? ['left', 'right'] : []}
              className={phase !== 'seen' ? 'flip-in' : flip?.inKey === current.key ? 'flip-in-late' : ''}
              onTap={() => setShowInfo((s) => !s)}
            >
              <Poster title={current} size="w500" className="card-poster" />
              {showInfo && (
                <div className="card-overview" onPointerDown={(e) => e.stopPropagation()}>
                  <button className="overview-close" onClick={() => setShowInfo(false)} aria-label="Fermer le résumé" title="Fermer le résumé">
                    ✕
                  </button>
                  <p>{current.overview || 'Pas de résumé disponible.'}</p>
                  <button className="btn small" onClick={() => openFiche(current)} title="Durée, note, bande-annonce, où regarder…">
                    📄 Fiche complète
                  </button>
                </div>
              )}
              <TitleText title={current} credits />
            </SwipeCard>
          </div>
          {mode === 'corners' ? (
            <div className="swipe-actions corners">
              {cornerButton('dl')}
              {cornerButton('ul')}
              {undoButton}
              {skipButton}
              {cornerButton('ur')}
              {cornerButton('dr')}
            </div>
          ) : (
            <div className="swipe-actions">
              <ActionButton className={phase === 'rate' ? 'meh' : 'no'} icon={p.leftBtn} caption={p.leftCap} tip={p.leftTip} onClick={() => press('left')} />
              {undoButton}
              {skipButton}
              <ActionButton className={`yes ${phase}`} icon={p.rightBtn} caption={p.rightCap} tip={p.rightTip} onClick={() => press('right')} />
            </div>
          )}
        </>
      )}

      {showThemes && (
        <ThemeSheet
          type={type}
          initial={theme}
          count={(t) => catalogue.current.filter((x) => !answered.current.has(x.key) && matchesTheme(x, t)).length}
          hasGenres={catalogue.current.some((t) => t.genreIds?.length)}
          onApply={applyTheme}
          onClose={() => setShowThemes(false)}
        />
      )}
    </main>
  );
}

function ThemeSheet(props: {
  type: MediaType;
  initial: Theme;
  count: (t: Theme) => number;
  hasGenres: boolean;
  onApply: (t: Theme) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(props.initial);
  const n = props.count(draft);
  return (
    <Sheet onClose={props.onClose} label="Thème de la session">
      <h2 className="sheet-title">🎯 Thème de la session</h2>
      {!props.hasGenres && <p className="banner-soft small">Mets à jour le catalogue (Réglages) pour activer les filtres par genre et par langue.</p>}

      <h3 className="sheet-label">Période</h3>
      <div className="chips">
        {PERIODS.map((p) => (
          <button key={p.id} className={`chip ${draft.period === p.id ? 'active' : ''}`} onClick={() => setDraft({ ...draft, period: p.id })}>
            {p.label}
          </button>
        ))}
      </div>

      <h3 className="sheet-label">Genre</h3>
      <div className="chips">
        <button className={`chip ${draft.genre === null ? 'active' : ''}`} onClick={() => setDraft({ ...draft, genre: null })}>
          Tous
        </button>
        {genreOptions(props.type).map((g) => (
          <button key={g.id} className={`chip ${draft.genre === g.id ? 'active' : ''}`} onClick={() => setDraft({ ...draft, genre: g.id })}>
            {g.label}
          </button>
        ))}
      </div>

      <h3 className="sheet-label">Langue originale</h3>
      <div className="chips">
        {LANGS.map((l) => (
          <button key={l.id} className={`chip ${draft.lang === l.id ? 'active' : ''}`} onClick={() => setDraft({ ...draft, lang: l.id })}>
            {l.label}
          </button>
        ))}
      </div>

      <div className="row center sheet-actions">
        <button className="btn" onClick={() => setDraft(NO_THEME)} title="Revenir à tout le catalogue">
          Réinitialiser
        </button>
        <button className="btn primary" onClick={() => props.onApply(draft)} disabled={n === 0} title="Lancer la session avec ce thème">
          C’est parti ({n.toLocaleString('fr-FR')})
        </button>
      </div>
    </Sheet>
  );
}

function ActionButton(props: {
  className: string;
  icon: string;
  badge?: string;
  caption: string;
  tip: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="action">
      <button className={`round-btn ${props.className}`} onClick={props.onClick} disabled={props.disabled} title={props.tip} aria-label={props.caption}>
        {props.icon}
        {props.badge && <span className="btn-badge">{props.badge}</span>}
      </button>
      <span className="action-caption">{props.caption}</span>
    </div>
  );
}
