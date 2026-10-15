import { useState } from 'react';
import type { MediaType } from '../../lib/db';
import { genreOptions, LANGS, NO_THEME, PERIODS, type Theme } from '../../lib/themes';
import { Sheet } from '../../components/common';

/** Choix du thème d'une session de swipe : période, genre, langue (avec le nombre de titres concernés). */
export function ThemeSheet(props: {
  type: MediaType;
  initial: Theme;
  count: (t: Theme) => number;
  hasGenres: boolean;
  onApply: (t: Theme) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(props.initial);
  const n = props.count(draft);
  return (
    <Sheet onClose={props.onClose} label="Thème de la session">
      <h2 className="sheet-title">🎯 Thème de la session</h2>
      {!props.hasGenres && <p className="banner-soft small">Mets à jour le catalogue (Réglages) pour activer les filtres par genre et par langue.</p>}

      <h3 className="sheet-label">Période</h3>
      <div className="chips">
        {PERIODS.map((p) => (
          <button key={p.id} className={`chip ${draft.period === p.id ? 'active' : ''}`} onClick={() => setDraft({ ...draft, period: p.id })}>
            {p.label}
          </button>
        ))}
      </div>

      <h3 className="sheet-label">Genre</h3>
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

      <h3 className="sheet-label">Langue originale</h3>
      <div className="chips">
        {LANGS.map((l) => (
          <button key={l.id} className={`chip ${draft.lang === l.id ? 'active' : ''}`} onClick={() => setDraft({ ...draft, lang: l.id })}>
            {l.label}
          </button>
        ))}
      </div>

      <div className="row center sheet-actions">
        <button className="btn" onClick={() => setDraft(NO_THEME)} title="Revenir à tout le catalogue">
          Réinitialiser
        </button>
        <button className="btn primary" onClick={() => props.onApply(draft)} disabled={n === 0} title="Lancer la session avec ce thème">
          C’est parti ({n.toLocaleString('fr-FR')})
        </button>
      </div>
    </Sheet>
  );
}
