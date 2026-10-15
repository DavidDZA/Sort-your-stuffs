import type { Status, Tier } from '../../lib/db';
import type { Dir, Tone } from '../../components/SwipeCard';

/** Mode 2 directions : vu / pas vu, puis « aimé ou bof ? » (vu) ou « envie ? » (pas vu). */
export type Phase = 'seen' | 'wish' | 'rate';

interface PhaseText {
  question: string;
  left: string;
  right: string;
  leftBtn: string;
  rightBtn: string;
  leftCap: string;
  rightCap: string;
  leftTip: string;
  rightTip: string;
}

export const PHASES: Record<Phase, PhaseText> = {
  seen: {
    question: 'Tu l’as vu ?',
    left: 'PAS VU 🙈',
    right: 'VU ✅',
    leftBtn: '✕',
    rightBtn: '✓',
    leftCap: 'Pas vu',
    rightCap: 'Vu',
    leftTip: 'Je ne l’ai pas vu (swipe à gauche ou flèche ←)',
    rightTip: 'Je l’ai vu (swipe à droite ou flèche →)',
  },
  wish: {
    question: 'Pas vu… envie de le voir ?',
    left: 'PAS ENVIE 💤',
    right: 'ENVIE 💖',
    leftBtn: '✕',
    rightBtn: '♥',
    leftCap: 'Pas envie',
    rightCap: 'Wishlist',
    leftTip: 'Pas envie : il ne sera plus proposé (swipe à gauche ou flèche ←)',
    rightTip: 'Ajouter à la wishlist (swipe à droite ou flèche →)',
  },
  rate: {
    question: 'Vu ! Tu as aimé ?',
    left: 'BOF 😐',
    right: 'AIMÉ 👍',
    leftBtn: '😐',
    rightBtn: '👍',
    leftCap: 'Bof',
    rightCap: 'Aimé',
    leftTip: 'Vu, mais bof : classé avec les « bof » (swipe à gauche ou flèche ←)',
    rightTip: 'Vu et aimé : classé avec les « bien » (swipe à droite ou flèche →)',
  },
};

export const TONES: Record<Phase, { left: Tone; right: Tone }> = {
  seen: { left: 'no', right: 'yes' },
  wish: { left: 'no', right: 'wish' },
  rate: { left: 'meh', right: 'yes' },
};

export type Corner = 'ul' | 'ur' | 'dl' | 'dr';

/** Mode 4 coins : haut = positif. Les boutons reprennent la même disposition. */
export const CORNERS: Record<Corner, { status: Status; tier?: Tier; text: string; tone: Tone; icon: string; caption: string; tip: string; key: string }> = {
  ul: { status: 'wish', text: 'ENVIE 💖', tone: 'wish', icon: '💖', caption: 'Envie', tip: 'Pas vu, envie de le voir : wishlist (↖ ou touche 7)', key: '7' },
  ur: { status: 'seen', tier: 'good', text: 'VU 👍', tone: 'yes', icon: '👍', caption: 'Vu · bien', tip: 'Vu, et j’ai aimé (↗ ou touche 9)', key: '9' },
  dl: { status: 'unseen', text: 'PAS ENVIE 💤', tone: 'no', icon: '💤', caption: 'Pas envie', tip: 'Pas vu, pas envie : il ne sera plus proposé (↙ ou touche 1)', key: '1' },
  dr: { status: 'seen', tier: 'meh', text: 'VU 😐', tone: 'meh', icon: '😐', caption: 'Vu · bof', tip: 'Vu, mais bof (↘ ou touche 3)', key: '3' },
};

export const isCorner = (d: Dir): d is Corner => d in CORNERS;

export const ARROWS: Record<Corner, string> = { ul: '↖', ur: '↗', dl: '↙', dr: '↘' };
