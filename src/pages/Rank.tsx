import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type MediaType, type Title } from '../lib/db';
import { changeStatus, readRanking, unrank, type Scope } from '../lib/ranking';
import { matchesTheme, themeFilter, themeLabel } from '../lib/themes';
import { TopBar, TypeFilter } from '../components/common';
import { Duel } from '../components/Duel';
import { RankedList } from '../components/RankedList';
import { TierList } from '../components/TierList';
import { FilterButton, FilterSheet, FilterStrip, useSavedFilter } from '../components/FilterSheet';
import { shareTop } from '../lib/share';
import { toast } from '../lib/fun';

type View = 'duel' | 'list' | 'tiers';

export default function Rank({ type }: { type: MediaType }) {
  const [view, setView] = useState<View>('duel');
  const [sharing, setSharing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [theme, setTheme] = useSavedFilter(`rank-filter:${type}`);
  const scope: Scope = { type, list: 'seen' };
  const filter = themeFilter(theme);
  const label = themeLabel(type, theme);

  // Titres vus de ce type : pour compter ce que gardent les filtres.
  const seen = useLiveQuery(async () => {
    const keys = await db.answers.where('[type+status]').equals([type, 'seen']).primaryKeys();
    return (await db.titles.bulkGet(keys)).filter((t): t is Title => !!t);
  }, [type]);

  const toWishlist = async (t: Title) => {
    if (confirm(`Remettre « ${t.title} » dans la wishlist ? Il sera retiré des titres vus et du classement.`)) {
      await changeStatus(t, 'wish');
    }
  };

  const share = async () => {
    const all = (await db.titles.bulkGet(await readRanking(scope))).filter((t): t is Title => !!t);
    const titles = (filter ? all.filter(filter) : all).slice(0, 10);
    if (!titles.length) {
      toast('Classe au moins un titre pour partager ton top !');
      return;
    }
    setSharing(true);
    try {
      await shareTop(type, titles, filter ? label : undefined);
    } catch (e) {
      toast(`✕ ${(e as Error).message}`);
    } finally {
      setSharing(false);
    }
  };

  return (
    <main className="page wide">
      <TopBar
        title={type === 'movie' ? '🏆 Films' : '🥇 Séries'}
        right={<FilterButton active={!!filter} label={label} onClick={() => setShowFilters(true)} />}
      />
      {filter && <FilterStrip label={label} onClick={() => setShowFilters(true)} />}
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
        <TierList type={type} filter={filter} filterLabel={label} />
      ) : view === 'duel' ? (
        <Duel
          key={JSON.stringify(theme)}
          scope={scope}
          filter={filter}
          question="Lequel préfères-tu ?"
          emptyText="Aucun titre vu pour l’instant. Swipe ou ajoute des titres vus."
        />
      ) : (
        <>
          <button className="btn primary" onClick={share} disabled={sharing} title="Créer une image de ton top 10 (filtré) à partager">
            {sharing ? 'Création de l’image…' : '📤 Partager mon top 10'}
          </button>
          <RankedList
            scope={scope}
            filter={filter}
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

      {showFilters && (
        <FilterSheet
          type={type}
          initial={theme}
          count={(t) => (seen ?? []).filter((x) => matchesTheme(x, t)).length}
          applyLabel={(n) => `Appliquer (${n.toLocaleString('fr-FR')} vus)`}
          hasCatalogueData={(seen ?? []).some((t) => t.rating !== undefined || t.details?.rating)}
          onApply={(t) => {
            setTheme(t);
            setShowFilters(false);
          }}
          onClose={() => setShowFilters(false)}
        />
      )}
    </main>
  );
}
