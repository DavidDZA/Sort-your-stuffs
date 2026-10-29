import { useState, type ReactNode } from 'react';
import type { Title } from '../../lib/db';
import { CATEGORY_LABEL, type Category } from '../../lib/category';
import type { Side } from '../../lib/together';
import { matchesSearch } from '../../lib/hooks';
import { SearchBox, TitleRow } from '../../components/common';
import { addToWishlist, NeedsSharing, type Loaded } from './shared';

const MEDALS = ['🥇', '🥈', '🥉'];
const PAGE = 100;

/** Où j'en suis avec un titre de l'ami : classé, vu, dans ma wishlist, pas envie. */
function myStatus(me: Side, key: string, category: Category): string | null {
  const a = me.answers.get(key);
  if (!a) return null;
  if (a.status === 'wish') return 'Toi : 💖 dans ta wishlist';
  if (a.status === 'unseen') return 'Toi : pas envie';
  const i = (me.rankings[category] ?? []).indexOf(key);
  return `Toi : ${i === -1 ? 'vu' : `n°${i + 1}`}${a.tier === 'good' ? ' 👍' : a.tier === 'meh' ? ' 😐' : ''}`;
}

/** Tout le classement de l'ami, puis ses titres vus pas encore classés ; ma situation sur chacun. */
export function FriendTop({ data, category, onWish }: { data: Loaded; category: Category; onWish: () => void }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const pseudo = data.friend.pseudo;
  const ranking = data.them.rankings[category] ?? [];
  const ranked = new Set(ranking);
  const unranked = [...data.them.answers]
    .filter(([key, a]) => a.status === 'seen' && data.catOf(key) === category && !ranked.has(key))
    .map(([key]) => data.titles.get(key))
    .filter((t): t is Title => !!t)
    .sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  if (!data.friend.shareRanking) return <NeedsSharing pseudo={pseudo} what="son classement" />;

  const rows = ranking
    .map((key, i) => ({ t: data.titles.get(key), rank: i + 1 }))
    .filter((x): x is { t: Title; rank: number } => !!x.t && matchesSearch(x.t, query));
  const others = unranked.filter((t) => matchesSearch(t, query));
  if (!ranking.length && !unranked.length) {
    return <p className="muted center">Rien de vu chez {pseudo} dans les {CATEGORY_LABEL[category].plural} pour l’instant.</p>;
  }

  const wish = (t: Title) => addToWishlist(t, onWish);
  const row = (t: Title, prefix?: ReactNode) => {
    const tier = data.them.answers.get(t.key)?.tier;
    const mine = myStatus(data.me, t.key, category);
    return (
      <TitleRow
        key={t.key}
        title={t}
        prefix={prefix}
        below={
          <span className="muted tiny">
            {[tier === 'good' && `👍 bien pour ${pseudo}`, tier === 'meh' && `😐 bof pour ${pseudo}`, mine].filter(Boolean).join(' · ')}
          </span>
        }
      >
        {!mine && (
          <button className="btn small" onClick={() => wish(t)} title="Ajouter à ta wishlist" aria-label="Ajouter à ta wishlist">
            💖
          </button>
        )}
      </TitleRow>
    );
  };

  return (
    <>
      {ranking.length + unranked.length > 8 && <SearchBox value={query} onChange={setQuery} />}
      <p className="muted small center">
        {ranking.length} classé{ranking.length > 1 ? 's' : ''}
        {unranked.length > 0 && ` · ${unranked.length} vu${unranked.length > 1 ? 's' : ''} sans classement`}
      </p>
      {!rows.length && !others.length && <p className="muted center">Aucun titre ne correspond.</p>}
      <ol className="list">
        {rows.slice(0, limit).map(({ t, rank }) => row(t, <span className={`rank-num ${rank <= 3 ? 'medal' : ''}`}>{rank <= 3 ? MEDALS[rank - 1] : rank}</span>))}
      </ol>
      {rows.length > limit && (
        <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>
          Afficher plus ({(rows.length - limit).toLocaleString('fr-FR')} restants)
        </button>
      )}
      {others.length > 0 && rows.length <= limit && (
        <>
          <h3 className="section-title">Vus, pas encore classés ({others.length})</h3>
          <ul className="list">{others.map((t) => row(t))}</ul>
        </>
      )}
    </>
  );
}
