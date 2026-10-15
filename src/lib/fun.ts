const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Petite explosion d'emojis autour d'un point de l'écran. */
export function burst(emojis: string[], origin?: { x: number; y: number }, count = 14): void {
  if (reducedMotion()) return;
  const x = origin?.x ?? innerWidth / 2;
  const y = origin?.y ?? innerHeight / 2;
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = 'particle';
    s.textContent = emojis[i % emojis.length];
    const angle = Math.random() * Math.PI * 2;
    const dist = 70 + Math.random() * 130;
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.fontSize = `${18 + Math.random() * 18}px`;
    s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    s.style.setProperty('--dy', `${Math.sin(angle) * dist - 60}px`);
    s.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1100);
  }
}

/** Centre d'un élément, pour y faire partir une explosion. */
export function centerOf(el: Element | null | undefined): { x: number; y: number } | undefined {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Affiche un message éphémère (voir <Toaster /> dans App). */
export function toast(message: string): void {
  dispatchEvent(new CustomEvent('app-toast', { detail: message }));
}

export const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

export const MILESTONES = [
  '🔥 Tu es en feu !',
  '🍿 Quel cinéphile !',
  '🚀 Rien ne t’arrête !',
  '🏅 Belle session !',
  '🎬 Ta base grandit !',
  '⚡ Machine de tri !',
];
