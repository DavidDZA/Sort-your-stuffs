import type { Title } from '../../lib/db';
import type { Category } from '../../lib/category';
import type { Friend, FriendData } from '../../lib/friends';
import type { Side } from '../../lib/together';
import { changeStatus } from '../../lib/ranking';
import { toast } from '../../lib/fun';

/** Données des deux côtés, chargées par la page « À deux ». */
export interface Loaded {
  friend: Friend;
  me: Side;
  them: FriendData;
  titles: Map<string, Title>;
  /** Catégorie d'une clé, d'après les titres connus. */
  catOf: (key: string) => Category | undefined;
}

export const nth = (n: number | undefined) => (n ? `n°${n}` : 'non priorisé');

export function NeedsSharing({ pseudo, what }: { pseudo: string; what: string }) {
  return <p className="muted center small">{pseudo} ne partage pas {what}. Il ou elle peut l’activer dans sa page Amis.</p>;
}

/** Ajoute un titre (vu chez l'ami) à ma wishlist. */
export async function addToWishlist(t: Title, onDone: () => void): Promise<void> {
  await changeStatus(t, 'wish');
  toast(`💖 « ${t.title} » ajouté à ta wishlist`);
  onDone();
}
