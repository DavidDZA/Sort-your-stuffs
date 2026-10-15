import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, TYPE_LABEL, type Provider, type Status, type Title } from '../lib/db';
import { changeStatus } from '../lib/ranking';
import { providerLogo, WEEK } from '../lib/tmdb';
import { groupProviders, isMineGroup, loadMyProviders } from '../lib/providers';
import { Poster, Sheet, useDetails } from './common';

/** Ouvre la fiche complète d'un titre (voir <FicheHost /> dans App). */
export function openFiche(title: Title): void {
  dispatchEvent(new CustomEvent('open-fiche', { detail: title }));
}

/** Affiche la fiche demandée ; le bouton Retour du téléphone la referme. */
export function FicheHost() {
  const [title, setTitle] = useState<Title | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setTitle((e as CustomEvent<Title>).detail);
      history.pushState({ fiche: true }, '');
    };
    const onPop = () => setTitle(null);
    addEventListener('open-fiche', onOpen);
    addEventListener('popstate', onPop);
    return () => {
      removeEventListener('open-fiche', onOpen);
      removeEventListener('popstate', onPop);
    };
  }, []);

  if (!title) return null;
  return <Fiche key={title.key} title={title} onClose={() => history.back()} />;
}

const STATUS_LABEL: Record<Status, string> = { seen: '✓ Vu', wish: '💖 Wishlist', unseen: '🙈 Pas vu' };

function Fiche({ title, onClose }: { title: Title; onClose: () => void }) {
  const d = useDetails(title, WEEK);
  const answer = useLiveQuery(() => db.answers.get(title.key), [title.key]);
  const status = answer?.status;

  const facts = [
    TYPE_LABEL[title.type],
    title.year,
    title.type === 'movie' && d?.runtime ? `${Math.floor(d.runtime / 60)} h ${String(d.runtime % 60).padStart(2, '0')}` : null,
    title.type === 'tv' && d?.seasons ? `${d.seasons} saison${d.seasons > 1 ? 's' : ''}` : null,
    title.type === 'tv' && d?.episodes ? `${d.episodes} épisodes` : null,
    d?.rating ? `⭐ ${d.rating.toLocaleString('fr-FR')}/10` : null,
  ].filter(Boolean);

  return (
    <Sheet onClose={onClose} label={`Fiche de ${title.title}`}>
      <div className="fiche-head">
        <Poster title={title} size="w342" className="fiche-poster" />
        <div className="fiche-info">
          <h2 className="fiche-title">{title.title}</h2>
          {title.originalTitle && title.originalTitle !== title.title && <div className="title-original">{title.originalTitle}</div>}
          <div className="fiche-facts">{facts.join(' · ')}</div>
          {d && d.genres.length > 0 && (
            <div className="fiche-genres">
              {d.genres.map((g) => (
                <span key={g} className="badge">
                  {g}
                </span>
              ))}
            </div>
          )}
          {status && <div className={`fiche-status status-${status}`}>{STATUS_LABEL[status]}</div>}
        </div>
      </div>

      {d && (d.directors.length > 0 || d.cast.length > 0) && (
        <div className="fiche-credits">
          {d.directors.length > 0 && (
            <div>
              <span className="muted">{title.type === 'movie' ? 'Réalisation' : 'Création'} :</span> {d.directors.join(', ')}
            </div>
          )}
          {d.cast.length > 0 && (
            <div>
              <span className="muted">Avec :</span> {d.cast.join(', ')}
            </div>
          )}
          {d.collection && (
            <div>
              <span className="muted">Saga :</span> {d.collection.name}
            </div>
          )}
        </div>
      )}

      <p className="fiche-overview">{title.overview || 'Pas de résumé disponible.'}</p>

      {d?.trailer && (
        <a className="btn primary trailer" href={`https://www.youtube.com/watch?v=${d.trailer}`} target="_blank" rel="noreferrer" title="Ouvrir la bande-annonce sur YouTube">
          ▶ Bande-annonce
        </a>
      )}

      <section className="fiche-section">
        <h3>📺 Où regarder</h3>
        {!d ? (
          <p className="muted small">Chargement…</p>
        ) : (
          <>
            <ProviderGroup label="Abonnement" list={d.providers.flatrate} />
            <ProviderGroup label="Location" list={d.providers.rent} />
            <ProviderGroup label="Achat" list={d.providers.buy} />
            {!d.providers.flatrate.length && !d.providers.rent.length && !d.providers.buy.length && (
              <p className="muted small">Pas disponible en France pour l’instant.</p>
            )}
            {d.providers.link && (
              <a className="small link" href={d.providers.link} target="_blank" rel="noreferrer" title="Voir toutes les offres sur TMDB">
                Voir toutes les offres →
              </a>
            )}
            <p className="muted tiny">Disponibilités : JustWatch</p>
          </>
        )}
      </section>

      <div className="row center fiche-actions">
        {(['seen', 'wish', 'unseen'] as const).map((s) => (
          <button
            key={s}
            className={`btn ${status === s ? 'primary' : ''}`}
            onClick={() => changeStatus(title, s)}
            disabled={status === s}
            title={s === 'seen' ? 'Marquer comme vu' : s === 'wish' ? 'Ajouter à la wishlist' : 'Marquer comme pas vu'}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function ProviderGroup({ label, list }: { label: string; list: Provider[] }) {
  if (!list.length) return null;
  const mine = loadMyProviders();
  return (
    <div className="provider-group">
      <span className="muted small">{label}</span>
      <div className="providers">
        {groupProviders(list).map((g) => (
          <img
            key={g.key}
            className={`provider-logo big ${isMineGroup(g, mine) ? 'mine' : ''}`}
            src={providerLogo(g.logo) ?? ''}
            alt={g.label}
            title={g.names.join(' · ')}
          />
        ))}
      </div>
    </div>
  );
}
