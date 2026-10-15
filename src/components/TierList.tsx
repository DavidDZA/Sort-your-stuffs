import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type MediaType, type Title } from '../db';
import { readRanking } from '../ranking';
import { tierize } from '../tiers';
import { shareTierList } from '../share';
import { toast } from '../fun';
import { useLongPress } from '../hooks';
import { Poster } from './common';
import { openFiche } from './Fiche';

/** Classement en paliers S → D, d'après la position de chaque titre. */
export function TierList({ type }: { type: MediaType }) {
  const [sharing, setSharing] = useState(false);
  const tiers = useLiveQuery(async () => {
    const keys = await readRanking({ type, list: 'seen' });
    const titles = (await db.titles.bulkGet(keys)).filter((t): t is Title => !!t);
    return tierize(titles);
  }, [type]);

  if (!tiers) return <p className="muted center">Chargement…</p>;
  const count = tiers.reduce((s, t) => s + t.items.length, 0);
  if (!count) return <p className="muted center">Classe quelques titres pour voir ta tier list.</p>;

  const share = async () => {
    setSharing(true);
    try {
      await shareTierList(type, tiers);
    } catch (e) {
      toast(`✕ ${(e as Error).message}`);
    } finally {
      setSharing(false);
    }
  };

  return (
    <>
      <button className="btn primary" onClick={share} disabled={sharing} title="Créer une image de ta tier list à partager">
        {sharing ? 'Création de l’image…' : '📤 Partager ma tier list'}
      </button>
      <div className="tier-list">
        {tiers.map((tier) => (
          <div key={tier.label} className="tier-row">
            <span className="tier-label" style={{ background: tier.color }}>
              {tier.label}
            </span>
            <div className="tier-items">
              {tier.items.length ? tier.items.map((t) => <TierPoster key={t.key} title={t} />) : <span className="muted tiny">—</span>}
            </div>
          </div>
        ))}
      </div>
      <p className="muted tiny center">S : top 10 % · A : 20 % · B : 30 % · C : 25 % · D : 15 % — appui long sur une affiche pour sa fiche</p>
    </>
  );
}

function TierPoster({ title }: { title: Title }) {
  const longPress = useLongPress(() => openFiche(title));
  return (
    <div className="tier-poster" {...longPress} onClick={() => openFiche(title)} title={`${title.title}${title.year ? ` (${title.year})` : ''}`}>
      <Poster title={title} size="w185" />
    </div>
  );
}
