import { useEffect, useState, type FormEvent } from 'react';
import {
  cancelRecovery,
  deleteAccount,
  sendPasswordReset,
  signIn,
  signInWithGoogle,
  signOut,
  signUp,
  syncNow,
  updatePassword,
  updatePseudo,
  useCloud,
  type CloudState,
} from '../../lib/cloud';
import { cloudEnabled } from '../../lib/supabase';

/** Réglages → Compte : connexion (e-mail, Google), synchro, déconnexion, suppression. */
export function Account() {
  const cloud = useCloud();
  if (!cloudEnabled) return null;
  return (
    <section className="card">
      <h3>☁️ Compte</h3>
      {!cloud.ready ? (
        <p className="muted small">…</p>
      ) : cloud.user && cloud.recovery ? (
        <NewPassword />
      ) : cloud.user ? (
        <SignedIn cloud={cloud} />
      ) : (
        <SignedOut />
      )}
    </section>
  );
}

type Mode = 'signin' | 'signup' | 'reset';

function SignedOut() {
  const [mode, setMode] = useState<Mode>('signin');
  const [pseudo, setPseudo] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async (action: () => Promise<string | null | void>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg((await action()) ?? null);
    } catch (e) {
      setMsg(`✕ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'signin') run(() => signIn(email, password));
    else if (mode === 'signup')
      run(async () => ((await signUp(email, password, pseudo)) ? null : '✓ Compte créé : confirme ton adresse avec le lien reçu par e-mail, puis connecte-toi.'));
    else
      run(async () => {
        await sendPasswordReset(email);
        return '✓ Si un compte existe avec cette adresse, un e-mail pour choisir un nouveau mot de passe vient d’être envoyé.';
      });
  };

  const switchTo = (m: Mode) => {
    setMode(m);
    setMsg(null);
  };

  return (
    <>
      <p className="muted small">
        Optionnel : retrouve tes titres, ta wishlist et tes classements sur tous tes appareils (PC, téléphone), sans
        sauvegarde à faire. Ce que tu as déjà trié sur cet appareil est ajouté au compte.
      </p>
      <button className="btn provider" onClick={() => run(signInWithGoogle)} disabled={busy} title="Se connecter ou créer un compte avec Google">
        <GoogleLogo /> Continuer avec Google
      </button>
      <p className="auth-divider muted small">ou avec ton e-mail</p>
      <form className="auth-form" onSubmit={submit}>
        {mode === 'signup' && (
          <input className="input" value={pseudo} onChange={(e) => setPseudo(e.target.value)} placeholder="Pseudo" maxLength={40} required autoComplete="nickname" />
        )}
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" required autoComplete="email" />
        {mode !== 'reset' && (
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? 'Mot de passe (6 caractères min.)' : 'Mot de passe'}
            minLength={mode === 'signup' ? 6 : undefined}
            required
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
        )}
        <button className="btn primary" type="submit" disabled={busy}>
          {mode === 'signin' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : 'Recevoir le lien'}
        </button>
      </form>
      {msg && <p className="small">{msg}</p>}
      <p className="small auth-links">
        {mode === 'signin' ? (
          <>
            <button className="link" onClick={() => switchTo('signup')}>
              Créer un compte
            </button>
            <button className="link" onClick={() => switchTo('reset')}>
              Mot de passe oublié ?
            </button>
          </>
        ) : (
          <button className="link" onClick={() => switchTo('signin')}>
            ← J’ai déjà un compte
          </button>
        )}
      </p>
    </>
  );
}

const PROVIDER_LABEL: Record<string, string> = { google: 'Google', email: 'e-mail' };

function SignedIn({ cloud }: { cloud: CloudState }) {
  const [pseudo, setPseudo] = useState(cloud.pseudo ?? '');
  const [pseudoMsg, setPseudoMsg] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, tick] = useState(0);

  useEffect(() => setPseudo(cloud.pseudo ?? ''), [cloud.pseudo]);
  // Rafraîchit « il y a 2 min ».
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const savePseudo = async () => {
    try {
      await updatePseudo(pseudo);
      setPseudoMsg('✓ Pseudo enregistré.');
    } catch (e) {
      setPseudoMsg(`✕ ${(e as Error).message}`);
    }
  };

  const leave = async (erase: boolean) => {
    try {
      await signOut(erase);
    } catch (e) {
      setMsg(`✕ ${(e as Error).message}`);
    }
  };

  const remove = async () => {
    if (
      !confirm(
        'Supprimer ton compte ? Ton profil, tes réponses et tes classements seront définitivement effacés du serveur.\n\nLes données de cet appareil sont gardées (tu pourras les effacer dans la zone dangereuse).',
      )
    )
      return;
    try {
      await deleteAccount();
    } catch (e) {
      setMsg(`✕ ${(e as Error).message}`);
    }
  };

  const via = cloud.user!.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(', ');

  return (
    <>
      <p className="small">
        Connecté{cloud.pseudo ? <> en tant que <strong>{cloud.pseudo}</strong></> : ''}
        {cloud.user!.email && <span className="muted"> · {cloud.user!.email}</span>}
        {via && <span className="muted"> · via {via}</span>}
      </p>
      <p className="small">
        {cloud.syncing ? '🔄 Synchronisation…' : cloud.error ? `✕ ${cloud.error}` : cloud.lastSync ? `✓ À jour · ${ago(cloud.lastSync)}` : '🔄 En attente de synchronisation…'}
      </p>
      <div className="row">
        <a className="btn small primary" href="#/friends" title="Ajouter des amis, comparer vos wishlists et vos classements">
          👥 Mes amis
        </a>
        <button className="btn small" onClick={syncNow} disabled={cloud.syncing} title="Envoyer et recevoir les dernières modifications maintenant">
          Synchroniser maintenant
        </button>
      </div>

      <label className="field">
        Pseudo
        <div className="row">
          <input className="input" value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={40} autoComplete="nickname" />
          {pseudo.trim() && pseudo.trim() !== cloud.pseudo && (
            <button className="btn small" onClick={savePseudo} title="Enregistrer le nouveau pseudo">
              Enregistrer
            </button>
          )}
        </div>
      </label>
      {pseudoMsg && <p className="small">{pseudoMsg}</p>}

      {leaving ? (
        <div className="auth-leave">
          <p className="small">Garder tes données sur cet appareil ? Elles restent de toute façon sur ton compte.</p>
          <div className="row">
            <button className="btn small" onClick={() => leave(false)} title="Se déconnecter en gardant les données sur cet appareil">
              Les garder
            </button>
            <button className="btn small" onClick={() => leave(true)} title="Se déconnecter et effacer les données de cet appareil">
              Les effacer de cet appareil
            </button>
            <button className="btn small" onClick={() => setLeaving(false)}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button className="btn" onClick={() => setLeaving(true)} title="Se déconnecter de ce compte sur cet appareil">
            Se déconnecter
          </button>
          <button className="btn small link-danger" onClick={remove} title="Supprimer définitivement ton compte et ses données du serveur">
            Supprimer mon compte
          </button>
        </div>
      )}
      {msg && <p className="small">{msg}</p>}
    </>
  );
}

function NewPassword() {
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await updatePassword(password);
    } catch (err) {
      setMsg(`✕ ${(err as Error).message}`);
    }
  };
  return (
    <form className="auth-form" onSubmit={submit}>
      <p className="small">Choisis ton nouveau mot de passe.</p>
      <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nouveau mot de passe (6 caractères min.)" minLength={6} required autoComplete="new-password" />
      <div className="row">
        <button className="btn primary" type="submit">
          Enregistrer
        </button>
        <button className="btn" type="button" onClick={cancelRecovery}>
          Plus tard
        </button>
      </div>
      {msg && <p className="small">{msg}</p>}
    </form>
  );
}

function ago(t: number): string {
  const min = Math.floor((Date.now() - t) / 60_000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  return `il y a ${Math.floor(min / 60)} h`;
}

function GoogleLogo() {
  return (
    <svg className="provider-logo" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}
