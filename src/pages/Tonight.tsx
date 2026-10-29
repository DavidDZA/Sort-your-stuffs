import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, withDetails, type Title } from '../lib/db';
import { categoryOf, useCategories } from '../lib/category';
import { readRanking } from '../lib/ranking';
import { prefetchDetails, WEEK } from '../lib/tmdb';
import { readPref, writePref } from '../lib/settings';
import { hasMyProviders, loadMyProviders } from '../lib/providers';
import { matchesTonight, NO_FILTERS, pickWeighted, priorityWeight, type TonightFilters } from '../lib/tonight';
import { burst, toast } from '../lib/fun';
import { Poster, ProviderLine, RatingBadge, SeenButtons, TitleText, TopBar, TypeFilter } from '../components/common';
import { openFiche } from '../components/Fiche';

const PREF = 'tonight-filters';

/** « Ce soir, je regarde quoi ? » : tirage dans la wishlist, en favorisant les priorités. */
export default function Tonight() {
  const [filters, setFilters] = useState<TonightFilters>(() => readPref(PREF, NO_FILTERS));
  const [picked, setPicked] = useState<Title | null>(null);
  const [rolling, setRolling] = useState<Title | null>(null);
  const shown = useRef(new Set<string>());
  const mine = loadMyProviders();
  const categories = useCategories();

  const data = useLiveQuery(async () => {
    const keys = await db.answers.where('status').equals('wish').primaryKeys();
    const titles = await withDetails((await db.titles.bulkGet(keys)).filter((t): t is Title => !!t));
    const [movie, tv, anime] = await Promise.all(
      (['movie', 'tv', 'anime'] as const).map((category) => readRanking({ category, list: 'wish' })),
    );
    return { titles, ranks: { movie, tv, anime } };
  });

  // Plateformes et durées à jour pour filtrer.
  useEffect(() => {
    if (data) prefetchDetails(data.titles, WEEK);
  }, [data?.titles.length]);

  const update = (f: TonightFilters) => {
    setFilters(f);
    writePref(PREF, f);
    shown.current.clear();
  };

  if (!data) return <Shell>{<p className="muted center">Chargement…</p>}</Shell>;
  if (!data.titles.length) {
    return (
      <Shell>
        <div className="empty">
          <span className="big-emoji">💖</span>
          <p>Ta wishlist est vide : swipe « envie » sur quelques titres d’abord !</p>
        </div>
      </Shell>
    );
  }

  const candidates = data.titles.filter((t) => matchesTonight(t, filters, mine));
  const genres = [...new Set(data.titles.flatMap((t) => t.details?.genres ?? []))].sort((a, b) => a.localeCompare(b, 'fr'));

  const roll = () => {
    let pool = candidates.filter((t) => !shown.current.has(t.key));
    if (!pool.length) {
      shown.current.clear(); // tout a été proposé : on recommence
      pool = candidates;
    }
    const weighted = pool.map((t) => {
      const rank = data.ranks[categoryOf(t)];
      const i = rank.indexOf(t.key);
      return { item: t, w: priorityWeight(i === -1 ? undefined : i, rank.length) };
    });
    const choice = pickWeighted(weighted);
    if (!choice) return;
    shown.current.add(choice.key);
    // Petit roulement d'affiches avant de dévoiler le titre.
    setPicked(null);
    let n = 0;
    const timer = setInterval(() => {
      setRolling(pool[Math.floor(Math.random() * pool.length)]);
      if (++n >= 10) {
        clearInterval(timer);
        setRolling(null);
        setPicked(choice);
        burst(['🍿', '🎬', '✨'], undefined, 16);
      }
    }, 80);
  };

  const seen = (t: Title) => {
    toast(`✓ « ${t.title} » passe dans tes titres vus`);
    setPicked(null);
  };

  const shownTitle = rolling ?? picked;

  return (
    <Shell>
      <TypeFilter<TonightFilters['category']>
        value={filters.category}
        options={[
          ['all', 'Tout', 'Toute la wishlist'],
          ['movie', 'Un film', 'Seulement les films'],
          ['tv', 'Une série', 'Seulement les séries'],
          ...(categories.includes('anime') ? [['anime', 'Un anime', 'Seulement les animes'] as ['anime', string, string]] : []),
        ]}
        onChange={(category) => update({ ...filters, category })}
      />
      <div className="chips">
        {hasMyProviders(mine) && (
          <button className={`chip ${filters.mineOnly ? 'active' : ''}`} onClick={() => update({ ...filters, mineOnly: !filters.mineOnly })} title="Seulement ce qui est dispo sur tes abonnements">
            📺 Sur mes abonnements
          </button>
        )}
        {(filters.category === 'all' || filters.category === 'movie') && (
          <button className={`chip ${filters.short ? 'active' : ''}`} onClick={() => update({ ...filters, short: !filters.short })} title="Films de 2 h maximum">
            ⏱️ Moins de 2 h
          </button>
        )}
      </div>
      {genres.length > 0 && (
        <div className="chips genre-chips">
          <button className={`chip ${filters.genre === null ? 'active' : ''}`} onClick={() => update({ ...filters, genre: null })}>
            Tous genres
          </button>
          {genres.map((g) => (
            <button key={g} className={`chip ${filters.genre === g ? 'active' : ''}`} onClick={() => update({ ...filters, genre: g })}>
              {g}
            </button>
          ))}
        </div>
      )}

      <button className="btn primary roll-btn" onClick={roll} disabled={!candidates.length || !!rolling} title="Tirer un titre au sort dans ta wishlist">
        {picked ? '🎲 Un autre !' : '🎲 Tirer au sort'}
      </button>
      <p className="muted small center">
        {candidates.length
          ? `${candidates.length} titre${candidates.length > 1 ? 's' : ''} possible${candidates.length > 1 ? 's' : ''} · tes priorités ont plus de chances`
          : 'Aucun titre de ta wishlist ne correspond à ces filtres.'}
      </p>

      {shownTitle && (
        <div className={`tonight-card ${rolling ? 'rolling' : 'revealed'}`}>
          <div className="tonight-poster">
            <Poster title={shownTitle} size="w342" />
            {!rolling && <RatingBadge title={shownTitle} className="corner-left" />}
          </div>
          <div className="tonight-info">
            <TitleText title={shownTitle} showType credits />
            {picked && !rolling && (
              <>
                <ProviderLine title={picked} maxAge={WEEK} />
                <p className="tonight-overview">{picked.overview || 'Pas de résumé disponible.'}</p>
                <div className="row">
                  <button className="btn small" onClick={() => openFiche(picked)} title="Durée, note, bande-annonce, où regarder…">
                    📄 Fiche
                  </button>
                  <SeenButtons title={picked} onSeen={() => seen(picked)} />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="page">
      <TopBar title="🍿 Ce soir ?" />
      {children}
    </main>
  );
}
