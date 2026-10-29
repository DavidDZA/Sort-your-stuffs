import { useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { db, withDetails, type Title } from '../lib/db';
import { moveInRanking, promote, readRanking, unrankedKeys, type Scope } from '../lib/ranking';
import { matchesSearch } from '../lib/hooks';
import { toast } from '../lib/fun';
import { SearchBox, TitleRow } from './common';

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Classement numéroté, suivi des titres pas encore classés ; recherche et filtre optionnel.
 * Sans filtre ni recherche, les titres se déplacent à la main : poignée ⠿ à glisser, ou numéro à toucher.
 */
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
  filter?: ((t: Title) => boolean) | null;
  below?: (t: Title) => ReactNode;
}) {
  const [query, setQuery] = useState('');
  // Ordre affiché tout de suite après un déplacement, le temps que la base le renvoie.
  const [optimistic, setOptimistic] = useState<string[] | null>(null);
  const data = useLiveQuery(async () => {
    const ranking = await readRanking(scope);
    const unranked = await unrankedKeys(scope, ranking);
    const [r, u] = await Promise.all([db.titles.bulkGet(ranking), db.titles.bulkGet(unranked)]);
    const ok = (t: Title | undefined): t is Title => !!t;
    // Fiches jointes : les filtres peuvent porter sur les plateformes (wishlist « dispo chez moi »).
    const [ranked, rest] = await Promise.all([withDetails(r.filter(ok)), withDetails(u.filter(ok))]);
    return { ranked, unranked: rest.sort((a, b) => a.title.localeCompare(b.title, 'fr')) };
  }, [scope.category, scope.list]);
  useEffect(() => setOptimistic(null), [data]);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  if (!data) return <p className="muted center">Chargement…</p>;
  if (!data.ranked.length && !data.unranked.length) return <p className="muted center">{empty}</p>;

  const byKey = new Map(data.ranked.map((t) => [t.key, t]));
  const rankedTitles = optimistic ? optimistic.map((k) => byKey.get(k)).filter((t): t is Title => !!t) : data.ranked;
  const keep = (t: Title) => matchesSearch(t, query) && (!filter || filter(t));
  // Avec des filtres, le classement est renuméroté dans la sélection (rang général en petit).
  // La recherche, elle, ne change pas les rangs.
  const selection = rankedTitles.map((t, i) => ({ t, overall: i + 1 })).filter(({ t }) => !filter || filter(t));
  const ranked = selection.map((x, i) => ({ ...x, rank: i + 1 })).filter(({ t }) => matchesSearch(t, query));
  const unranked = data.unranked.filter(keep);
  const canMove = !filter && !query.trim() && rankedTitles.length > 1;

  const move = async (t: Title, to: number) => {
    const keys = rankedTitles.map((x) => x.key);
    const from = keys.indexOf(t.key);
    if (from === -1 || to === from) return;
    setOptimistic(promote(keys, from, to));
    await moveInRanking(scope, t.key, to);
    toast(`↕️ « ${t.title} » passe n°${to + 1}`);
  };

  const askPlace = (t: Title, rank: number) => {
    const answer = prompt(`Nouvelle place pour « ${t.title} » (de 1 à ${rankedTitles.length}) :`, String(rank));
    const n = Math.floor(Number(answer));
    if (answer !== null && n >= 1) move(t, Math.min(n, rankedTitles.length) - 1);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const t = byKey.get(String(active.id));
    const to = rankedTitles.findIndex((x) => x.key === over.id);
    if (t && to !== -1) move(t, to);
  };

  const rankBadge = (t: Title, rank: number, overall: number) => {
    const content = (
      <>
        {rank <= 3 ? MEDALS[rank - 1] : rank}
        {filter && overall !== rank && <small className="rank-overall">n°{overall}</small>}
      </>
    );
    const className = `rank-num ${rank <= 3 ? 'medal' : ''}`;
    return canMove ? (
      <button className={className} onClick={() => askPlace(t, rank)} title="Toucher pour choisir une nouvelle place">
        {content}
      </button>
    ) : (
      <span className={className} title={filter ? `n°${overall} au classement complet` : undefined}>
        {content}
      </span>
    );
  };

  const rows = ranked.map(({ t, rank, overall }) =>
    canMove ? (
      <SortableRow key={t.key} title={t} badge={rankBadge(t, rank, overall)} below={below?.(t)}>
        {actions(t, true)}
      </SortableRow>
    ) : (
      <TitleRow key={t.key} title={t} below={below?.(t)} prefix={rankBadge(t, rank, overall)}>
        {actions(t, true)}
      </TitleRow>
    ),
  );

  return (
    <>
      {data.ranked.length + data.unranked.length > 8 && <SearchBox value={query} onChange={setQuery} />}
      {canMove && <p className="muted tiny center">⠿ Glisse un titre pour le déplacer · touche son numéro pour choisir sa place</p>}
      {!canMove && filter && rankedTitles.length > 1 && <p className="muted tiny center">Retire les filtres pour déplacer les titres à la main.</p>}
      {!ranked.length && !unranked.length && <p className="muted center">Aucun titre ne correspond.</p>}
      {canMove ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
          <SortableContext items={ranked.map(({ t }) => t.key)} strategy={verticalListSortingStrategy}>
            <ol className="list">{rows}</ol>
          </SortableContext>
        </DndContext>
      ) : (
        <ol className="list">{rows}</ol>
      )}
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

/** Ligne déplaçable : seule la poignée ⠿ attrape (toucher le reste de la ligne affiche le résumé, comme avant). */
function SortableRow({ title, badge, below, children }: { title: Title; badge: ReactNode; below?: ReactNode; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: title.key });
  return (
    <TitleRow
      title={title}
      below={below}
      itemRef={setNodeRef}
      itemStyle={{ transform: CSS.Translate.toString(transform), transition }}
      itemClass={isDragging ? 'dragging' : ''}
      prefix={
        <>
          <button ref={setActivatorNodeRef} className="drag-handle" {...attributes} {...listeners} aria-label={`Déplacer « ${title.title} »`} title="Glisser pour déplacer">
            ⠿
          </button>
          {badge}
        </>
      }
    >
      {children}
    </TitleRow>
  );
}
