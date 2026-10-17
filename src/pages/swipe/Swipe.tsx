import { useEffect, useRef, useState } from 'react';
import { clearStatus, db, setStatus, type MediaType, type Status, type Tier, type Title } from '../../lib/db';
import { burst, centerOf, MILESTONES, pick, toast } from '../../lib/fun';
import { recordActivity } from '../../lib/activity';
import { boostFactor, boostFrom, loadBoosts, type Boosts } from '../../lib/recommend';
import { getSwipeMode, readPref, writePref } from '../../lib/settings';
import { isNoTheme, matchesTheme, NO_THEME, ratingMissing, themeLabel, type Theme } from '../../lib/themes';
import { BackLink, Poster, RatingBadge, TitleText } from '../../components/common';
import SwipeCard, { type Dir, type Tone } from '../../components/SwipeCard';
import { openFiche } from '../../components/Fiche';
import { ARROWS, CORNERS, isCorner, PHASES, TONES, type Corner, type Phase } from './config';
import { chainSaga, draw, prefetch, QUEUE_SIZE, removeFromPool, sagaOf, sagaTags, WEIGHT_EXP, type Pool, type SagaInfo, type SagaTag } from './pool';
import { FilterButton, FilterIcon, FilterSheet } from '../../components/FilterSheet';
import { ActionButton, CardTag } from './controls';
import { KNOWN_VOTES, personFilmography } from '../../lib/tmdb';

const FLIP_MS = 350; // durée du retournement de la carte (animation flip-in)

export default function Swipe({ type }: { type: MediaType }) {
  const [mode] = useState(getSwipeMode);
  const themeKey = `swipe-theme:${type}`;
  const pool = useRef<Pool>({ items: [], total: 0 });
  const catalogue = useRef<Title[]>([]);
  // Titres recommandés d'après ceux que tu as aimés : tirés plus souvent.
  const boosts = useRef<Boosts>({});
  const weightOf = (t: Title) => Math.pow(Math.max(t.voteCount, 1), WEIGHT_EXP) * boostFactor(boosts.current[t.key]);
  const answered = useRef(new Set<string>());
  const [loaded, setLoaded] = useState(false);
  const [catalogueVersion, setCatalogueVersion] = useState(0); // relance le chargement après une mise à jour
  const [loadError, setLoadError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => readPref(themeKey, NO_THEME));
  const [showThemes, setShowThemes] = useState(false);
  const [queue, setQueueState] = useState<Title[] | null>(null);
  // Copie de la file, lisible depuis les traitements asynchrones (détection des sagas).
  const queueRef = useRef<Title[] | null>(null);
  const setQueue = (q: Title[]) => {
    queueRef.current = q;
    setQueueState(q);
  };
  const [phase, setPhase] = useState<Phase>('seen');
  const [fling, setFling] = useState<Dir | null>(null);
  const [history, setHistory] = useState<Title[]>([]);
  const [count, setCount] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  // Sagas déjà enchaînées, et étiquette « 🎞️ saga · n/N » de chacun de leurs films.
  const chainedSagas = useRef(new Set<number>());
  const [tags, setTags] = useState<Record<string, SagaTag>>({});
  // Mode 2 directions : la carte de derrière attend la fin du retournement pour la 2e question.
  const [flipping, setFlipping] = useState(false);
  const cardArea = useRef<HTMLDivElement>(null);

  const fill = (q: Title[]) => {
    const next = [...q];
    while (next.length < QUEUE_SIZE) {
      const t = draw(pool.current);
      if (!t) break;
      prefetch(t);
      chainIfSaga(t);
      next.push(t);
    }
    return next;
  };

  /** Met une saga dans la file à la place du titre tiré (à `index`), du 1er film à trier au dernier. */
  const insertSaga = (q: Title[], index: number, saga: SagaInfo, keepFirst: boolean): Title[] | null => {
    chainedSagas.current.add(saga.id);
    setTags((prev) => ({ ...prev, ...sagaTags(saga) }));
    const parts = saga.parts.filter((p) => !answered.current.has(p.key));
    if (parts.length < 2) return null;
    removeFromPool(pool.current, new Set(parts.map((p) => p.key)));
    parts.forEach(prefetch);
    return chainSaga(q, index, parts, keepFirst);
  };

  /**
   * Film de saga tiré : toute la saga le remplace dans la file, pour enchaîner ses films d'un coup
   * (quelle que soit la réponse). Préparé pendant que la carte attend dans la file, donc invisible ;
   * si la carte est déjà affichée, elle reste en premier.
   */
  const chainIfSaga = async (drawn: Title) => {
    const saga = await sagaOf(drawn);
    const q = queueRef.current;
    if (!saga || !q || chainedSagas.current.has(saga.id)) return;
    const index = q.findIndex((t) => t.key === drawn.key);
    if (index === -1) return; // déjà trié ou passé
    const next = insertSaga(q, index, saga, index === 0);
    if (next) setQueue(next);
  };

  /** Ajoute au catalogue du swipe les titres connus de ce type qu'il n'a pas (filmographie d'une personne) ; renvoie les ajouts. */
  const addTitles = (titles: Title[]): Title[] => {
    const known = new Set(catalogue.current.map((t) => t.key));
    const added = titles.filter((t) => t.type === type && t.voteCount >= KNOWN_VOTES && !known.has(t.key));
    catalogue.current.push(...added);
    // Enregistrés : ils restent là au prochain chargement, même sans réseau.
    if (added.length) db.titles.bulkPut(added).catch(() => undefined);
    return added;
  };

  // Charge le catalogue de ce type (à nouveau après une mise à jour du catalogue). Sans réseau.
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setLoadError(null);
    Promise.all([db.titles.where('type').equals(type).toArray(), db.answers.where('type').equals(type).primaryKeys(), loadBoosts(type)])
      .then(([titles, keys, saved]) => {
        if (cancelled) return;
        catalogue.current = titles;
        answered.current = new Set(keys);
        boosts.current = saved;
        setLoaded(true);
      })
      .catch((e) => !cancelled && setLoadError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [type, catalogueVersion]);

  // Filtre sur une personne retenu d'une visite à l'autre : sa filmographie peut compter des titres hors
  // catalogue. Récupérée en arrière-plan ; ses titres rejoignent le tirage à leur arrivée.
  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    const people = [
      [theme.director, 'director'],
      [theme.actor, 'actor'],
    ] as const;
    for (const [person, role] of people) {
      if (!person) continue;
      personFilmography(person.id, role)
        .then((titles) => {
          if (!alive) return;
          const added = addTitles(titles).filter((t) => !answered.current.has(t.key) && matchesTheme(t, theme));
          if (!added.length) return;
          pool.current.items.push(...added.map((title) => ({ title, w: weightOf(title) })));
          pool.current.total = pool.current.items.reduce((s, i) => s + i.w, 0);
          if (queueRef.current && !queueRef.current.length) setQueue(fill([]));
        })
        .catch(() => undefined); // hors ligne : les titres déjà au catalogue suffisent
    }
    return () => {
      alive = false;
    };
  }, [loaded, theme]);

  // (Re)construit le tirage quand le thème change.
  useEffect(() => {
    if (!loaded) return;
    const items = catalogue.current
      .filter((t) => !answered.current.has(t.key) && matchesTheme(t, theme))
      .map((title) => ({ title, w: weightOf(title) }));
    pool.current = { items, total: items.reduce((s, i) => s + i.w, 0) };
    setPhase('seen');
    setShowInfo(false);
    // Avant d'afficher la 1re carte, on regarde si c'est un film de saga, pour commencer par le 1er film.
    let alive = true;
    const first = fill([]);
    const head = first[0];
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500));
    (head ? Promise.race([sagaOf(head).catch(() => null), timeout]) : Promise.resolve(null)).then((saga) => {
      if (!alive) return;
      const chained = saga && !chainedSagas.current.has(saga.id) ? insertSaga(first, 0, saga, false) : null;
      setQueue(chained ?? first);
      if (head && !saga) chainIfSaga(head); // fiche pas encore arrivée : on réessaiera quand elle sera là
    });
    return () => {
      alive = false;
    };
  }, [loaded, theme]);

  const current = queue?.[0];
  const busy = fling !== null;
  // Carte de derrière : aucune au 1er swipe du mode 2 directions (la carte va revenir pour la 2e question).
  const behind = !queue || flipping || (mode === 'horizontal' && phase === 'seen') ? undefined : queue[1];

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
    if (tier === 'good') boostRecommendations(current);
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

    // La file à jour : une saga a pu s'y enchaîner pendant que la carte était affichée.
    advance((queueRef.current ?? queue).slice(1));
  };

  /** Titre aimé : ses recommandations TMDB sont tirées plus souvent (en arrière-plan). */
  const boostRecommendations = async (liked: Title) => {
    const titles = await boostFrom(liked);
    if (!titles.length) return;
    boosts.current = await loadBoosts(type);
    const inPool = new Map(pool.current.items.map((i) => [i.title.key, i]));
    const known = new Set(catalogue.current.map((t) => t.key));
    for (const t of titles) {
      if (answered.current.has(t.key)) continue;
      if (!known.has(t.key)) catalogue.current.push(t);
      const item = inPool.get(t.key);
      if (item) item.w = weightOf(item.title);
      else if (!known.has(t.key) && matchesTheme(t, theme)) pool.current.items.push({ title: t, w: weightOf(t) });
    }
    pool.current.total = pool.current.items.reduce((s, i) => s + i.w, 0);
  };

  const skip = () => {
    if (!busy && queue?.length) advance((queueRef.current ?? queue).slice(1));
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
        <BackLink />
        <h2 className={`swipe-title ${mode === 'horizontal' && current ? `question ${phase}` : ''}`}>
          {mode === 'horizontal' && current ? p.question : typeTitle}
        </h2>
        <FilterButton
          active={!isNoTheme(theme)}
          label={`${themeLabel(type, theme)} · ${remaining.toLocaleString('fr-FR')} titres restants`}
          onClick={() => setShowThemes(true)}
        />
        <span className="pill" title="Titres triés pendant cette session">
          🔥 {count}
        </span>
      </header>
      {!isNoTheme(theme) && (
        <button className="theme-strip" onClick={() => setShowThemes(true)} title="Changer les filtres">
          <FilterIcon /> {themeLabel(type, theme)} · {remaining.toLocaleString('fr-FR')} restants
        </button>
      )}

      {loadError ? (
        <div className="empty">
          <span className="big-emoji">⚠️</span>
          <p>Impossible de charger le catalogue : {loadError}</p>
          <button className="btn primary" onClick={() => setCatalogueVersion((v) => v + 1)}>
            Réessayer
          </button>
        </div>
      ) : queue === null ? (
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
              <span className="big-emoji">🔍</span>
              <p>Plus rien à trier avec ces filtres !</p>
              <button className="btn primary" onClick={() => setShowThemes(true)}>
                Changer les filtres
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
                <CardTag saga={tags[behind.key]} boost={boosts.current[behind.key]} />
                <RatingBadge title={behind} />
                <TitleText title={behind} credits />
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
              className={phase !== 'seen' ? 'flip-in' : ''}
              onTap={() => setShowInfo((s) => !s)}
            >
              <Poster title={current} size="w500" className="card-poster" />
              <CardTag saga={tags[current.key]} boost={boosts.current[current.key]} />
              <RatingBadge title={current} />
              {showInfo && (
                <div className="card-overview" onPointerDown={(e) => e.stopPropagation()}>
                  <button className="overview-close" onClick={() => setShowInfo(false)} aria-label="Fermer le résumé" title="Fermer le résumé">
                    ✕
                  </button>
                  <div className="overview-text">
                    <p>{current.overview || 'Pas de résumé disponible.'}</p>
                  </div>
                  <button className="btn small overview-fiche" onClick={() => openFiche(current)} title="Durée, note, bande-annonce, où regarder…">
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
        <FilterSheet
          type={type}
          initial={theme}
          count={(t) => catalogue.current.filter((x) => !answered.current.has(x.key) && matchesTheme(x, t)).length}
          applyLabel={(n) => `C’est parti (${n.toLocaleString('fr-FR')})`}
          hasCatalogueData={catalogue.current.some((t) => t.rating !== undefined)}
          missingRatings={catalogue.current.filter((t) => !answered.current.has(t.key) && ratingMissing(t)).length}
          onCatalogueUpdated={() => setCatalogueVersion((v) => v + 1)}
          onPersonTitles={addTitles}
          onApply={applyTheme}
          onClose={() => setShowThemes(false)}
        />
      )}
    </main>
  );
}
