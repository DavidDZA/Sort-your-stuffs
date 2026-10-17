import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Answer, type Status, type Title } from '../lib/db';
import { changeStatus } from '../lib/ranking';
import { KNOWN_VOTES, personFilmography, search, searchPeople, type Person, type PersonRole } from '../lib/tmdb';
import { PersonAvatar, SeenButtons, TitleRow, TopBar, TypeFilter } from '../components/common';

type Mode = 'title' | PersonRole;

const PLACEHOLDER: Record<Mode, string> = {
  title: 'Titre d’un film ou d’une série…',
  director: 'Nom d’un réalisateur ou d’une réalisatrice…',
  actor: 'Nom d’un acteur ou d’une actrice…',
};

/** Métier principal d'une personne selon TMDB. */
const DEPARTMENTS: Record<string, string> = {
  Directing: '🎥 Réalisation',
  Acting: '🎭 Interprétation',
  Writing: '✍️ Scénario',
  Production: '🎬 Production',
  Camera: '📷 Image',
  Editing: '✂️ Montage',
  Sound: '🎵 Musique / son',
  Art: '🎨 Décors',
  'Costume & Make-Up': '👗 Costumes',
  'Visual Effects': '✨ Effets visuels',
  Crew: 'Équipe',
  Lighting: '💡 Lumière',
};

/** Ajout manuel : par titre, ou par réalisateur / acteur (on choisit la personne, puis sa filmographie). */
export default function AddManual() {
  const [mode, setMode] = useState<Mode>('title');
  const [query, setQuery] = useState('');
  const [titles, setTitles] = useState<Title[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [person, setPerson] = useState<Person | null>(null);
  const [works, setWorks] = useState<Title[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recherche (titres ou personnes) pendant la saisie.
  useEffect(() => {
    const q = query.trim();
    setPerson(null);
    if (q.length < 2) {
      setTitles([]);
      setPeople([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        if (mode === 'title') {
          const found = await search(q);
          if (!cancelled) setTitles(found);
        } else {
          const found = await searchPeople(q, mode);
          if (!cancelled) setPeople(found);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, mode]);

  // Filmographie de la personne choisie.
  useEffect(() => {
    if (!person || mode === 'title') return;
    let cancelled = false;
    setWorks(null);
    personFilmography(person.id, mode)
      .then((list) => !cancelled && setWorks(list))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [person, mode]);

  const shown = person ? (works ?? []) : titles;
  const shownKeys = shown.map((r) => r.key).join('|');
  const statuses = useLiveQuery(async () => {
    const answers = await db.answers.bulkGet(shownKeys ? shownKeys.split('|') : []);
    return new Map(answers.filter((a): a is Answer => !!a).map((a) => [a.key, a]));
  }, [shownKeys]);

  const row = (t: Title) => (
    <TitleRow key={t.key} title={t} showType>
      <SeenButtons title={t} current={statuses?.get(t.key)} />
      <StatusButton title={t} status="wish" current={statuses?.get(t.key)?.status} label="♥" tip="Ajouter à la wishlist" />
    </TitleRow>
  );

  const known = (works ?? []).filter((t) => t.voteCount >= KNOWN_VOTES);
  const lesser = (works ?? []).filter((t) => t.voteCount < KNOWN_VOTES);
  const seenCount = (works ?? []).filter((t) => statuses?.get(t.key)?.status === 'seen').length;

  return (
    <main className="page">
      <TopBar title="🔍 Ajout manuel" />
      <TypeFilter<Mode>
        value={mode}
        options={[
          ['title', 'Titre', 'Chercher un film ou une série par son titre'],
          ['director', 'Réalisateur', 'Chercher un réalisateur et voir les films qu’il a réalisés'],
          ['actor', 'Acteur', 'Chercher un acteur et voir les films et séries où il a joué'],
        ]}
        onChange={(m) => {
          setMode(m);
          setPerson(null);
        }}
      />
      <input className="input" type="search" placeholder={PLACEHOLDER[mode]} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      {loading && <p className="muted center">Recherche…</p>}
      {error && <p className="error">{error}</p>}

      {mode === 'title' ? (
        <>
          {!loading && query.trim().length >= 2 && !titles.length && !error && <p className="muted center">Aucun résultat.</p>}
          <ul className="list">{titles.map(row)}</ul>
        </>
      ) : person ? (
        <>
          <div className="person-head">
            <button className="btn small" onClick={() => setPerson(null)} title="Revenir aux résultats de la recherche">
              ‹ Résultats
            </button>
            <PersonAvatar person={person} />
            <div className="person-name">
              <b>{person.name}</b>
              <span className="muted small">
                {works === null
                  ? 'Chargement…'
                  : `${works.length} ${mode === 'director' ? 'réalisé(s)' : 'rôle(s)'} · ${seenCount} vu${seenCount > 1 ? 's' : ''}`}
              </span>
            </div>
          </div>
          {works !== null && !works.length && <p className="muted center">Aucun film ni série retenu pour cette personne.</p>}
          <ul className="list">{known.map(row)}</ul>
          {lesser.length > 0 && (
            <details className="lesser">
              <summary title="Titres avec peu de votes sur TMDB (souvent des courts métrages)">Moins connus ({lesser.length})</summary>
              <ul className="list">{lesser.map(row)}</ul>
            </details>
          )}
        </>
      ) : (
        <>
          {!loading && query.trim().length >= 2 && !people.length && !error && <p className="muted center">Aucune personne trouvée.</p>}
          <ul className="list">
            {people.map((p) => (
              <li key={p.id} className="list-item person-row" role="button" tabIndex={0} onClick={() => setPerson(p)} title={`Voir la filmographie de ${p.name}`}>
                <PersonAvatar person={p} />
                <div className="row-text">
                  <div className="title-main">{p.name}</div>
                  <div className="title-meta">
                    {DEPARTMENTS[p.department] ?? p.department}
                    {p.knownFor.length > 0 && ` · ${p.knownFor.join(', ')}`}
                  </div>
                </div>
                <span className="person-arrow">›</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}


function StatusButton({ title, status, current, label, tip }: { title: Title; status: Status; current?: Status; label: string; tip: string }) {
  const active = current === status;
  return (
    <button
      className={`btn small ${active ? 'primary' : ''}`}
      onClick={() => changeStatus(title, status)}
      disabled={active}
      title={active ? (status === 'seen' ? 'Déjà dans les titres vus' : 'Déjà dans la wishlist') : tip}
    >
      {active && status === 'seen' ? '✓ Vu' : label}
    </button>
  );
}
