import { useEffect, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, TYPE_LABEL, type Title } from '../db';
import { ensureCredits, posterUrl } from '../tmdb';

export function TopBar({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <header className="topbar">
      <a className="icon-btn" href="#/" aria-label="Retour" title="Retour à l’accueil">
        ‹
      </a>
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

/** Réalisateur (ou créateur) et 2 acteurs principaux, chargés depuis TMDB au premier affichage. */
function CreditsLines({ title }: { title: Title }) {
  const stored = useLiveQuery(() => db.titles.get(title.key).then((t) => t?.credits ?? null), [title.key]);
  useEffect(() => {
    ensureCredits(title);
  }, [title.key]);

  const c = stored ?? title.credits;
  return (
    <div className="title-credits">
      {c?.directors.length ? (
        <div>
          {title.type === 'movie' ? 'De' : 'Créée par'} {c.directors.join(', ')}
        </div>
      ) : null}
      {c?.cast.length ? <div>Avec {c.cast.join(', ')}</div> : null}
    </div>
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
