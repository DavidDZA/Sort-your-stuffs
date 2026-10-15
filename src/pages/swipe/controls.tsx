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

/** Petite étiquette sur l'affiche quand le titre est proposé grâce à un titre aimé. */
export function BoostTag({ boost }: { boost?: { from: string } }) {
  if (!boost) return null;
  return (
    <span className="boost-tag" title={`Recommandé parce que tu as aimé « ${boost.from} »`}>
      ✨ Comme « {boost.from} »
    </span>
  );
}
