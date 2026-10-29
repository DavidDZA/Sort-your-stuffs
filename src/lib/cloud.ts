import { useSyncExternalStore } from 'react';
import Dexie from 'dexie';
import type { Session } from '@supabase/supabase-js';
import { clearChoices, db, isUserMeta, type MediaType, type Status, type Tier, type Title } from './db';
import { hashOf, plan, type Row } from './cloudMerge';
import { supabase } from './supabase';
import { toast } from './fun';

/*
 * Compte et synchro. L'appli lit et écrit toujours dans la base locale (rapide, hors ligne) ;
 * ce module envoie les modifications au compte et reçoit celles des autres appareils, en arrière-plan.
 */

type Table = 'answers' | 'user_meta';
const PREFIX: Record<Table, string> = { answers: 'a:', user_meta: 'm:' };

/** Accès au compte (Supabase), remplaçable dans les tests. */
export interface Remote {
  /** Lignes modifiées depuis le curseur, et le nouveau curseur. */
  pull(table: Table, since: string | null): Promise<{ rows: Row[]; cursor: string | null }>;
  push(table: Table, rows: Row[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Synchro (indépendante de Supabase)
// ---------------------------------------------------------------------------

interface AnswerData {
  status: Status;
  tier: Tier | null;
}

const readState = async (id: string) => (await db.synced.get(`state:${id}`))?.hash ?? null;
const writeState = (id: string, value: string) => db.synced.put({ id: `state:${id}`, hash: value });

/** État actuel de l'appareil pour une table. */
async function localRows(table: Table): Promise<Map<string, Row>> {
  const rows = new Map<string, Row>();
  if (table === 'answers') {
    for (const a of await db.answers.toArray()) {
      const data: AnswerData = { status: a.status, tier: a.tier ?? null };
      rows.set(`a:${a.key}`, { id: `a:${a.key}`, data, at: a.updatedAt });
    }
  } else {
    for (const m of await db.meta.toArray()) {
      if (isUserMeta(m.key) && m.value !== undefined) rows.set(`m:${m.key}`, { id: `m:${m.key}`, data: m.value, at: m.updatedAt ?? 0 });
    }
  }
  return rows;
}

/** Copie du titre jointe à une réponse envoyée (sans la fiche détaillée, rechargée à la demande). */
function titleCopy(t: Title | undefined): Title | undefined {
  if (!t) return undefined;
  const { details: _details, ...copy } = t;
  return copy;
}

/**
 * Écrit les lignes reçues, sauf celles modifiées sur l'appareil pendant la synchro (comparées à `seen`,
 * l'état lu au départ) : elles seront envoyées à la prochaine synchro. Renvoie les lignes écrites.
 */
async function applyRows(table: Table, rows: Row[], seen: Map<string, Row>): Promise<Set<string>> {
  const applied = new Set<string>();
  if (!rows.length) return applied;
  const keys = rows.map((r) => r.id.slice(2));
  await db.transaction('rw', db.titles, db.answers, db.meta, async () => {
    if (table === 'answers') {
      const [current, titles] = await Promise.all([db.answers.bulkGet(keys), db.titles.bulkGet(keys)]);
      const puts = [];
      const dels = [];
      const newTitles: Title[] = [];
      for (const [i, r] of rows.entries()) {
        const cur = current[i];
        if (hashOf(cur && { status: cur.status, tier: cur.tier ?? null }) !== hashOf(seen.get(r.id)?.data)) continue;
        applied.add(r.id);
        if (r.data === undefined) {
          dels.push(keys[i]);
          continue;
        }
        const { status, tier } = r.data as AnswerData;
        puts.push({ key: keys[i], type: keys[i].split(':')[0] as MediaType, status, ...(tier ? { tier } : {}), updatedAt: r.at });
        if (!titles[i] && r.title) newTitles.push(r.title as Title);
      }
      await db.titles.bulkPut(newTitles);
      await db.answers.bulkPut(puts);
      await db.answers.bulkDelete(dels);
    } else {
      const current = await db.meta.bulkGet(keys);
      for (const [i, r] of rows.entries()) {
        if (hashOf(current[i]?.value) !== hashOf(seen.get(r.id)?.data)) continue;
        applied.add(r.id);
        if (r.data === undefined) await db.meta.delete(keys[i]);
        else await db.meta.put({ key: keys[i], value: r.data, updatedAt: r.at });
      }
    }
  });
  return applied;
}

/** Une synchro complète avec le compte `userId` : réception, fusion, envoi. */
export async function syncWith(remote: Remote, userId: string): Promise<void> {
  // Autre compte que la dernière fois sur cet appareil : on repart de zéro (fusion complète).
  if ((await readState('user')) !== userId) {
    await db.synced.clear();
    await writeState('user', userId);
  }
  for (const table of ['answers', 'user_meta'] as const) {
    const prefix = PREFIX[table];
    const { rows, cursor } = await remote.pull(table, await readState(`cursor:${table}`));
    const local = await localRows(table);
    const shadow = new Map((await db.synced.where('id').startsWith(prefix).toArray()).map((s) => [s.id, s.hash]));
    const p = plan(local, shadow, rows, Date.now());

    const applied = await applyRows(table, p.apply, local);
    const skipped = new Set(p.apply.filter((r) => !applied.has(r.id)).map((r) => r.id));
    const shadowUpdates = [...p.shadow].filter(([id]) => !skipped.has(id));
    await db.synced.bulkPut(shadowUpdates.filter(([, h]) => h !== null).map(([id, hash]) => ({ id, hash: hash! })));
    await db.synced.bulkDelete(shadowUpdates.filter(([, h]) => h === null).map(([id]) => id));

    if (p.push.length) {
      let push = p.push;
      if (table === 'answers') {
        const titles = await db.titles.bulkGet(push.map((r) => r.id.slice(2)));
        push = push.map((r, i) => (r.data === undefined ? r : { ...r, title: titleCopy(titles[i]) }));
      }
      await remote.push(table, push);
      await db.synced.bulkPut(push.filter((r) => r.data !== undefined).map((r) => ({ id: r.id, hash: hashOf(r.data)! })));
      await db.synced.bulkDelete(push.filter((r) => r.data === undefined).map((r) => r.id));
    }
    if (cursor) await writeState(`cursor:${table}`, cursor);
  }
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

const PAGE = 1000;
/** Relecture des dernières secondes : une écriture validée en retard ne passe pas entre deux synchros. */
const OVERLAP_MS = 60_000;

function supabaseRemote(userId: string): Remote {
  const sb = supabase!;
  return {
    async pull(table, since) {
      const columns = table === 'answers' ? 'key, status, tier, title, deleted, client_updated_at, updated_at' : 'key, value, deleted, client_updated_at, updated_at';
      const from = since && !Number.isNaN(Date.parse(since)) ? new Date(Date.parse(since) - OVERLAP_MS).toISOString() : null;
      const rows: Row[] = [];
      let cursor = since;
      for (let offset = 0; ; offset += PAGE) {
        // Filtre indispensable : les règles d'accès laissent aussi lire ce que les amis partagent.
        let q = sb.from(table).select(columns).eq('user_id', userId).order('updated_at').order('key');
        if (from) q = q.gt('updated_at', from);
        const { data, error } = await q.range(offset, offset + PAGE - 1);
        if (error) throw error;
        for (const r of data as unknown as Record<string, unknown>[]) {
          const deleted = r.deleted as boolean;
          const value = table === 'answers' ? { status: r.status, tier: r.tier ?? null } : r.value;
          rows.push({ id: PREFIX[table] + r.key, data: deleted ? undefined : value, at: Date.parse(r.client_updated_at as string), title: r.title ?? undefined });
          cursor = r.updated_at as string;
        }
        if (data.length < PAGE) break;
      }
      return { rows, cursor };
    },
    async push(table, rows) {
      const payload = rows.map((r) => {
        const key = r.id.slice(2);
        const base = { user_id: userId, key, deleted: r.data === undefined, client_updated_at: new Date(r.at).toISOString() };
        if (table === 'user_meta') return { ...base, value: r.data ?? null };
        const d = r.data as AnswerData | undefined;
        return { ...base, type: key.split(':')[0], status: d?.status ?? null, tier: d?.tier ?? null, title: r.title ?? null };
      });
      for (let i = 0; i < payload.length; i += 500) {
        const { error } = await sb.from(table).upsert(payload.slice(i, i + 500), { onConflict: 'user_id,key' });
        if (error) throw error;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// État du compte, pour l'interface
// ---------------------------------------------------------------------------

export interface CloudState {
  ready: boolean; // session lue au démarrage
  user: { id: string; email: string | null; providers: string[] } | null;
  pseudo: string | null;
  syncing: boolean;
  lastSync: number | null;
  error: string | null;
  /** Arrivée par le lien « mot de passe oublié » : choisir un nouveau mot de passe. */
  recovery: boolean;
}

let state: CloudState = { ready: !supabase, user: null, pseudo: null, syncing: false, lastSync: null, error: null, recovery: false };
const listeners = new Set<() => void>();

function setState(patch: Partial<CloudState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useCloud(): CloudState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Messages d'erreur de Supabase, en français. */
export function frError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  const known: [RegExp, string][] = [
    [/invalid login credentials/i, 'E-mail ou mot de passe incorrect.'],
    [/already registered|already exists/i, 'Un compte existe déjà avec cet e-mail.'],
    [/password should be at least (\d+)/i, 'Le mot de passe doit faire au moins 6 caractères.'],
    [/email not confirmed/i, 'Confirme d’abord ton adresse e-mail (lien reçu par e-mail).'],
    [/unable to validate email|invalid email|email address .* is invalid/i, 'Adresse e-mail invalide.'],
    [/rate limit|too many requests/i, 'Trop de tentatives : réessaie dans quelques minutes.'],
    [/failed to fetch|network/i, 'Pas de connexion au serveur.'],
    [/same password|different from the old/i, 'Choisis un mot de passe différent de l’ancien.'],
    [/unknown_code/, 'Code ami inconnu : vérifie les 8 caractères.'],
    [/own_code/, 'C’est ton propre code ami !'],
  ];
  return known.find(([re]) => re.test(msg))?.[1] ?? msg;
}

// ---------------------------------------------------------------------------
// Planification des synchros
// ---------------------------------------------------------------------------

let timer: ReturnType<typeof setTimeout> | undefined;
let timerDue = Infinity;
let running = false;
let again = false;

/** Synchro dans `delay` ms (une synchro déjà prévue plus tôt n'est pas repoussée). */
function schedule(delay: number) {
  if (!state.user) return;
  const due = Date.now() + delay;
  if (timer && due >= timerDue) return;
  clearTimeout(timer);
  timerDue = due;
  timer = setTimeout(() => {
    timer = undefined;
    timerDue = Infinity;
    runSync();
  }, delay);
}

async function runSync(): Promise<void> {
  const user = state.user;
  if (!user || !supabase) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  setState({ syncing: true });
  try {
    await syncWith(supabaseRemote(user.id), user.id);
    setState({ lastSync: Date.now(), error: null });
  } catch (e) {
    setState({ error: frError(e) });
  } finally {
    running = false;
    setState({ syncing: false });
    if (again) {
      again = false;
      schedule(0);
    }
  }
}

export const syncNow = () => schedule(0);

/** Synchro immédiate, attendue (avant une mise à jour du catalogue : seuils de votes à jour). Sans compte : rien. */
export async function syncAndWait(): Promise<void> {
  if (!state.user) return;
  while (running) await new Promise((r) => setTimeout(r, 200));
  await runSync();
}

const RETURN_KEY = 'cloud-return';
export const siteUrl = () => `${location.origin}${import.meta.env.BASE_URL}`;

async function loadPseudo(userId: string) {
  const { data } = await supabase!.from('profiles').select('pseudo').eq('id', userId).maybeSingle();
  if (state.user?.id === userId) setState({ pseudo: data?.pseudo ?? null });
}

function onSession(event: string, session: Session | null) {
  const u = session?.user;
  const user = u ? { id: u.id, email: u.email ?? null, providers: (u.app_metadata?.providers as string[] | undefined) ?? [] } : null;
  const changed = user?.id !== state.user?.id;
  setState({ ready: true, user, ...(changed ? { pseudo: null, lastSync: null, error: null } : {}) });
  if (event === 'PASSWORD_RECOVERY') {
    setState({ recovery: true });
    location.hash = '#/settings';
  }
  if (user && changed) {
    loadPseudo(user.id).catch(() => undefined);
    schedule(0);
  }
}

let started = false;

/** À appeler une fois au démarrage : session, retour de connexion, synchros automatiques. */
export function startCloud(): void {
  if (!supabase || started) return;
  started = true;
  // Pas d'appel Supabase directement dans ce rappel (il bloquerait le client) : on le diffère.
  supabase.auth.onAuthStateChange((event, session) => setTimeout(() => onSession(event, session), 0));

  // Retour de Google ou d'un lien reçu par e-mail : nettoyer l'URL, revenir à la page de départ.
  supabase.auth.getSession().finally(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has('code') && !params.has('error') && !params.has('error_description')) return;
    const error = params.get('error_description');
    if (error) toast(`✕ Connexion impossible : ${error}`);
    let back = location.hash;
    try {
      back = sessionStorage.getItem(RETURN_KEY) ?? back;
      sessionStorage.removeItem(RETURN_KEY);
    } catch {
      // Stockage indisponible : on reste sur la page d'accueil.
    }
    history.replaceState(null, '', `${location.pathname}${back}`);
    dispatchEvent(new HashChangeEvent('hashchange'));
  });

  // Toute modification locale des réponses ou des classements part vers le compte quelques secondes après.
  Dexie.on('storagemutated', (parts) => {
    if (Object.keys(parts).some((k) => /\/(answers|meta)\//.test(k))) schedule(5000);
  });
  addEventListener('online', () => schedule(0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(0);
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') schedule(0);
  }, 2 * 60_000);
}

// ---------------------------------------------------------------------------
// Actions du compte
// ---------------------------------------------------------------------------

export async function signInWithGoogle(): Promise<void> {
  try {
    sessionStorage.setItem(RETURN_KEY, location.hash);
  } catch {
    // Retour sur l'accueil après connexion.
  }
  const { error } = await supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: siteUrl() } });
  if (error) throw new Error(frError(error));
}

/** Création de compte ; `false` si une confirmation par e-mail est demandée avant de pouvoir se connecter. */
export async function signUp(email: string, password: string, pseudo: string): Promise<boolean> {
  const { data, error } = await supabase!.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { pseudo: pseudo.trim() }, emailRedirectTo: siteUrl() },
  });
  if (error) throw new Error(frError(error));
  // Adresse déjà inscrite (Supabase ne le dit pas, pour ne pas révéler les comptes existants).
  if (data.user && !data.user.identities?.length) throw new Error('Un compte existe déjà avec cet e-mail.');
  return !!data.session;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(frError(error));
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: siteUrl() });
  if (error) throw new Error(frError(error));
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase!.auth.updateUser({ password });
  if (error) throw new Error(frError(error));
  setState({ recovery: false });
}

export const cancelRecovery = () => setState({ recovery: false });

export async function updatePseudo(pseudo: string): Promise<void> {
  const user = state.user;
  if (!user) return;
  const { error } = await supabase!.from('profiles').update({ pseudo: pseudo.trim() }).eq('id', user.id);
  if (error) throw new Error(frError(error));
  setState({ pseudo: pseudo.trim() });
}

/** Oublie la synchro sur cet appareil (la prochaine connexion refera une fusion complète). */
const forgetSync = () => db.synced.clear();

/** Déconnexion ; `eraseLocal` efface aussi les données de cet appareil (elles restent sur le compte). */
export async function signOut(eraseLocal: boolean): Promise<void> {
  // Dernier envoi des modifications en attente, si possible.
  if (state.user && !eraseLocal) await runSync().catch(() => undefined);
  await supabase!.auth.signOut({ scope: 'local' });
  await forgetSync();
  if (eraseLocal) await clearChoices();
}

/** Supprime le compte et toutes ses données sur le serveur ; celles de cet appareil sont gardées. */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase!.rpc('delete_account');
  if (error) throw new Error(frError(error));
  await supabase!.auth.signOut({ scope: 'local' });
  await forgetSync();
}
