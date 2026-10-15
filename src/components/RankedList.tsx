import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Title } from '../lib/db';
import { readRanking, unrankedKeys, type Scope } from '../lib/ranking';
import { matchesSearch } from '../lib/hooks';
import { SearchBox, TitleRow } from './common';

const MEDALS = ['🥇', '🥈', '🥉'];

/** Classement numéroté, suivi des titres pas encore classés ; recherche et filtre optionnel. */
export function RankedList({
  scope,
  empty,
  actions,
  filter,
  below,
}: {
  scope: Scope;
  empty: string;
  actions: (t: Title, ranked: boolean) => ReactNode;
  filter?: (t: Title) => boolean;
  below?: (t: Title) => ReactNode;
}) {
  const [query, setQuery] = useState('');
  const data = useLiveQuery(async () => {
    const ranking = await readRanking(scope);
    const unranked = await unrankedKeys(scope, ranking);
    const [r, u] = await Promise.all([db.titles.bulkGet(ranking), db.titles.bulkGet(unranked)]);
    const ok = (t: Title | undefined): t is Title => !!t;
    return { ranked: r.filter(ok), unranked: u.filter(ok).sort((a, b) => a.title.localeCompare(b.title, 'fr')) };
  }, [scope.type, scope.list]);

  if (!data) return <p className="muted center">Chargement…</p>;
  if (!data.ranked.length && !data.unranked.length) return <p className="muted center">{empty}</p>;

  const keep = (t: Title) => matchesSearch(t, query) && (!filter || filter(t));
  // Le rang affiché reste celui du classement complet, même filtré.
  const ranked = data.ranked.map((t, i) => ({ t, rank: i + 1 })).filter(({ t }) => keep(t));
  const unranked = data.unranked.filter(keep);

  return (
    <>
      {data.ranked.length + data.unranked.length > 8 && <SearchBox value={query} onChange={setQuery} />}
      {!ranked.length && !unranked.length && <p className="muted center">Aucun titre ne correspond.</p>}
      <ol className="list">
        {ranked.map(({ t, rank }) => (
          <TitleRow
            key={t.key}
            title={t}
            below={below?.(t)}
            prefix={<span className={`rank-num ${rank <= 3 ? 'medal' : ''}`}>{rank <= 3 ? MEDALS[rank - 1] : rank}</span>}
          >
            {actions(t, true)}
          </TitleRow>
        ))}
      </ol>
      {unranked.length > 0 && (
        <>
          <h3 className="section-title">Non classés ({unranked.length})</h3>
          <ul className="list">
            {unranked.map((t) => (
              <TitleRow key={t.key} title={t} below={below?.(t)}>
                {actions(t, false)}
              </TitleRow>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
