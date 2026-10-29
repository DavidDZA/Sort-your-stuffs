import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { db, withDetails, type Title } from '../lib/db';
import { CATEGORY_LABEL, categoryOf, categoryOptions, useCategories, type Category } from '../lib/category';
import { changeStatus } from '../lib/ranking';
import { useCloud } from '../lib/cloud';
import { listFriends, loadFriendData, loadMySide, type Friend, type FriendData } from '../lib/friends';
import { advice, commonWishlist, compatibility, type Advice, type Side } from '../lib/together';
import { pickWeighted } from '../lib/tonight';
import { availableOnMine, hasMyProviders, loadMyProviders } from '../lib/providers';
import { prefetchDetails, WEEK } from '../lib/tmdb';
import { burst, toast } from '../lib/fun';
import { matchesSearch } from '../lib/hooks';
import { Poster, ProviderLine, RatingBadge, SearchBox, TitleRow, TitleText, TopBar, TypeFilter } from '../components/common';
import { openFiche } from '../components/Fiche';

type Tab = 'top' | 'wish' | 'tonight' | 'advice' | 'match';

interface Loaded {
  friend: Friend;
  me: Side;
  them: FriendData;
  titles: Map<string, Title>;
  /** Catégorie d'une clé, d'après les titres connus. */
  catOf: (key: string) => Category | undefined;
}

/** « À deux » avec un ami : wishlist commune, tirage du soir, conseils croisés, compatibilité des classements. */
export default function Duo({ friendId }: { friendId: string }) {
  const cloud = useCloud();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<Category>('movie');
  const categories = useCategories();
  const [tab, setTab] = useState<Tab>('top');

  const load = async (fresh = false) => {
    try {
      const [friends, them, me] = await Promise.all([listFriends(), loadFriendData(friendId, fresh), loadMySide()]);
      const friend = friends.find((f) => f.id === friendId);
      if (!friend) throw new Error('Cette personne ne fait pas (ou plus) partie de tes amis.');
      // Mes titres locaux (avec fiches) d'abord, sinon les copies jointes aux réponses de l'ami.
      const keys = [...new Set([...them.answers.keys(), ...me.answers.keys()])];
      const titles = new Map(them.titles);
      (await withDetails((await db.titles.bulkGet(keys)).filter((t): t is Title => !!t))).forEach((t) => titles.set(t.key, t));
      const catOf = (key: string) => {
        const t = titles.get(key);
        return t && categoryOf(t);
      };
      setData({ friend, me, them, titles, catOf });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (cloud.user) load();
  }, [cloud.user?.id, friendId]);

  /** Après un ajout à ma wishlist : relire mon côté. */
  const refreshMe = async () => {
    const me = await loadMySide();
    setData((d) => d && { ...d, me });
  };

  const pseudo = data?.friend.pseudo ?? '…';

  return (
    <main className="page">
      <TopBar title={`👥 Toi & ${pseudo}`} />
      {!cloud.ready ? (
        <p className="muted center">Chargement…</p>
      ) : !cloud.user ? (
        <p className="center">
          <a className="btn primary" href="#/friends">
            Se connecter
          </a>
        </p>
      ) : error ? (
        <div className="empty">
          <p>✕ {error}</p>
          <a className="btn" href="#/friends">
            ← Mes amis
          </a>
        </div>
      ) : !data ? (
        <p className="muted center">Chargement des données de ton ami…</p>
      ) : (
        <>
          <TypeFilter<Tab>
            value={tab}
            options={[
              ['top', '🏆 Son top', 'Tout son classement, et ce qu’il ou elle a vu sans le classer'],
              ['wish', '💖 En commun', 'Les titres que vous voulez voir tous les deux'],
              ['tonight', '🍿 Ce soir', 'Tirer au sort un titre de votre wishlist commune'],
              ['advice', '💡 Conseils', 'Ce que l’autre a aimé et que vous n’avez pas vu'],
              ['match', '🎯 Compatibilité', 'Vos classements se ressemblent-ils ?'],
            ]}
            onChange={setTab}
          />
          <TypeFilter<Category>
            value={type}
            options={categoryOptions(categories, (c) => `Les ${CATEGORY_LABEL[c].plural}`)}
            onChange={setType}
          />
          {tab === 'top' && <FriendTop key={type} data={data} type={type} onWish={refreshMe} />}
          {tab === 'wish' && <CommonWishlist data={data} type={type} />}
          {tab === 'tonight' && <TonightDuo key={type} data={data} type={type} />}
          {tab === 'advice' && <AdviceLists data={data} type={type} onWish={refreshMe} />}
          {tab === 'match' && <MatchView data={data} type={type} />}
          <p className="muted tiny center">
            <button className="link" onClick={() => load(true)} title="Recharger les dernières données de ton ami">
              Actualiser
            </button>
          </p>
        </>
      )}
    </main>
  );
}

const nth = (n: number | undefined) => (n ? `n°${n}` : 'non priorisé');

function NeedsSharing({ pseudo, what }: { pseudo: string; what: string }) {
  return <p className="muted center small">{pseudo} ne partage pas {what}. Il ou elle peut l’activer dans sa page Amis.</p>;
}

const MEDALS = ['🥇', '🥈', '🥉'];
const PAGE = 100;

/** Où j'en suis avec un titre de l'ami : classé, vu, dans ma wishlist, pas envie. */
function myStatus(me: Side, key: string, type: Category): string | null {
  const a = me.answers.get(key);
  if (!a) return null;
  if (a.status === 'wish') return 'Toi : 💖 dans ta wishlist';
  if (a.status === 'unseen') return 'Toi : pas envie';
  const i = (me.rankings[type] ?? []).indexOf(key);
  return `Toi : ${i === -1 ? 'vu' : `n°${i + 1}`}${a.tier === 'good' ? ' 👍' : a.tier === 'meh' ? ' 😐' : ''}`;
}

/** Tout le classement de l'ami, puis ses titres vus pas encore classés ; ma situation sur chacun. */
function FriendTop({ data, type, onWish }: { data: Loaded; type: Category; onWish: () => void }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const pseudo = data.friend.pseudo;
  const ranking = data.them.rankings[type] ?? [];
  const ranked = new Set(ranking);
  const unranked = [...data.them.answers]
    .filter(([key, a]) => a.status === 'seen' && data.catOf(key) === type && !ranked.has(key))
    .map(([key]) => data.titles.get(key))
    .filter((t): t is Title => !!t)
    .sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  if (!data.friend.shareRanking) return <NeedsSharing pseudo={pseudo} what="son classement" />;

  const rows = ranking
    .map((key, i) => ({ t: data.titles.get(key), rank: i + 1 }))
    .filter((x): x is { t: Title; rank: number } => !!x.t && matchesSearch(x.t, query));
  const others = unranked.filter((t) => matchesSearch(t, query));
  if (!ranking.length && !unranked.length) {
    return <p className="muted center">Rien de vu chez {pseudo} dans les {CATEGORY_LABEL[type].plural} pour l’instant.</p>;
  }

  const addToWishlist = async (t: Title) => {
    await changeStatus(t, 'wish');
    toast(`💖 « ${t.title} » ajouté à ta wishlist`);
    onWish();
  };
  const row = (t: Title, prefix?: ReactNode) => {
    const tier = data.them.answers.get(t.key)?.tier;
    const mine = myStatus(data.me, t.key, type);
    return (
      <TitleRow
        key={t.key}
        title={t}
        prefix={prefix}
        below={
          <span className="muted tiny">
            {[tier === 'good' && `👍 bien pour ${pseudo}`, tier === 'meh' && `😐 bof pour ${pseudo}`, mine].filter(Boolean).join(' · ')}
          </span>
        }
      >
        {!mine && (
          <button className="btn small" onClick={() => addToWishlist(t)} title="Ajouter à ta wishlist" aria-label="Ajouter à ta wishlist">
            💖
          </button>
        )}
      </TitleRow>
    );
  };

  return (
    <>
      {ranking.length + unranked.length > 8 && <SearchBox value={query} onChange={setQuery} />}
      <p className="muted small center">
        {ranking.length} classé{ranking.length > 1 ? 's' : ''}
        {unranked.length > 0 && ` · ${unranked.length} vu${unranked.length > 1 ? 's' : ''} sans classement`}
      </p>
      {!rows.length && !others.length && <p className="muted center">Aucun titre ne correspond.</p>}
      <ol className="list">
        {rows.slice(0, limit).map(({ t, rank }) => row(t, <span className={`rank-num ${rank <= 3 ? 'medal' : ''}`}>{rank <= 3 ? MEDALS[rank - 1] : rank}</span>))}
      </ol>
      {rows.length > limit && (
        <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>
          Afficher plus ({(rows.length - limit).toLocaleString('fr-FR')} restants)
        </button>
      )}
      {others.length > 0 && rows.length <= limit && (
        <>
          <h3 className="section-title">Vus, pas encore classés ({others.length})</h3>
          <ul className="list">{others.map((t) => row(t))}</ul>
        </>
      )}
    </>
  );
}

function CommonWishlist({ data, type }: { data: Loaded; type: Category }) {
  const list = useMemo(() => commonWishlist(data.me, data.them, type, data.catOf), [data, type]);
  const pseudo = data.friend.pseudo;
  if (!data.friend.shareWishlist) return <NeedsSharing pseudo={pseudo} what="sa wishlist" />;
  if (!list.length) return <p className="muted center">Aucun{type === 'tv' ? 'e' : ''} {CATEGORY_LABEL[type].one} dans vos deux wishlists pour l’instant.</p>;
  return (
    <>
      <p className="muted small center">
        {list.length} titre{list.length > 1 ? 's' : ''} que vous voulez voir tous les deux, par priorités combinées.
      </p>
      <ul className="list">
        {list.map((w) => {
          const t = data.titles.get(w.key);
          return (
            t && (
              <TitleRow
                key={w.key}
                title={t}
                below={
                  <>
                    <span className="muted tiny">
                      Toi : {nth(w.mine)} · {pseudo} : {nth(w.theirs)}
                    </span>
                    <ProviderLine title={t} maxAge={WEEK} />
                  </>
                }
              />
            )
          );
        })}
      </ul>
    </>
  );
}

function TonightDuo({ data, type }: { data: Loaded; type: Category }) {
  const [mineOnly, setMineOnly] = useState(false);
  const [picked, setPicked] = useState<Title | null>(null);
  const mine = loadMyProviders();
  const list = useMemo(() => commonWishlist(data.me, data.them, type, data.catOf), [data, type]);
  const titles = list.map((w) => data.titles.get(w.key)).filter((t): t is Title => !!t);

  // Plateformes à jour pour le filtre « sur mes abonnements ».
  useEffect(() => {
    prefetchDetails(titles, WEEK);
  }, [list.length]);

  if (!data.friend.shareWishlist) return <NeedsSharing pseudo={data.friend.pseudo} what="sa wishlist" />;
  if (!list.length) return <p className="muted center">Pas encore de titre dans vos deux wishlists : rien à tirer au sort.</p>;

  const candidates = list.filter((w) => {
    const t = data.titles.get(w.key);
    return t && (!mineOnly || (t.details && availableOnMine(t.details.providers.flatrate, mine)));
  });

  const roll = async () => {
    const choice = pickWeighted(candidates.filter((w) => w.key !== picked?.key).map((w) => ({ item: w.key, w: w.weight })));
    const t = choice ? data.titles.get(choice) : undefined;
    if (!t) return;
    // Fiche à jour (résumé, plateformes) pour le titre tiré.
    const stored = await db.titles.get(t.key);
    setPicked((await withDetails([stored ?? t]))[0]);
    burst(['🍿', '🎬', '✨'], undefined, 16);
  };

  return (
    <>
      {hasMyProviders(mine) && (
        <div className="chips">
          <button className={`chip ${mineOnly ? 'active' : ''}`} onClick={() => setMineOnly(!mineOnly)} title="Seulement ce qui est dispo sur tes abonnements">
            📺 Sur mes abonnements
          </button>
        </div>
      )}
      <button className="btn primary roll-btn" onClick={roll} disabled={!candidates.length} title="Tirer au sort un titre de votre wishlist commune">
        {picked ? '🎲 Un autre !' : '🎲 Tirer au sort'}
      </button>
      <p className="muted small center">
        {candidates.length
          ? `${candidates.length} titre${candidates.length > 1 ? 's' : ''} possible${candidates.length > 1 ? 's' : ''} · vos priorités à tous les deux ont plus de chances`
          : 'Aucun titre commun dispo sur tes abonnements.'}
      </p>
      {picked && (
        <div className="tonight-card revealed">
          <div className="tonight-poster">
            <Poster title={picked} size="w342" />
            <RatingBadge title={picked} className="corner-left" />
          </div>
          <div className="tonight-info">
            <TitleText title={picked} credits />
            <ProviderLine title={picked} maxAge={WEEK} />
            <p className="tonight-overview">{picked.overview || 'Pas de résumé disponible.'}</p>
            <div className="row">
              <button className="btn small" onClick={() => openFiche(picked)} title="Durée, note, bande-annonce, où regarder…">
                📄 Fiche
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AdviceLists({ data, type, onWish }: { data: Loaded; type: Category; onWish: () => void }) {
  const pseudo = data.friend.pseudo;
  const forMe = useMemo(() => advice(data.them, data.me, type, data.catOf), [data, type]);
  const forThem = useMemo(() => advice(data.me, data.them, type, data.catOf), [data, type]);
  if (!data.friend.shareRanking) return <NeedsSharing pseudo={pseudo} what="ses titres vus" />;

  const addToWishlist = async (t: Title) => {
    await changeStatus(t, 'wish');
    toast(`💖 « ${t.title} » ajouté à ta wishlist`);
    onWish();
  };

  const rows = (list: Advice[], who: string, action?: (t: Title, a: Advice) => ReactNode) => (
    <ul className="list">
      {list.map((a) => {
        const t = data.titles.get(a.key);
        return (
          t && (
            <TitleRow
              key={a.key}
              title={t}
              below={
                <span className="muted tiny">
                  {[a.good && '👍 bien', a.rank && `n°${a.rank} pour ${who}`].filter(Boolean).join(' · ')}
                </span>
              }
            >
              {action?.(t, a)}
            </TitleRow>
          )
        );
      })}
    </ul>
  );

  return (
    <>
      <section className="duo-section">
        <h3>💡 {pseudo} te conseille</h3>
        {forMe.length ? (
          rows(forMe, pseudo, (t, a) =>
            a.inWishlist ? (
              <span className="muted tiny">Dans ta wishlist</span>
            ) : (
              <button className="btn small" onClick={() => addToWishlist(t)} title="Ajouter à ta wishlist" aria-label="Ajouter à ta wishlist">
                💖
              </button>
            ),
          )
        ) : (
          <p className="muted small">Rien de nouveau : tu as déjà vu tout ce que {pseudo} a aimé.</p>
        )}
      </section>
      <section className="duo-section">
        <h3>🎁 À conseiller à {pseudo}</h3>
        {forThem.length ? (
          rows(forThem, 'toi', (_t, a) => a.inWishlist && <span className="muted tiny">Déjà dans sa wishlist</span>)
        ) : (
          <p className="muted small">{pseudo} a déjà vu tout ce que tu as aimé.</p>
        )}
      </section>
    </>
  );
}

function verdict(p: number): string {
  if (p >= 80) return 'Âmes sœurs cinéphiles 💞';
  if (p >= 65) return 'Goûts très proches';
  if (p >= 55) return 'Pas mal de points communs';
  if (p >= 45) return 'Goûts indépendants';
  return 'Goûts opposés : de beaux débats en perspective !';
}

function MatchView({ data, type }: { data: Loaded; type: Category }) {
  const pseudo = data.friend.pseudo;
  const match = useMemo(() => compatibility(data.me, data.them, type), [data, type]);
  if (!data.friend.shareRanking) return <NeedsSharing pseudo={pseudo} what="son classement" />;
  if (!match) {
    return (
      <p className="muted center">
        Pas assez de {CATEGORY_LABEL[type].plural} classé{type === 'tv' ? 'e' : ''}s par vous deux (il en faut au moins 5 en commun). Continuez les duels !
      </p>
    );
  }
  const list = (items: typeof match.agree) => (
    <ul className="list">
      {items.map((x) => {
        const t = data.titles.get(x.key);
        return t && <TitleRow key={x.key} title={t} below={<span className="muted tiny">Toi : n°{x.mine} · {pseudo} : n°{x.theirs}</span>} />;
      })}
    </ul>
  );
  return (
    <>
      <section className="card duo-match">
        <p className="duo-percent">{match.percent} %</p>
        <p>{verdict(match.percent)}</p>
        <p className="muted small">
          Sur {match.common} {CATEGORY_LABEL[type].plural} classé{type === 'tv' ? 'e' : ''}s par vous deux.
        </p>
      </section>
      {match.agree.length > 0 && (
        <section className="duo-section">
          <h3>🤝 Vous êtes d’accord</h3>
          {list(match.agree)}
        </section>
      )}
      {match.disagree.length > 0 && (
        <section className="duo-section">
          <h3>⚔️ Vos plus gros désaccords</h3>
          {list(match.disagree)}
        </section>
      )}
    </>
  );
}
