import { db, type Status, type Tier, type Title } from './db';
import { readRanking, splitAnime } from './ranking';
import { isAnimeTitle } from './category';
import { frError, siteUrl } from './cloud';
import { supabase } from './supabase';
import type { Side } from './together';
import type { Database } from './database.types';

/** Amis : ajout par code, partage, lecture (seule) des données qu'un ami partage. */

export interface Friend {
  id: string;
  pseudo: string;
  code: string;
  shareWishlist: boolean;
  shareRanking: boolean;
}

export interface MyProfile {
  friendCode: string;
  shareWishlist: boolean;
  shareRanking: boolean;
}

const sb = () => {
  if (!supabase) throw new Error('Comptes indisponibles.');
  return supabase;
};

async function myId(): Promise<string> {
  const { data } = await sb().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Connecte-toi d’abord.');
  return id;
}

export const inviteLink = (code: string) => `${siteUrl()}#/invite/${code}`;

export async function loadMyProfile(): Promise<MyProfile> {
  const { data, error } = await sb().from('profiles').select('friend_code, share_wishlist, share_ranking').eq('id', await myId()).single();
  if (error) throw new Error(frError(error));
  return { friendCode: data.friend_code, shareWishlist: data.share_wishlist, shareRanking: data.share_ranking };
}

export async function setSharing(patch: { shareWishlist?: boolean; shareRanking?: boolean }): Promise<void> {
  const row: Database['public']['Tables']['profiles']['Update'] = {};
  if (patch.shareWishlist !== undefined) row.share_wishlist = patch.shareWishlist;
  if (patch.shareRanking !== undefined) row.share_ranking = patch.shareRanking;
  const { error } = await sb().from('profiles').update(row).eq('id', await myId());
  if (error) throw new Error(frError(error));
  friendCache.clear();
}

export async function listFriends(): Promise<Friend[]> {
  const me = await myId();
  const { data: rows, error } = await sb().from('friendships').select('user_a, user_b, created_at').order('created_at');
  if (error) throw new Error(frError(error));
  const ids = rows.map((r) => (r.user_a === me ? r.user_b : r.user_a));
  if (!ids.length) return [];
  const { data: profiles, error: e2 } = await sb().from('profiles').select('id, pseudo, friend_code, share_wishlist, share_ranking').in('id', ids);
  if (e2) throw new Error(frError(e2));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return ids
    .map((id) => byId.get(id))
    .filter((p) => !!p)
    .map((p) => ({ id: p!.id, pseudo: p!.pseudo, code: p!.friend_code, shareWishlist: p!.share_wishlist, shareRanking: p!.share_ranking }));
}

/** Pseudo du propriétaire d'un code, ou null si le code n'existe pas. */
export async function findByCode(code: string): Promise<string | null> {
  const { data, error } = await sb().rpc('find_friend_code', { code });
  if (error) throw new Error(frError(error));
  return data ?? null;
}

/** Ajoute un ami avec son code ; renvoie son pseudo. */
export async function addFriend(code: string): Promise<string> {
  const { data, error } = await sb().rpc('add_friend', { code });
  if (error) throw new Error(frError(error));
  return data;
}

export async function removeFriend(id: string): Promise<void> {
  const me = await myId();
  const [a, b] = me < id ? [me, id] : [id, me];
  const { error } = await sb().from('friendships').delete().eq('user_a', a).eq('user_b', b);
  if (error) throw new Error(frError(error));
  friendCache.delete(id);
}

export async function newFriendCode(): Promise<string> {
  const { data, error } = await sb().rpc('new_friend_code');
  if (error) throw new Error(frError(error));
  return data;
}

// ---------------------------------------------------------------------------
// Données des deux côtés, pour la page « À deux »
// ---------------------------------------------------------------------------

export interface FriendData extends Side {
  /** Copies des titres jointes aux réponses de l'ami (pour ceux absents de mon catalogue). */
  titles: Map<string, Title>;
}

const PAGE = 1000;
const friendCache = new Map<string, { at: number; data: FriendData }>();

/** Ce que l'ami partage (gardé 5 minutes en mémoire). */
export async function loadFriendData(friendId: string, fresh = false): Promise<FriendData> {
  const cached = friendCache.get(friendId);
  if (cached && !fresh && Date.now() - cached.at < 5 * 60_000) return cached.data;
  const answers: FriendData['answers'] = new Map();
  const titles = new Map<string, Title>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb()
      .from('answers')
      .select('key, status, tier, title')
      .eq('user_id', friendId)
      .eq('deleted', false)
      .order('key')
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(frError(error));
    for (const r of data) {
      answers.set(r.key, { status: r.status as Status, tier: (r.tier as Tier | null) ?? null });
      if (r.title) titles.set(r.key, r.title as unknown as Title); // copie envoyée par la synchro (cloud.ts)
    }
    if (data.length < PAGE) break;
  }
  const { data: meta, error } = await sb().from('user_meta').select('key, value').eq('user_id', friendId).eq('deleted', false).like('key', 'ranking:%');
  if (error) throw new Error(frError(error));
  const rankings: Record<string, string[]> = {};
  for (const m of meta) if (Array.isArray(m.value)) rankings[m.key.slice('ranking:'.length)] = m.value as string[];
  // Ami sur une version d'avant la catégorie Animes : ses animes sont dans ses classements de séries.
  const isAnime = (k: string) => { const t = titles.get(k); return !!t && isAnimeTitle(t); };
  for (const list of ['', 'wish:']) {
    if (!rankings[`${list}tv`]) continue;
    const split = splitAnime(rankings[`${list}tv`], rankings[`${list}anime`] ?? [], isAnime);
    rankings[`${list}tv`] = split.tv;
    rankings[`${list}anime`] = split.anime;
  }
  const data = { answers, rankings, titles };
  friendCache.set(friendId, { at: Date.now(), data });
  return data;
}

/** Mes données, depuis la base locale. */
export async function loadMySide(): Promise<Side> {
  const answers: Side['answers'] = new Map();
  for (const a of await db.answers.toArray()) answers.set(a.key, { status: a.status, tier: a.tier ?? null });
  const rankings: Record<string, string[]> = {};
  for (const category of ['movie', 'tv', 'anime'] as const) {
    rankings[category] = await readRanking({ category, list: 'seen' });
    rankings[`wish:${category}`] = await readRanking({ category, list: 'wish' });
  }
  return { answers, rankings };
}
