import { useState } from 'react';
import { getSwipeMode, setSwipeMode, type SwipeMode } from '../../lib/settings';

/** Choix du mode de swipe, avec un petit schéma de chaque geste. */
export function SwipeModeSetting() {
  const [mode, setMode] = useState<SwipeMode>(getSwipeMode());
  const choose = (m: SwipeMode) => {
    setMode(m);
    setSwipeMode(m);
  };
  return (
    <section className="card">
      <h3>🕹️ Mode de swipe</h3>
      <div className="mode-options">
        <button className={`mode-option ${mode === 'corners' ? 'active' : ''}`} onClick={() => choose('corners')} title="Un seul geste en diagonale, avec un avis bien / bof sur les titres vus">
          <span className="mode-name">4 coins <span className="muted tiny">(par défaut)</span></span>
          <span className="mode-diagram four">
            <span className="tone-wish">↖ Envie</span>
            <span className="tone-yes">Vu 👍 ↗</span>
            <span className="tone-no">↙ Pas envie</span>
            <span className="tone-meh">Vu 😐 ↘</span>
          </span>
          <span className="muted tiny">Un seul geste · 👍/😐 réduit les duels</span>
        </button>
        <button className={`mode-option ${mode === 'horizontal' ? 'active' : ''}`} onClick={() => choose('horizontal')} title="Vu / pas vu, puis une 2e question : aimé ou bof, ou envie de le voir">
          <span className="mode-name">2 directions</span>
          <span className="mode-diagram two">
            <span className="tone-no">← Pas vu</span>
            <span className="tone-yes">Vu →</span>
          </span>
          <span className="muted tiny">2e swipe : aimé / bof si vu, envie / pas envie sinon</span>
        </button>
      </div>
    </section>
  );
}
