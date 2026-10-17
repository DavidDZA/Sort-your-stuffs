import { useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type MediaType, type Title } from '../lib/db';
import { changeStatus, scopeId, unrank, type Scope } from '../lib/ranking';
import { prefetchDetails, WEEK } from '../lib/tmdb';
import { availableOnMine, hasMyProviders, loadMyProviders } from '../lib/providers';
import { matchesSearch } from '../lib/hooks';
import { matchesTheme, themeFilter, themeLabel } from '../lib/themes';
import { ProviderLine, SearchBox, SeenButtons, TitleRow, TopBar, TypeFilter } from '../components/common';
import { FilterButton, FilterSheet, FilterStrip, useSavedFilter } from '../components/FilterSheet';
import { Duel } from '../components/Duel';
import { RankedList } from '../components/RankedList';

type View = 'list' | 'duel';
type Filter = 'all' | MediaType;

export default function Wishlist() {
  const [view, setView] = useState<View>('list');
  const [filter, setFilter] = useState<Filter>('all');
  const [onlyMine, setOnlyMine] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [savedTheme, setTheme] = useSavedFilter('wish-filter');
  const mine = loadMyProviders();
  const wishes = useLiveQuery(async () => {
    const keys = await db.answers.where('status').equals('wish').primaryKeys();
    return (await db.titles.bulkGet(keys)).filter((t): t is Title => !!t);
  });

  // Plateformes à jour (moins d'une semaine) pour toute la wishlist.
  useEffect(() => {
    if (wishes) prefetchDetails(wishes, WEEK);
  }, [wishes?.length]);

  // Les duels se font par type : « Tous » n'a pas de sens ici.
  const type: MediaType = filter === 'all' ? 'movie' : filter;
  const scope: Scope = { type, list: 'wish' };
  // Films et séries mélangés : le genre ne s'applique pas (les genres diffèrent).
  const listType: MediaType | null = view === 'duel' ? type : filter === 'all' ? null : filter;
  const theme = listType ? savedTheme : { ...savedTheme, genre: null };
  const byTheme = themeFilter(theme);
  const byMine = onlyMine ? (t: Title) => !!t.details && availableOnMine(t.details.providers.flatrate, mine) : null;
  const combined = byTheme || byMine ? (t: Title) => (!byTheme || byTheme(t)) && (!byMine || byMine(t)) : null;
  const label = themeLabel(listType, theme);

  const actions = (t: Title, ranked: boolean): ReactNode => (
    <>
      {ranked && (
        <button className="btn small" onClick={() => unrank(scope, t.key)} title="Retirer de l’ordre de priorité pour le replacer avec de nouveaux duels" aria-label="Re-prioriser">
          ↺
        </button>
      )}
      <WishActions title={t} />
    </>
  );
  const providers = (t: Title) => <ProviderLine title={t} maxAge={WEEK} />;

  return (
    <main className="page wide wishlist-page">
      <TopBar title={wishes ? `💖 Wishlist (${wishes.length})` : '💖 Wishlist'} right={<FilterButton active={!!byTheme} label={label} onClick={() => setShowFilters(true)} />} />
      {byTheme && <FilterStrip label={label} onClick={() => setShowFilters(true)} />}
      <TypeFilter<View>
        value={view}
        options={[
          ['list', 'Liste', 'Voir la wishlist'],
          ['duel', 'Prioriser', 'Classer la wishlist en choisissant entre deux titres'],
        ]}
        onChange={(v) => {
          setView(v);
          if (v === 'duel' && filter === 'all') setFilter('movie');
        }}
      />
      <TypeFilter<Filter>
        value={view === 'duel' ? type : filter}
        options={[
          ...(view === 'list' ? [['all', 'Tous', 'Films et séries, du plus récent au plus ancien ajout'] as [Filter, string, string]] : []),
          ['movie', 'Films', 'Films seulement, par ordre de priorité'],
          ['tv', 'Séries', 'Séries seulement, par ordre de priorité'],
        ]}
        onChange={setFilter}
      />
      {view === 'list' &&
        (hasMyProviders(mine) ? (
          <button
            className={`chip ${onlyMine ? 'active' : ''}`}
            onClick={() => setOnlyMine((v) => !v)}
            title="N’afficher que les titres disponibles sur tes abonnements"
          >
            📺 Dispo sur mes abonnements
          </button>
        ) : (
          <a className="muted small" href="#/settings">
            📺 Choisis tes abonnements dans les réglages pour filtrer ce qui est dispo chez toi →
          </a>
        ))}
      {view === 'duel' ? (
        <Duel
          key={`${scopeId(scope)}-${JSON.stringify(theme)}`}
          scope={scope}
          filter={byTheme}
          question="Lequel as-tu le plus envie de voir ?"
          emptyText="Rien dans la wishlist pour l’instant."
        />
      ) : filter === 'all' ? (
        <AllWishes filter={combined} below={providers} />
      ) : (
        <RankedList key={scopeId(scope)} scope={scope} empty="Rien dans la wishlist pour l’instant." actions={actions} filter={combined} below={providers} />
      )}
      {view === 'list' && <p className="muted tiny center">Disponibilités : JustWatch</p>}

      {showFilters && (
        <FilterSheet
          type={listType}
          initial={savedTheme}
          count={(t) => (wishes ?? []).filter((x) => (!listType || x.type === listType) && matchesTheme(x, listType ? t : { ...t, genre: null })).length}
          applyLabel={(n) => `Appliquer (${n.toLocaleString('fr-FR')} titres)`}
          hasCatalogueData={(wishes ?? []).some((t) => t.rating !== undefined || t.details?.rating)}
          onApply={(t) => {
            // Le genre choisi est gardé pour Films / Séries, même s'il ne s'applique pas à « Tous ».
            setTheme(listType ? t : { ...t, genre: savedTheme.genre });
            setShowFilters(false);
          }}
          onClose={() => setShowFilters(false)}
        />
      )}
    </main>
  );
}

function WishActions({ title }: { title: Title }) {
  return (
    <>
      <SeenButtons title={title} />
      <button className="btn small" onClick={() => changeStatus(title, 'unseen')} title="Retirer de la wishlist" aria-label="Retirer de la wishlist">
        ✕
      </button>
    </>
  );
}

/** Films et séries mélangés, du plus récent ajout au plus ancien. */
function AllWishes({ filter, below }: { filter: ((t: Title) => boolean) | null; below: (t: Title) => ReactNode }) {
  const [query, setQuery] = useState('');
  const items = useLiveQuery(async () => {
    const answers = await db.answers.where('status').equals('wish').reverse().sortBy('updatedAt');
    const titles = await db.titles.bulkGet(answers.map((a) => a.key));
    return titles.filter((t): t is Title => !!t);
  });

  if (!items) return <p className="muted center">Chargement…</p>;
  if (!items.length) return <p className="muted center">Rien dans la wishlist pour l’instant.</p>;
  const shown = items.filter((t) => matchesSearch(t, query) && (!filter || filter(t)));

  return (
    <>
      {items.length > 8 && <SearchBox value={query} onChange={setQuery} />}
      {!shown.length && <p className="muted center">Aucun titre ne correspond.</p>}
      <ul className="list">
        {shown.map((t) => (
          <TitleRow key={t.key} title={t} showType below={below(t)}>
            <WishActions title={t} />
          </TitleRow>
        ))}
      </ul>
    </>
  );
}
