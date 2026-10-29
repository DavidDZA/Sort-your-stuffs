import type { Title } from '../lib/db';
import { useLongPress } from '../lib/hooks';
import { Poster, RatingBadge, TitleText } from './common';
import { openFiche } from './Fiche';

/** Une des deux affiches d'un duel : toucher pour choisir, appui long pour la fiche, ℹ pour les résumés. */
export function DuelCard(props: {
  title: Title;
  state: string;
  showInfo: boolean;
  onPick: (el: HTMLElement) => void;
  onToggleInfo: () => void;
}) {
  const { title: t, showInfo } = props;
  const longPress = useLongPress(() => openFiche(t));
  return (
    <div
      role="button"
      tabIndex={0}
      className={`duel-card ${props.state}`}
      {...longPress}
      onClick={(e) => props.onPick(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onPick(e.currentTarget);
        }
      }}
      title={`Choisir « ${t.title} » · Appui long : fiche complète`}
    >
      <div className="duel-poster">
        <Poster title={t} size="w342" />
        <RatingBadge title={t} className="corner-left" />
        {showInfo && (
          <div
            className="duel-overview"
            onClick={(e) => {
              e.stopPropagation();
              props.onToggleInfo();
            }}
            title="Toucher pour masquer les résumés"
          >
            <div className="overview-text">
              <p>{t.overview || 'Pas de résumé disponible.'}</p>
            </div>
            <button
              className="btn small overview-fiche"
              onClick={(e) => {
                e.stopPropagation();
                openFiche(t);
              }}
              title="Ouvrir la fiche complète"
            >
              📄 Fiche
            </button>
          </div>
        )}
        <button
          className="info-btn"
          onClick={(e) => {
            e.stopPropagation();
            props.onToggleInfo();
          }}
          title={showInfo ? 'Masquer les résumés' : 'Afficher les résumés des deux titres'}
          aria-label={showInfo ? 'Masquer les résumés' : 'Afficher les résumés'}
        >
          {showInfo ? '✕' : 'ℹ'}
        </button>
      </div>
      <TitleText title={t} credits />
    </div>
  );
}
