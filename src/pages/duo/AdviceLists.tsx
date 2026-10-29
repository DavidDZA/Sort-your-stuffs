import { useMemo, type ReactNode } from 'react';
import type { Title } from '../../lib/db';
import type { Category } from '../../lib/category';
import { advice, type Advice } from '../../lib/together';
import { TitleRow } from '../../components/common';
import { addToWishlist, NeedsSharing, type Loaded } from './shared';

export function AdviceLists({ data, category, onWish }: { data: Loaded; category: Category; onWish: () => void }) {
  const pseudo = data.friend.pseudo;
  const forMe = useMemo(() => advice(data.them, data.me, category, data.catOf), [data, category]);
  const forThem = useMemo(() => advice(data.me, data.them, category, data.catOf), [data, category]);
  if (!data.friend.shareRanking) return <NeedsSharing pseudo={pseudo} what="ses titres vus" />;

  const wish = (t: Title) => addToWishlist(t, onWish);

  const rows = (list: Advice[], who: string, action?: (t: Title, a: Advice) => ReactNode) => (
    <ul className="list">
      {list.map((a) => {
        const t = data.titles.get(a.key);
        return (
          t && (
            <TitleRow
              key={a.key}
              title={t}
              below={
                <span className="muted tiny">
                  {[a.good && '👍 bien', a.rank && `n°${a.rank} pour ${who}`].filter(Boolean).join(' · ')}
                </span>
              }
            >
              {action?.(t, a)}
            </TitleRow>
          )
        );
      })}
    </ul>
  );

  return (
    <>
      <section className="duo-section">
        <h3>💡 {pseudo} te conseille</h3>
        {forMe.length ? (
          rows(forMe, pseudo, (t, a) =>
            a.inWishlist ? (
              <span className="muted tiny">Dans ta wishlist</span>
            ) : (
              <button className="btn small" onClick={() => wish(t)} title="Ajouter à ta wishlist" aria-label="Ajouter à ta wishlist">
                💖
              </button>
            ),
          )
        ) : (
          <p className="muted small">Rien de nouveau : tu as déjà vu tout ce que {pseudo} a aimé.</p>
        )}
      </section>
      <section className="duo-section">
        <h3>🎁 À conseiller à {pseudo}</h3>
        {forThem.length ? (
          rows(forThem, 'toi', (_t, a) => a.inWishlist && <span className="muted tiny">Déjà dans sa wishlist</span>)
        ) : (
          <p className="muted small">{pseudo} a déjà vu tout ce que tu as aimé.</p>
        )}
      </section>
    </>
  );
}
