import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setStatus, type MediaType, type Title } from '../db';
import { Poster, TitleText, TopBar, TypeFilter } from '../components/common';

type Filter = 'all' | MediaType;

export default function Wishlist() {
  const [filter, setFilter] = useState<Filter>('all');

  const items = useLiveQuery(async () => {
    const answers = await db.answers.where('status').equals('wish').reverse().sortBy('updatedAt');
    const titles = await db.titles.bulkGet(answers.filter((a) => filter === 'all' || a.type === filter).map((a) => a.key));
    return titles.filter((t): t is Title => !!t);
  }, [filter]);

  return (
    <main className="page">
      <TopBar title="Wishlist" right={items && <span className="muted small">{items.length}</span>} />
      <TypeFilter<Filter>
        value={filter}
        options={[
          ['all', 'Tous'],
          ['movie', 'Films'],
          ['tv', 'Séries'],
        ]}
        onChange={setFilter}
      />
      {items && !items.length && <p className="muted center">Rien dans la wishlist pour l’instant.</p>}
      <ul className="list">
        {items?.map((t) => (
          <li key={t.key} className="list-item">
            <Poster title={t} size="w92" className="thumb" />
            <TitleText title={t} showType={filter === 'all'} />
            <div className="item-actions">
              <button className="btn small primary" onClick={() => setStatus(t, 'seen')}>
                ✓ Vu
              </button>
              <button className="btn small" onClick={() => setStatus(t, 'unseen')} aria-label="Retirer de la wishlist">
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
