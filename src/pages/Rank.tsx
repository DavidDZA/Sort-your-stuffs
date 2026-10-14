import { useState } from 'react';
import type { MediaType, Title } from '../db';
import { changeStatus, unrank, type Scope } from '../ranking';
import { TopBar, TypeFilter } from '../components/common';
import { Duel, RankedList } from '../components/Ranking';

type View = 'duel' | 'list';

export default function Rank({ type }: { type: MediaType }) {
  const [view, setView] = useState<View>('duel');
  const scope: Scope = { type, list: 'seen' };

  const toWishlist = async (t: Title) => {
    if (confirm(`Remettre « ${t.title} » dans la wishlist ? Il sera retiré des titres vus et du classement.`)) {
      await changeStatus(t, 'wish');
    }
  };

  return (
    <main className="page">
      <TopBar title={type === 'movie' ? '🏆 Films' : '🥇 Séries'} />
      <TypeFilter<View>
        value={view}
        options={[
          ['duel', 'Duels', 'Classer en choisissant entre deux titres'],
          ['list', 'Mon classement', 'Voir et modifier le classement'],
        ]}
        onChange={setView}
      />
      {view === 'duel' ? (
        <Duel scope={scope} question="Lequel préfères-tu ?" emptyText="Aucun titre vu pour l’instant. Swipe ou ajoute des titres vus." />
      ) : (
        <RankedList
          scope={scope}
          empty="Aucun titre vu pour l’instant."
          actions={(t, ranked) => (
            <>
              {ranked && (
                <button className="btn small" onClick={() => unrank(scope, t.key)} title="Retirer du classement pour le replacer avec de nouveaux duels" aria-label="Reclasser">
                  ↺
                </button>
              )}
              <button className="btn small" onClick={() => toWishlist(t)} title="Remettre dans la wishlist (pas vu finalement)" aria-label="Remettre en wishlist">
                ♥
              </button>
            </>
          )}
        />
      )}
    </main>
  );
}
