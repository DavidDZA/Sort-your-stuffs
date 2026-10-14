import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Status, type Title } from '../db';
import { changeStatus } from '../ranking';
import { search } from '../tmdb';
import { Poster, TitleText, TopBar } from '../components/common';

export default function AddManual() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Title[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const found = await search(q);
        if (!cancelled) setResults(found);
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
  }, [query]);

  const statuses = useLiveQuery(async () => {
    const answers = await db.answers.bulkGet(results.map((r) => r.key));
    return new Map(answers.filter((a) => !!a).map((a) => [a!.key, a!.status]));
  }, [results]);

  return (
    <main className="page">
      <TopBar title="🔍 Ajout manuel" />
      <input
        className="input"
        type="search"
        placeholder="Titre d’un film ou d’une série…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {loading && <p className="muted center">Recherche…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && query.trim().length >= 2 && !results.length && !error && <p className="muted center">Aucun résultat.</p>}
      <ul className="list">
        {results.map((t) => (
          <li key={t.key} className="list-item">
            <Poster title={t} size="w92" className="thumb" />
            <TitleText title={t} showType />
            <div className="item-actions">
              <StatusButton title={t} status="seen" current={statuses?.get(t.key)} label="Vu" tip="Ajouter aux titres vus" />
              <StatusButton title={t} status="wish" current={statuses?.get(t.key)} label="♥" tip="Ajouter à la wishlist" />
            </div>
          </li>
        ))}
      </ul>
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
