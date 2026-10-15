import { useEffect, useRef, type ReactNode } from 'react';

/** Gauche / droite (mode 2 directions) ou l'un des 4 coins : haut-gauche, haut-droite, bas-gauche, bas-droite. */
export type Dir = 'left' | 'right' | 'ul' | 'ur' | 'dl' | 'dr';
export type SwipeMode = 'horizontal' | 'corners';
export type Tone = 'yes' | 'no' | 'wish' | 'meh';

const THRESHOLD = 90; // px à parcourir pour valider un swipe horizontal
const CORNER_X = 70; // et pour un coin : en largeur…
const CORNER_Y = 50; // … et en hauteur
const FLY_MS = 220;

const VECTOR: Record<Dir, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  ul: [-1, -1],
  ur: [1, -1],
  dl: [-1, 1],
  dr: [1, 1],
};

/** Direction visée par le glissement en cours (sans tenir compte du seuil). */
function aim(mode: SwipeMode, dx: number, dy: number): Dir | null {
  if (mode === 'horizontal') return dx === 0 ? null : dx > 0 ? 'right' : 'left';
  if (Math.abs(dy) < 20 || dx === 0) return null; // pas encore de direction verticale
  return `${dy < 0 ? 'u' : 'd'}${dx > 0 ? 'r' : 'l'}` as Dir;
}

function progressOf(mode: SwipeMode, dx: number, dy: number): number {
  if (mode === 'horizontal') return Math.min(1, Math.abs(dx) / THRESHOLD);
  return Math.min(1, Math.abs(dx) / CORNER_X, Math.abs(dy) / CORNER_Y);
}

interface Props {
  mode: SwipeMode;
  labels: Partial<Record<Dir, { text: string; tone: Tone }>>;
  /** Déclenche l'animation de sortie depuis un bouton ou le clavier. */
  fling: Dir | null;
  onSwipe: (dir: Dir) => void;
  onTap?: () => void;
  /** Glissement assez long mais sans direction claire (mode 4 coins). */
  onAmbiguous?: () => void;
  /** Directions qui ne jettent pas la carte : elle revient au centre pour une 2e question. */
  stay?: Dir[];
  className?: string;
  children: ReactNode;
}

/**
 * Carte à swiper. Pendant le glissement, la position et le tampon sont modifiés directement
 * dans le DOM (une fois par image) : aucun rendu React, pour rester fluide sur téléphone.
 */
export default function SwipeCard({ mode, labels, fling, onSwipe, onTap, onAmbiguous, stay = [], className = '', children }: Props) {
  const card = useRef<HTMLDivElement>(null);
  const stamp = useRef<HTMLSpanElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const delta = useRef({ x: 0, y: 0 });
  const frame = useRef(0);
  const leaving = useRef(false);

  const place = (x: number, y: number, animate: boolean) => {
    const el = card.current;
    if (!el) return;
    el.style.transition = animate ? `transform ${FLY_MS}ms ease-out` : 'none';
    el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${x / 18}deg)`;
  };

  const showStamp = (dir: Dir | null, opacity: number) => {
    const el = stamp.current;
    if (!el) return;
    const label = dir ? labels[dir] : undefined;
    if (!label) {
      el.style.opacity = '0';
      return;
    }
    // Texte et classe ne changent que quand la direction change (évite de recalculer la mise en page).
    if (el.dataset.dir !== dir) {
      el.dataset.dir = dir!;
      el.textContent = label.text;
      el.className = `stamp stamp-${dir} tone-${label.tone}`;
    }
    el.style.opacity = String(opacity);
  };

  const leave = (dir: Dir) => {
    if (stay.includes(dir)) {
      place(0, 0, false);
      showStamp(null, 0);
      onSwipe(dir);
      return;
    }
    leaving.current = true;
    const [vx, vy] = VECTOR[dir];
    const x = vx * window.innerWidth * 1.2;
    const y = vy ? vy * window.innerHeight * 0.7 : mode === 'horizontal' ? delta.current.y * 0.3 : delta.current.y;
    place(x, y, true);
    showStamp(dir, 1);
    setTimeout(() => onSwipe(dir), FLY_MS);
  };

  useEffect(() => {
    if (fling && !leaving.current) leave(fling);
  }, [fling]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (leaving.current) return;
    start.current = { x: e.clientX, y: e.clientY };
    delta.current = { x: 0, y: 0 };
    card.current?.classList.add('dragging');
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    delta.current = { x: e.clientX - start.current.x, y: e.clientY - start.current.y };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (!start.current) return;
      const { x, y } = delta.current;
      place(x, mode === 'horizontal' ? y * 0.3 : y, false);
      showStamp(aim(mode, x, y), progressOf(mode, x, y));
    });
  };

  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    card.current?.classList.remove('dragging');
    const { x: dx, y: dy } = delta.current;
    const target = aim(mode, dx, dy);
    const valid = mode === 'horizontal' ? Math.abs(dx) > THRESHOLD : Math.abs(dx) > CORNER_X && Math.abs(dy) > CORNER_Y;
    if (target && valid) {
      leave(target);
      return;
    }
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) onTap?.();
    else if (mode === 'corners' && Math.hypot(dx, dy) > THRESHOLD) onAmbiguous?.();
    place(0, 0, true);
    showStamp(null, 0);
  };

  return (
    <div
      ref={card}
      className={`swipe-card ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {children}
      <span ref={stamp} className="stamp" style={{ opacity: 0 }} aria-hidden />
    </div>
  );
}
