import type { SagaTag } from './pool';

/** Bouton rond du swipe, avec sa légende et (option) la flèche de son coin. */
export function ActionButton(props: {
  className: string;
  icon: string;
  badge?: string;
  caption: string;
  tip: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="action">
      <button className={`round-btn ${props.className}`} onClick={props.onClick} disabled={props.disabled} title={props.tip} aria-label={props.caption}>
        {props.icon}
        {props.badge && <span className="btn-badge">{props.badge}</span>}
      </button>
      <span className="action-caption">{props.caption}</span>
    </div>
  );
}

/**
 * Étiquette en haut à gauche de l'affiche : la saga du film (« 🎞️ Harry Potter · 2/8 ») ou, à défaut,
 * le titre aimé qui l'a fait recommander (« ✨ Comme … »). Jamais les deux.
 */
export function CardTag({ saga, boost }: { saga?: SagaTag; boost?: { from: string } }) {
  if (saga) {
    return (
      <span className="card-tag saga-tag" title={`Saga ${saga.name} : film ${saga.position} sur ${saga.total}`}>
        🎞️ {saga.name} · {saga.position}/{saga.total}
      </span>
    );
  }
  if (!boost) return null;
  return (
    <span className="card-tag boost-tag" title={`Recommandé parce que tu as aimé « ${boost.from} »`}>
      ✨ Comme « {boost.from} »
    </span>
  );
}
