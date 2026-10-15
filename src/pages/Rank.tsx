import { useState } from 'react';
import { db, type MediaType, type Title } from '../db';
import { changeStatus, readRanking, unrank, type Scope } from '../ranking';
import { TopBar, TypeFilter } from '../components/common';
import { Duel, RankedList } from '../components/Ranking';
import { TierList } from '../components/TierList';
import { shareTop } from '../share';
import { toast } from '../fun';

type View = 'duel' | 'list' | 'tiers';

export default function Rank({ type }: { type: MediaType }) {
  const [view, setView] = useState<View>('duel');
  const [sharing, setSharing] = useState(false);
  const scope: Scope = { type, list: 'seen' };

  const toWishlist = async (t: Title) => {
    if (confirm(`Remettre « ${t.title} » dans la wishlist ? Il sera retiré des titres vus et du classement.`)) {
      await changeStatus(t, 'wish');
    }
  };

  const share = async () => {
    const keys = (await readRanking(scope)).slice(0, 10);
    if (!keys.length) {
      toast('Classe au moins un titre pour partager ton top !');
      return;
    }
    setSharing(true);
    try {
      const titles = (await db.titles.bulkGet(keys)).filter((t): t is Title => !!t);
      await shareTop(type, titles);
    } catch (e) {
      toast(`✕ ${(e as Error).message}`);
    } finally {
      setSharing(false);
    }
  };

  return (
    <main className="page wide">
      <TopBar title={type === 'movie' ? '🏆 Films' : '🥇 Séries'} />
      <TypeFilter<View>
        value={view}
        options={[
          ['duel', 'Duels', 'Classer en choisissant entre deux titres'],
          ['list', 'Mon classement', 'Voir et modifier le classement'],
          ['tiers', 'Tier list', 'Ton classement en paliers S, A, B, C, D'],
        ]}
        onChange={setView}
      />
      {view === 'tiers' ? (
        <TierList type={type} />
      ) : view === 'duel' ? (
        <Duel scope={scope} question="Lequel préfères-tu ?" emptyText="Aucun titre vu pour l’instant. Swipe ou ajoute des titres vus." />
      ) : (
        <>
          <button className="btn primary" onClick={share} disabled={sharing} title="Créer une image de ton top 10 à partager">
            {sharing ? 'Création de l’image…' : '📤 Partager mon top 10'}
          </button>
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
        </>
      )}
    </main>
  );
}
