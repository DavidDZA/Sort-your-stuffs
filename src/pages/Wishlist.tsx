import { useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type MediaType, type Title } from '../db';
import { changeStatus, scopeId, unrank, type Scope } from '../ranking';
import { prefetchDetails, WEEK } from '../tmdb';
import { getMyProviders } from '../settings';
import { matchesSearch } from '../hooks';
import { ProviderLine, SearchBox, TitleRow, TopBar, TypeFilter } from '../components/common';
import { Duel, RankedList } from '../components/Ranking';

type View = 'list' | 'duel';
type Filter = 'all' | MediaType;

export default function Wishlist() {
  const [view, setView] = useState<View>('list');
  const [filter, setFilter] = useState<Filter>('all');
  const [onlyMine, setOnlyMine] = useState(false);
  const myProviders = getMyProviders();
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
  const mineFilter = onlyMine
    ? (t: Title) => !!t.details?.providers.flatrate.some((p) => myProviders.includes(p.id))
    : undefined;

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
    <main className="page">
      <TopBar title="💖 Wishlist" right={wishes && <span className="pill" title="Titres dans la wishlist">{wishes.length}</span>} />
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
        (myProviders.length ? (
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
        <Duel key={scopeId(scope)} scope={scope} question="Lequel as-tu le plus envie de voir ?" emptyText="Rien dans la wishlist pour l’instant." />
      ) : filter === 'all' ? (
        <AllWishes filter={mineFilter} below={providers} />
      ) : (
        <RankedList key={scopeId(scope)} scope={scope} empty="Rien dans la wishlist pour l’instant." actions={actions} filter={mineFilter} below={providers} />
      )}
      {view === 'list' && <p className="muted tiny center">Disponibilités : JustWatch</p>}
    </main>
  );
}

function WishActions({ title }: { title: Title }) {
  return (
    <>
      <button className="btn small primary" onClick={() => changeStatus(title, 'seen')} title="Je l’ai vu : passe dans les titres vus (non classés)">
        ✓ Vu
      </button>
      <button className="btn small" onClick={() => changeStatus(title, 'unseen')} title="Retirer de la wishlist" aria-label="Retirer de la wishlist">
        ✕
      </button>
    </>
  );
}

/** Films et séries mélangés, du plus récent ajout au plus ancien. */
function AllWishes({ filter, below }: { filter?: (t: Title) => boolean; below: (t: Title) => ReactNode }) {
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
