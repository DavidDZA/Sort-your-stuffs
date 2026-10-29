import { useEffect, useState } from 'react';
import { useCloud } from '../lib/cloud';
import { cloudEnabled } from '../lib/supabase';
import {
  addFriend,
  findByCode,
  inviteLink,
  listFriends,
  loadMyProfile,
  newFriendCode,
  removeFriend,
  setSharing,
  type Friend,
  type MyProfile,
} from '../lib/friends';
import { toast } from '../lib/fun';
import { TopBar } from '../components/common';
import { Account } from './settings/Account';

/** Amis : mon code et mon lien d'invitation, ajout par code, liste, ce que je partage. `invite` : code reçu par lien. */
export default function Friends({ invite }: { invite?: string }) {
  const cloud = useCloud();
  return (
    <main className="page">
      <TopBar title="👥 Amis" />
      {!cloudEnabled ? (
        <p className="muted center">Les comptes ne sont pas disponibles sur cette version du site.</p>
      ) : !cloud.ready ? (
        <p className="muted center">Chargement…</p>
      ) : !cloud.user ? (
        <>
          <p className="small center">
            {invite ? 'Connecte-toi ou crée un compte pour accepter l’invitation.' : 'Connecte-toi pour ajouter des amis et comparer vos goûts.'}
          </p>
          <Account />
        </>
      ) : (
        <FriendsHome invite={invite?.toUpperCase()} />
      )}
    </main>
  );
}

function FriendsHome({ invite }: { invite?: string }) {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      const [p, f] = await Promise.all([loadMyProfile(), listFriends()]);
      setProfile(p);
      setFriends(f);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    reload();
  }, []);

  const add = async (c: string) => {
    setMsg(null);
    try {
      const pseudo = await addFriend(c);
      toast(`👥 ${pseudo} fait partie de tes amis !`);
      setCode('');
      if (invite) location.hash = '#/friends';
      await reload();
    } catch (e) {
      setMsg(`✕ ${(e as Error).message}`);
    }
  };

  const share = async () => {
    if (!profile) return;
    const url = inviteLink(profile.friendCode);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Sort my stuffs', text: 'Ajoute-moi sur Sort my stuffs pour comparer nos films et séries !', url });
      } catch {
        // Partage annulé.
      }
      return;
    }
    copy();
  };

  const copy = async () => {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(inviteLink(profile.friendCode));
      toast('🔗 Lien d’invitation copié');
    } catch {
      toast(`Ton lien : ${inviteLink(profile.friendCode)}`);
    }
  };

  const regenerate = async () => {
    if (!confirm('Créer un nouveau code ami ? L’ancien code et l’ancien lien ne marcheront plus (tes amis actuels restent tes amis).')) return;
    try {
      const friendCode = await newFriendCode();
      setProfile((p) => p && { ...p, friendCode });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggle = async (patch: { shareWishlist?: boolean; shareRanking?: boolean }) => {
    if (!profile) return;
    setProfile({ ...profile, ...patch });
    try {
      await setSharing(patch);
    } catch (e) {
      setError((e as Error).message);
      await reload();
    }
  };

  const remove = async (f: Friend) => {
    if (!confirm(`Retirer ${f.pseudo} de tes amis ? Vous ne verrez plus les données l’un de l’autre.`)) return;
    try {
      await removeFriend(f.id);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const alreadyFriend = !!invite && !!friends?.some((f) => f.code === invite);

  return (
    <>
      {error && <p className="small error">✕ {error}</p>}
      {invite && profile && <Invitation code={invite} own={profile.friendCode === invite} onAdd={() => add(invite)} done={alreadyFriend} />}

      <section className="card">
        <h3>🔗 Inviter un ami</h3>
        <p className="muted small">Envoie ce lien (ou ton code) à un ami : en l’ouvrant, il t’ajoute à ses amis.</p>
        {profile ? (
          <>
            <p className="friend-code" title="Ton code ami">
              {profile.friendCode}
            </p>
            <div className="row center">
              {'share' in navigator && (
                <button className="btn primary" onClick={share} title="Envoyer ton lien d’invitation (SMS, WhatsApp, e-mail…)">
                  📤 Partager le lien
                </button>
              )}
              <button className={`btn ${'share' in navigator ? '' : 'primary'}`} onClick={copy} title="Copier ton lien d’invitation">
                🔗 Copier le lien
              </button>
              <button className="btn small" onClick={regenerate} title="Créer un nouveau code si l’ancien a circulé trop loin">
                Nouveau code
              </button>
            </div>
          </>
        ) : (
          <p className="muted small">…</p>
        )}
      </section>

      <section className="card">
        <h3>➕ Ajouter avec un code</h3>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            add(code);
          }}
        >
          <input
            className="input code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 8))}
            placeholder="Code ami"
            autoCapitalize="characters"
            autoComplete="off"
          />
          <button className="btn primary" type="submit" disabled={code.length !== 8}>
            Ajouter
          </button>
        </form>
        {msg && <p className="small">{msg}</p>}
      </section>

      <section className="card">
        <h3>👥 Mes amis{friends?.length ? ` (${friends.length})` : ''}</h3>
        {!friends ? (
          <p className="muted small">…</p>
        ) : !friends.length ? (
          <p className="muted small">Pas encore d’amis : envoie ton lien d’invitation !</p>
        ) : (
          <ul className="friend-list">
            {friends.map((f) => (
              <li key={f.id} className="friend-item">
                <div className="friend-name">
                  <strong>{f.pseudo}</strong>
                  <span className="muted tiny">{sharedLabel(f)}</span>
                </div>
                <a className="btn small primary" href={`#/duo/${f.id}`} title={`Comparer vos wishlists et vos classements avec ${f.pseudo}`}>
                  À deux →
                </a>
                <button className="btn small" onClick={() => remove(f)} title={`Retirer ${f.pseudo} de tes amis`} aria-label={`Retirer ${f.pseudo}`}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h3>👀 Ce que voient mes amis</h3>
        <p className="muted small">En lecture seule. Tes « pas vu / pas envie » restent privés.</p>
        {profile && (
          <div className="chips">
            <button className={`chip ${profile.shareWishlist ? 'active' : ''}`} onClick={() => toggle({ shareWishlist: !profile.shareWishlist })} title="Ta wishlist et son ordre de priorité : pour la wishlist commune et « Ce soir à deux »">
              💖 Ma wishlist
            </button>
            <button className={`chip ${profile.shareRanking ? 'active' : ''}`} onClick={() => toggle({ shareRanking: !profile.shareRanking })} title="Tes titres vus, tes avis et ton classement : pour les conseils et la compatibilité">
              🏆 Mes titres vus et mon classement
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function sharedLabel(f: Friend): string {
  const parts = [f.shareWishlist && 'wishlist', f.shareRanking && 'titres vus et classement'].filter(Boolean);
  return parts.length ? `Partage : ${parts.join(', ')}` : 'Ne partage rien pour l’instant';
}

function Invitation({ code, own, onAdd, done }: { code: string; own: boolean; onAdd: () => void; done: boolean }) {
  const [pseudo, setPseudo] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (own) return;
    findByCode(code)
      .then(setPseudo)
      .catch(() => setPseudo(null));
  }, [code, own]);

  return (
    <section className="card invitation">
      <h3>✉️ Invitation</h3>
      {own ? (
        <p className="small">C’est ton propre lien d’invitation : envoie-le à un ami pour qu’il t’ajoute.</p>
      ) : pseudo === undefined ? (
        <p className="muted small">…</p>
      ) : pseudo === null ? (
        <p className="small">Ce lien d’invitation ne marche plus (code inconnu ou remplacé).</p>
      ) : done ? (
        <p className="small">✓ {pseudo} fait déjà partie de tes amis.</p>
      ) : (
        <>
          <p className="small">
            <strong>{pseudo}</strong> t’invite à comparer vos films et séries : wishlist commune, conseils, compatibilité de vos classements.
          </p>
          <button className="btn primary" onClick={onAdd}>
            👥 Ajouter {pseudo} à mes amis
          </button>
        </>
      )}
    </section>
  );
}
