import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { clearStatus, db, type MediaType, type Title } from '../db';
import { changeStatus } from '../ranking';
import { matchesSearch } from '../hooks';
import { SearchBox, TitleRow, TopBar, TypeFilter } from '../components/common';

type ListId = 'seen' | 'unseen';
type Filter = 'all' | MediaType;

const PAGE = 100;

/** Tous les titres vus ou « pas vus », pour retrouver un titre et corriger une erreur. */
export default function Lists() {
  const [list, setList] = useState<ListId>('seen');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const items = useLiveQuery(async () => {
    const answers = await db.answers.where('status').equals(list).reverse().sortBy('updatedAt');
    const keep = answers.filter((a) => filter === 'all' || a.type === filter);
    return (await db.titles.bulkGet(keep.map((a) => a.key))).filter((t): t is Title => !!t);
  }, [list, filter]);

  const shown = items?.filter((t) => matchesSearch(t, query)) ?? [];
  const reset = () => setLimit(PAGE);

  return (
    <main className="page">
      <TopBar title="📚 Mes listes" right={items && <span className="pill">{items.length.toLocaleString('fr-FR')}</span>} />
      <TypeFilter<ListId>
        value={list}
        options={[
          ['seen', '✓ Vus', 'Tous les titres que tu as vus'],
          ['unseen', '🙈 Pas vus', 'Les titres pas vus et sans envie (ils ne sont plus proposés au swipe)'],
        ]}
        onChange={(v) => {
          setList(v);
          reset();
        }}
      />
      <TypeFilter<Filter>
        value={filter}
        options={[
          ['all', 'Tous', 'Films et séries'],
          ['movie', 'Films', 'Films seulement'],
          ['tv', 'Séries', 'Séries seulement'],
        ]}
        onChange={(v) => {
          setFilter(v);
          reset();
        }}
      />
      <SearchBox
        value={query}
        onChange={(v) => {
          setQuery(v);
          reset();
        }}
      />
      {!items ? (
        <p className="muted center">Chargement…</p>
      ) : !shown.length ? (
        <p className="muted center">{items.length ? 'Aucun titre ne correspond.' : 'Cette liste est vide.'}</p>
      ) : (
        <ul className="list">
          {shown.slice(0, limit).map((t) => (
            <TitleRow key={t.key} title={t} showType={filter === 'all'}>
              {list === 'seen' ? (
                <>
                  <button className="btn small" onClick={() => changeStatus(t, 'wish')} title="Pas vu finalement : mettre dans la wishlist" aria-label="Mettre en wishlist">
                    ♥
                  </button>
                  <button className="btn small" onClick={() => changeStatus(t, 'unseen')} title="Pas vu finalement, et pas envie" aria-label="Marquer pas vu">
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <button className="btn small primary" onClick={() => changeStatus(t, 'seen')} title="Je l’ai vu finalement">
                    ✓
                  </button>
                  <button className="btn small" onClick={() => changeStatus(t, 'wish')} title="Finalement, envie de le voir : wishlist" aria-label="Mettre en wishlist">
                    ♥
                  </button>
                  <button className="btn small" onClick={() => clearStatus(t.key)} title="Le reproposer au swipe" aria-label="Reproposer au swipe">
                    ↺
                  </button>
                </>
              )}
            </TitleRow>
          ))}
        </ul>
      )}
      {shown.length > limit && (
        <button className="btn" onClick={() => setLimit((l) => l + PAGE)} title="Afficher les titres suivants">
          Afficher plus ({(shown.length - limit).toLocaleString('fr-FR')} restants)
        </button>
      )}
    </main>
  );
}
