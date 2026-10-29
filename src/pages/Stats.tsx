import { useEffect, useState } from 'react';
import { getMeta } from '../lib/db';
import { CATEGORY_LABEL, categoryOptions, useCategories, type Category } from '../lib/category';
import { computeStats, formatHours, TOP_SIZE, type Bar, type Stats } from '../lib/stats';
import { BADGES } from '../lib/badges';
import { prefetchDetails } from '../lib/tmdb';
import { TopBar, TypeFilter } from '../components/common';

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<Category>('movie');
  const categories = useCategories();
  const [completing, setCompleting] = useState(0);

  const refresh = async () => {
    const [s, ids] = await Promise.all([computeStats(), getMeta<string[]>('badges', [])]);
    setStats(s);
    setUnlocked(new Set(ids));
    return s;
  };

  // Complète en arrière-plan les fiches manquantes (durée, réalisateur…), puis recalcule.
  useEffect(() => {
    let alive = true;
    refresh().then(async (s) => {
      if (!alive || !s.missingDetails.length) return;
      setCompleting(s.missingDetails.length);
      await prefetchDetails(s.missingDetails);
      if (alive) {
        setCompleting(0);
        refresh();
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!stats) {
    return (
      <main className="page">
        <TopBar title="📊 Stats" />
        <p className="muted center">Calcul en cours…</p>
      </main>
    );
  }

  const t = stats[category];
  const all = [stats.movie, stats.tv, stats.anime];
  const minutes = all.reduce((s, x) => s + x.minutes, 0);
  const seenTotal = all.reduce((s, x) => s + x.seen, 0);
  const coverage = seenTotal ? Math.round((all.reduce((s, x) => s + x.withDetails, 0) / seenTotal) * 100) : 100;

  return (
    <main className="page">
      <TopBar title="📊 Stats" />

      <div className="stat-tiles">
        <StatTile emoji="🎬" value={stats.movie.seen} label="films vus" />
        <StatTile emoji="📺" value={stats.tv.seen} label="séries vues" />
        {categories.includes('anime') && <StatTile emoji="🎌" value={stats.anime.seen} label="animes vus" />}
        <StatTile emoji="💖" value={stats.wish} label="en wishlist" />
        <StatTile emoji="⏱️" value={formatHours(minutes)} label={`devant l’écran${coverage < 100 ? ` (sur ${coverage} % des titres)` : ''}`} />
      </div>
      {completing > 0 && <p className="muted small center">⏳ Complément des infos de {completing} titres…</p>}

      <section className="card">
        <h3>📅 Activité (30 derniers jours)</h3>
        <ActivityChart days={stats.last30} />
        <div className="row stat-row">
          <span title="Jours d’affilée avec au moins un tri">🔥 Série : <b>{stats.streak}</b> j</span>
          <span title="Plus longue série de jours d’affilée">🏅 Record : <b>{stats.bestStreak}</b> j</span>
          <span title="Plus grand nombre de tris en une journée">⚡ Meilleur jour : <b>{stats.bestDay}</b></span>
        </div>
      </section>

      <TypeFilter<Category>
        value={category}
        options={categoryOptions(categories, (c) => `Statistiques des ${CATEGORY_LABEL[c].plural} ${CATEGORY_LABEL[c].seen}`)}
        onChange={setCategory}
      />

      <section className="card">
        <h3>⭐ Les {TOP_SIZE[category]} {CATEGORY_LABEL[category].plural} les plus populaires</h3>
        <div className="big-progress" title={`${t.top.seen} / ${t.top.total}`}>
          <span style={{ width: `${t.top.total ? (t.top.seen / t.top.total) * 100 : 0}%` }} />
        </div>
        <p className="small">
          <b>{t.top.total ? Math.round((t.top.seen / t.top.total) * 100) : 0} %</b> vus ({t.top.seen} sur {t.top.total})
        </p>
      </section>

      <BarCard title="🕰️ Par décennie" bars={t.decades} empty="Pas encore de titre vu." />
      <BarCard title="🎭 Genres favoris" bars={t.genres} empty="Pas encore assez de données." />
      <BarCard
        title={category === 'movie' ? '🎬 Réalisateurs les plus vus' : '✍️ Créateurs les plus vus'}
        bars={t.people}
        empty="Il faut au moins 2 titres vus du même auteur."
      />
      <BarCard title="🌟 Acteurs les plus vus" bars={t.actors} empty="Il faut au moins 2 titres vus avec le même acteur." />

      <section className="card">
        <h3>
          🏅 Badges ({BADGES.filter((b) => unlocked.has(b.id)).length}/{BADGES.length})
        </h3>
        <div className="badge-grid">
          {BADGES.map((b) => {
            const v = Math.min(b.value(stats), b.target);
            const done = unlocked.has(b.id) || v >= b.target;
            return (
              <div key={b.id} className={`badge-card ${done ? 'done' : ''}`} title={`${b.name} : ${b.desc}`}>
                <span className="badge-emoji">{b.emoji}</span>
                <span className="badge-name">{b.name}</span>
                <span className="badge-desc">{b.desc}</span>
                {!done && (
                  <span className="mini-progress">
                    <span style={{ width: `${(v / b.target) * 100}%` }} />
                  </span>
                )}
                {!done && b.target > 1 && (
                  <span className="badge-desc">
                    {v}/{b.target}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {stats.sagas.length > 0 && (
        <section className="card">
          <h3>🧩 Sagas complètes ({stats.sagas.length})</h3>
          <div className="chips">
            {stats.sagas.map((s) => (
              <span key={s} className="badge saga">
                {s}
              </span>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function StatTile({ emoji, value, label }: { emoji: string; value: number | string; label: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-emoji">{emoji}</span>
      <span className="stat-value">{typeof value === 'number' ? value.toLocaleString('fr-FR') : value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

/** Barres horizontales d'une seule couleur, valeur écrite au bout de chaque barre. */
function BarCard({ title, bars, empty }: { title: string; bars: Bar[]; empty: string }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <section className="card">
      <h3>{title}</h3>
      {!bars.length ? (
        <p className="muted small">{empty}</p>
      ) : (
        <div className="hbars">
          {bars.map((b) => (
            <div key={b.label} className="hbar" title={`${b.label} : ${b.count}`}>
              <span className="hbar-label">{b.label}</span>
              <span className="hbar-track">
                <span className="hbar-fill" style={{ width: `${(b.count / max) * 100}%` }} />
              </span>
              <span className="hbar-value">{b.count}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ActivityChart({ days }: { days: { date: Date; count: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return (
    <div className="activity-chart">
      <div className="columns">
        {days.map((d) => (
          <span key={d.date.toDateString()} className="column" title={`${fmt(d.date)} : ${d.count} tri${d.count > 1 ? 's' : ''}`}>
            <span className="column-fill" style={{ height: `${(d.count / max) * 100}%` }} />
          </span>
        ))}
      </div>
      <div className="columns-axis muted tiny">
        <span>{fmt(days[0].date)}</span>
        <span>max {max}</span>
        <span>aujourd’hui</span>
      </div>
    </div>
  );
}
