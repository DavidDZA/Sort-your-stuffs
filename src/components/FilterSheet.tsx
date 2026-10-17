import { useState } from 'react';
import type { MediaType } from '../lib/db';
import { genreOptions, LANGS, NO_THEME, PERIODS, type Theme } from '../lib/themes';
import { readPref, writePref } from '../lib/settings';
import { Sheet } from './common';

/**
 * Fenêtre des filtres (swipe, classement, wishlist) : note minimum, période, genre, langue.
 * Le nombre de titres concernés se met à jour en direct ; les boutons restent visibles en bas.
 */
export function FilterSheet(props: {
  /** null : films et séries mélangés (pas de filtre par genre, les genres diffèrent). */
  type: MediaType | null;
  initial: Theme;
  count: (t: Theme) => number;
  /** Texte du bouton d'application, avec le nombre de titres (« C'est parti (1 234) »). */
  applyLabel: (n: number) => string;
  /** Le catalogue a-t-il les genres, langues et notes (sinon : mise à jour à faire) ? */
  hasCatalogueData: boolean;
  /** Titres dont les infos (genre, langue, note) sont en cours de récupération. */
  pendingInfo?: number;
  onApply: (t: Theme) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Theme>({ ...props.initial, genre: props.type ? props.initial.genre : null });
  const n = props.count(draft);

  return (
    <Sheet onClose={props.onClose} label="Filtres">
      <h2 className="sheet-title">
        <FilterIcon /> Filtres
      </h2>
      {props.pendingInfo ? (
        <p className="banner-soft small">
          ⏳ Récupération des genres, langues et notes de {props.pendingInfo.toLocaleString('fr-FR')} titres… les résultats se complètent.
        </p>
      ) : (
        !props.hasCatalogueData && <p className="banner-soft small">Mets à jour le catalogue (Réglages) pour filtrer par genre, langue et note.</p>
      )}

      <h3 className="sheet-label">
        Note TMDB minimum : <b className="rating-value">{draft.minRating > 0 ? `⭐ ${draft.minRating.toLocaleString('fr-FR')}` : 'toutes'}</b>
      </h3>
      <input
        className="rating-slider"
        type="range"
        min={0}
        max={10}
        step={0.5}
        value={draft.minRating}
        onChange={(e) => setDraft({ ...draft, minRating: Number(e.target.value) })}
        aria-label="Note TMDB minimum"
      />
      <div className="rating-scale muted tiny">
        <span>0</span>
        <span>5</span>
        <span>10</span>
      </div>

      <h3 className="sheet-label">Période</h3>
      <div className="chips">
        {PERIODS.map((p) => (
          <button key={p.id} className={`chip ${draft.period === p.id ? 'active' : ''}`} onClick={() => setDraft({ ...draft, period: p.id })}>
            {p.label}
          </button>
        ))}
      </div>

      <h3 className="sheet-label">Genre</h3>
      {props.type ? (
        <div className="chips">
          <button className={`chip ${draft.genre === null ? 'active' : ''}`} onClick={() => setDraft({ ...draft, genre: null })}>
            Tous
          </button>
          {genreOptions(props.type).map((g) => (
            <button key={g.id} className={`chip ${draft.genre === g.id ? 'active' : ''}`} onClick={() => setDraft({ ...draft, genre: g.id })}>
              {g.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted small">Choisis Films ou Séries pour filtrer par genre.</p>
      )}

      <h3 className="sheet-label">Langue originale</h3>
      <div className="chips">
        {LANGS.map((l) => (
          <button key={l.id} className={`chip ${draft.lang === l.id ? 'active' : ''}`} onClick={() => setDraft({ ...draft, lang: l.id })}>
            {l.label}
          </button>
        ))}
      </div>

      <div className="row center sheet-actions">
        <button className="btn" onClick={() => setDraft(NO_THEME)} title="Retirer tous les filtres">
          Réinitialiser
        </button>
        <button className="btn primary" onClick={() => props.onApply(draft)} disabled={n === 0} title="Appliquer ces filtres">
          {props.applyLabel(n)}
        </button>
      </div>
    </Sheet>
  );
}

/** Entonnoir de filtre (dessiné, comme dans un tableur). */
export function FilterIcon() {
  return (
    <svg className="icon-svg filter-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" />
    </svg>
  );
}

/** Bouton rond d'ouverture des filtres, en couleur quand un filtre est actif. */
export function FilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`icon-btn filter-btn ${active ? 'active' : ''}`} onClick={onClick} aria-label="Filtres" title={`Filtres : ${label}`}>
      <FilterIcon />
    </button>
  );
}

/** Bandeau du filtre actif, sous la barre du haut ; le toucher rouvre les filtres. */
export function FilterStrip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="theme-strip" onClick={onClick} title="Changer les filtres">
      <FilterIcon /> {label}
    </button>
  );
}

/** Filtre d'un écran, retenu d'une visite à l'autre (préférence locale). */
export function useSavedFilter(key: string): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => readPref(key, NO_THEME));
  const save = (t: Theme) => {
    writePref(key, t);
    setTheme(t);
  };
  return [theme, save];
}
