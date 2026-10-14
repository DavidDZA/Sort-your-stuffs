import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type MediaType, type Title } from '../db';
import { changeStatus, scopeId, unrank, type Scope } from '../ranking';
import { Poster, TitleText, TopBar, TypeFilter } from '../components/common';
import { Duel, RankedList } from '../components/Ranking';

type View = 'list' | 'duel';
type Filter = 'all' | MediaType;

export default function Wishlist() {
  const [view, setView] = useState<View>('list');
  const [filter, setFilter] = useState<Filter>('all');
  const count = useLiveQuery(() => db.answers.where('status').equals('wish').count());

  // Les duels se font par type : « Tous » n'a pas de sens ici.
  const type: MediaType = filter === 'all' ? 'movie' : filter;
  const scope: Scope = { type, list: 'wish' };

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

  return (
    <main className="page">
      <TopBar title="Wishlist" right={count !== undefined && <span className="muted small" title="Titres dans la wishlist">{count}</span>} />
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
      {view === 'duel' ? (
        <Duel key={scopeId(scope)} scope={scope} question="Lequel as-tu le plus envie de voir ?" emptyText="Rien dans la wishlist pour l’instant." />
      ) : filter === 'all' ? (
        <AllWishes />
      ) : (
        <RankedList key={scopeId(scope)} scope={scope} empty="Rien dans la wishlist pour l’instant." actions={actions} />
      )}
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
function AllWishes() {
  const items = useLiveQuery(async () => {
    const answers = await db.answers.where('status').equals('wish').reverse().sortBy('updatedAt');
    const titles = await db.titles.bulkGet(answers.map((a) => a.key));
    return titles.filter((t): t is Title => !!t);
  });

  if (!items) return <p className="muted center">Chargement…</p>;
  if (!items.length) return <p className="muted center">Rien dans la wishlist pour l’instant.</p>;

  return (
    <ul className="list">
      {items.map((t) => (
        <li key={t.key} className="list-item">
          <Poster title={t} size="w92" className="thumb" />
          <TitleText title={t} showType />
          <div className="item-actions">
            <WishActions title={t} />
          </div>
        </li>
      ))}
    </ul>
  );
}
