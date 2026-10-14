import { useEffect, useRef, useState, type ReactNode } from 'react';

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

export default function SwipeCard({ mode, labels, fling, onSwipe, onTap, onAmbiguous, stay = [], className = '', children }: Props) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [delta, setDelta] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<Dir | null>(null);

  const leave = (dir: Dir) => {
    if (stay.includes(dir)) {
      setDelta({ x: 0, y: 0 });
      onSwipe(dir);
      return;
    }
    setLeaving(dir);
    setTimeout(() => onSwipe(dir), FLY_MS);
  };

  useEffect(() => {
    if (fling && !leaving) leave(fling);
  }, [fling]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (leaving) return;
    start.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    setDelta({ x: e.clientX - start.current.x, y: e.clientY - start.current.y });
  };
  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    const { x: dx, y: dy } = delta;
    const target = aim(mode, dx, dy);
    const valid = mode === 'horizontal' ? Math.abs(dx) > THRESHOLD : Math.abs(dx) > CORNER_X && Math.abs(dy) > CORNER_Y;
    if (target && valid) {
      leave(target);
      return;
    }
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) onTap?.();
    else if (mode === 'corners' && Math.hypot(dx, dy) > THRESHOLD) onAmbiguous?.();
    setDelta({ x: 0, y: 0 });
  };

  let x = delta.x;
  let y = mode === 'horizontal' ? delta.y * 0.3 : delta.y;
  if (leaving) {
    const [vx, vy] = VECTOR[leaving];
    x = vx * window.innerWidth * 1.2;
    y = vy ? vy * window.innerHeight * 0.7 : y;
  }

  const target = leaving ?? aim(mode, delta.x, delta.y);
  const label = target ? labels[target] : undefined;
  const opacity = leaving ? 1 : progressOf(mode, delta.x, delta.y);

  return (
    <div
      className={`swipe-card ${dragging ? 'dragging' : ''} ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        transform: `translate(${x}px, ${y}px) rotate(${x / 18}deg)`,
        transition: dragging ? 'none' : `transform ${FLY_MS}ms ease-out`,
      }}
    >
      {children}
      {label && target && (
        <span className={`stamp stamp-${target} tone-${label.tone}`} style={{ opacity }}>
          {label.text}
        </span>
      )}
    </div>
  );
}
