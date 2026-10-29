import { useMemo } from 'react';
import { CATEGORY_LABEL, type Category } from '../../lib/category';
import { compatibility } from '../../lib/together';
import { TitleRow } from '../../components/common';
import { NeedsSharing, type Loaded } from './shared';

function verdict(p: number): string {
  if (p >= 80) return 'Âmes sœurs cinéphiles 💞';
  if (p >= 65) return 'Goûts très proches';
  if (p >= 55) return 'Pas mal de points communs';
  if (p >= 45) return 'Goûts indépendants';
  return 'Goûts opposés : de beaux débats en perspective !';
}

export function MatchView({ data, category }: { data: Loaded; category: Category }) {
  const pseudo = data.friend.pseudo;
  const match = useMemo(() => compatibility(data.me, data.them, category), [data, category]);
  if (!data.friend.shareRanking) return <NeedsSharing pseudo={pseudo} what="son classement" />;
  if (!match) {
    return (
      <p className="muted center">
        Pas assez de {CATEGORY_LABEL[category].plural} classé{category === 'tv' ? 'e' : ''}s par vous deux (il en faut au moins 5 en commun). Continuez les duels !
      </p>
    );
  }
  const list = (items: typeof match.agree) => (
    <ul className="list">
      {items.map((x) => {
        const t = data.titles.get(x.key);
        return t && <TitleRow key={x.key} title={t} below={<span className="muted tiny">Toi : n°{x.mine} · {pseudo} : n°{x.theirs}</span>} />;
      })}
    </ul>
  );
  return (
    <>
      <section className="card duo-match">
        <p className="duo-percent">{match.percent} %</p>
        <p>{verdict(match.percent)}</p>
        <p className="muted small">
          Sur {match.common} {CATEGORY_LABEL[category].plural} classé{category === 'tv' ? 'e' : ''}s par vous deux.
        </p>
      </section>
      {match.agree.length > 0 && (
        <section className="duo-section">
          <h3>🤝 Vous êtes d’accord</h3>
          {list(match.agree)}
        </section>
      )}
      {match.disagree.length > 0 && (
        <section className="duo-section">
          <h3>⚔️ Vos plus gros désaccords</h3>
          {list(match.disagree)}
        </section>
      )}
    </>
  );
}
