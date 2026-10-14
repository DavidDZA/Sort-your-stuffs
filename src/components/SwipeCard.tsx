import { useEffect, useRef, useState, type ReactNode } from 'react';

export type Dir = 'left' | 'right';

const THRESHOLD = 90; // px à parcourir pour valider un swipe
const FLY_MS = 220;

interface Props {
  labels: { left: string; right: string };
  /** Déclenche l'animation de sortie depuis un bouton ou le clavier. */
  fling: Dir | null;
  onSwipe: (dir: Dir) => void;
  onTap?: () => void;
  /** Direction qui ne jette pas la carte : elle revient au centre (ex. « Pas vu » → question wishlist). */
  stay?: Dir | null;
  className?: string;
  children: ReactNode;
}

export default function SwipeCard({ labels, fling, onSwipe, onTap, stay, className = '', children }: Props) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [delta, setDelta] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<Dir | null>(null);

  const leave = (dir: Dir) => {
    if (dir === stay) {
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
    if (Math.abs(delta.x) > THRESHOLD) leave(delta.x > 0 ? 'right' : 'left');
    else {
      if (Math.abs(delta.x) < 6 && Math.abs(delta.y) < 6) onTap?.();
      setDelta({ x: 0, y: 0 });
    }
  };

  const x = leaving ? (leaving === 'right' ? 1 : -1) * window.innerWidth * 1.2 : delta.x;
  const y = delta.y * 0.3;
  const progress = Math.max(-1, Math.min(1, x / THRESHOLD));

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
      <span className="stamp stamp-right" style={{ opacity: Math.max(0, progress) }}>
        {labels.right}
      </span>
      <span className="stamp stamp-left" style={{ opacity: Math.max(0, -progress) }}>
        {labels.left}
      </span>
    </div>
  );
}
