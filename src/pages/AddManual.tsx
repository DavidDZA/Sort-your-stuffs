import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Answer, type Status, type Title } from '../lib/db';
import { changeStatus } from '../lib/ranking';
import { search } from '../lib/tmdb';
import { SeenButtons, TitleRow, TopBar } from '../components/common';

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
    return new Map(answers.filter((a): a is Answer => !!a).map((a) => [a.key, a]));
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
          <TitleRow key={t.key} title={t} showType>
            <SeenButtons title={t} current={statuses?.get(t.key)} />
            <StatusButton title={t} status="wish" current={statuses?.get(t.key)?.status} label="♥" tip="Ajouter à la wishlist" />
          </TitleRow>
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
