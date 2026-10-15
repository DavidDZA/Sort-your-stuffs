import { useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, TYPE_LABEL, type Title } from '../lib/db';
import { ensureDetails, posterUrl, providerLogo } from '../lib/tmdb';
import { getMyProviders } from '../lib/settings';
import { useLongPress } from '../lib/hooks';
import { openFiche } from './Fiche';

/** Bouton retour à l'accueil : chevron dessiné (centré exactement, contrairement au caractère « ‹ »). */
export function BackLink() {
  return (
    <a className="icon-btn" href="#/" aria-label="Retour" title="Retour à l’accueil">
      <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden>
        <path d="M15.25 5.5 8.75 12l6.5 6.5" />
      </svg>
    </a>
  );
}

export function TopBar({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <header className="topbar">
      <BackLink />
      <h2>{title}</h2>
      <div className="topbar-right">{right}</div>
    </header>
  );
}

export function Poster({ title, size = 'w342', className = '' }: { title: Title; size?: 'w92' | 'w185' | 'w342' | 'w500'; className?: string }) {
  const src = posterUrl(title.posterPath, size);
  return (
    <div className={`poster ${className}`}>
      {src ? <img src={src} alt="" draggable={false} loading="lazy" /> : <span className="poster-fallback">{title.title}</span>}
    </div>
  );
}

/** Titre français, titre original en dessous s'il est différent, année et (option) casting. */
export function TitleText({ title, showType = false, credits = false }: { title: Title; showType?: boolean; credits?: boolean }) {
  return (
    <div className="title-text">
      <div className="title-main">{title.title}</div>
      {title.originalTitle && title.originalTitle !== title.title && <div className="title-original">{title.originalTitle}</div>}
      <div className="title-meta">
        {showType && <span className="badge">{TYPE_LABEL[title.type]}</span>}
        {title.year ?? ''}
      </div>
      {credits && <CreditsLines title={title} />}
    </div>
  );
}

/** Fiche détaillée à jour du titre (depuis la base), chargée depuis TMDB si besoin. */
export function useDetails(title: Title, maxAge = Infinity) {
  const stored = useLiveQuery(() => db.titles.get(title.key).then((t) => t?.details ?? null), [title.key]);
  const [fetched, setFetched] = useState<Title['details'] | null>(null);
  useEffect(() => {
    let alive = true;
    ensureDetails(title, maxAge).then((d) => alive && setFetched(d));
    return () => {
      alive = false;
    };
  }, [title.key]);
  return stored ?? fetched ?? title.details ?? null;
}

/** Pastille de la note TMDB (sur 10), verte, jaune ou rouge selon la note. */
export function RatingBadge({ title, className = '' }: { title: Title; className?: string }) {
  const d = useDetails(title);
  if (!d?.rating) return null;
  const level = d.rating >= 7.5 ? 'high' : d.rating >= 6 ? 'mid' : 'low';
  return (
    <span className={`rating-badge ${level} ${className}`} title={`Note moyenne TMDB : ${d.rating.toLocaleString('fr-FR')}/10`}>
      ⭐ {d.rating.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
    </span>
  );
}

/** Réalisateur (ou créateur) et 2 acteurs principaux. */
function CreditsLines({ title }: { title: Title }) {
  const d = useDetails(title);
  return (
    <div className="title-credits">
      {d?.directors.length ? (
        <div>
          {title.type === 'movie' ? 'De' : 'Créée par'} {d.directors.join(', ')}
        </div>
      ) : null}
      {d?.cast.length ? <div>Avec {d.cast.join(', ')}</div> : null}
    </div>
  );
}

/** Logos des plateformes d'abonnement où le titre est disponible en France. */
export function ProviderLine({ title, maxAge }: { title: Title; maxAge?: number }) {
  const d = useDetails(title, maxAge);
  if (!d) return null;
  const mine = new Set(getMyProviders());
  const { flatrate, rent, buy } = d.providers;
  if (!flatrate.length) {
    return rent.length || buy.length ? <div className="providers muted small">💰 Location / achat</div> : null;
  }
  return (
    <div className="providers">
      {flatrate.slice(0, 5).map((p) => (
        <img key={p.id} className={`provider-logo ${mine.has(p.id) ? 'mine' : ''}`} src={providerLogo(p.logo) ?? ''} alt={p.name} title={p.name} />
      ))}
    </div>
  );
}

/**
 * Ligne de liste : toucher l'affiche ou le titre affiche le résumé,
 * un appui long ouvre la fiche complète.
 */
export function TitleRow({
  title,
  prefix,
  below,
  showType = false,
  children,
}: {
  title: Title;
  prefix?: ReactNode;
  below?: ReactNode;
  showType?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);
  const longPress = useLongPress(() => openFiche(title));
  return (
    <li className="list-item">
      {prefix}
      <div
        className="row-main"
        role="button"
        tabIndex={0}
        {...longPress}
        onClick={toggle}
        onKeyDown={(e) => e.key === 'Enter' && toggle()}
        title="Toucher : résumé · Appui long : fiche complète"
      >
        <Poster title={title} size="w92" className="thumb" />
        <div className="row-text">
          <TitleText title={title} showType={showType} />
          {below}
        </div>
      </div>
      {children && <div className="item-actions">{children}</div>}
      {open && (
        <div className="row-overview">
          <p>{title.overview || 'Pas de résumé disponible.'}</p>
          <button className="btn small" onClick={() => openFiche(title)} title="Ouvrir la fiche complète">
            📄 Fiche complète
          </button>
        </div>
      )}
    </li>
  );
}

/** Options : [valeur, libellé, tooltip]. */
export function TypeFilter<T extends string>({ value, options, onChange }: { value: T; options: [T, string, string][]; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map(([v, label, tooltip]) => (
        <button key={v} className={`chip ${v === value ? 'active' : ''}`} onClick={() => onChange(v)} title={tooltip}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Rechercher un titre…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className="input" type="search" placeholder={`🔍 ${placeholder}`} value={value} onChange={(e) => onChange(e.target.value)} />;
}

/** Fenêtre modale qui monte du bas de l'écran. */
export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <button className="sheet-close icon-btn" onClick={onClose} aria-label="Fermer" title="Fermer">
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
