import type { Title } from './db';
import { CATEGORY_LABEL, type Category } from './category';

const plural = (c: Category) => CATEGORY_LABEL[c].plural;
const slug = (c: Category) => plural(c).normalize('NFD').replace(/[̀-ͯ]/g, '');
import { posterUrl } from './tmdb';

const FONT = '"Fredoka Variable", system-ui, sans-serif';

function loadImage(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    // Paramètre ajouté pour ne pas réutiliser la version « opaque » mise en cache par le service worker.
    img.src = `${src}?share=1`;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

/** Dessine une image « Mon top 10 » avec les affiches, puis la partage (ou la télécharge). */
export async function shareTop(category: Category, titles: Title[], filterLabel?: string): Promise<void> {
  const top = titles.slice(0, 10);
  await document.fonts.load(`700 64px ${FONT}`).catch(() => undefined);

  const W = 1080;
  const cols = 5;
  const pad = 48;
  const gap = 22;
  const pw = (W - 2 * pad - (cols - 1) * gap) / cols;
  const ph = pw * 1.5;
  const header = 190;
  const rowH = ph + 92;
  const rows = Math.ceil(top.length / cols);
  const H = header + rows * rowH + 70;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  paintBackground(ctx, W, H);
  paintTitle(ctx, W, `Mon top ${top.length} ${plural(category)}`, filterLabel ? `🏆 ${filterLabel}` : '🏆 classé duel après duel');

  const images = await Promise.all(top.map((t) => loadImage(posterUrl(t.posterPath, 'w342'))));

  top.forEach((t, i) => {
    const x = pad + (i % cols) * (pw + gap);
    const y = header + Math.floor(i / cols) * rowH;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    roundRect(ctx, x, y, pw, ph, 16);
    ctx.fillStyle = '#2a2445';
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRect(ctx, x, y, pw, ph, 16);
    ctx.clip();
    const img = images[i];
    if (img) {
      ctx.drawImage(img, x, y, pw, ph);
    } else {
      ctx.fillStyle = '#aaa4ca';
      ctx.font = `500 24px ${FONT}`;
      ctx.fillText(fitText(ctx, t.title, pw - 20), x + pw / 2, y + ph / 2);
    }
    ctx.restore();

    // Pastille de rang : médaille pour le podium, numéro ensuite.
    const cx = x + 30;
    const cy = y + 30;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    const badge = ctx.createLinearGradient(cx - 26, cy - 26, cx + 26, cy + 26);
    badge.addColorStop(0, '#ff5fa2');
    badge.addColorStop(1, '#ff9f43');
    ctx.fillStyle = i < 3 ? 'rgba(16,13,31,0.85)' : badge;
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.font = i < 3 ? `34px ${FONT}` : `700 26px ${FONT}`;
    ctx.fillText(i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1), cx, cy + 1);
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#f6f4ff';
    ctx.font = `600 25px ${FONT}`;
    ctx.fillText(fitText(ctx, t.title, pw), x + pw / 2, y + ph + 36);
    ctx.fillStyle = '#aaa4ca';
    ctx.font = `400 21px ${FONT}`;
    ctx.fillText(t.year ? String(t.year) : '', x + pw / 2, y + ph + 64);
  });

  ctx.fillStyle = 'rgba(246,244,255,0.55)';
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText('Fait avec Sort my stuffs 🍿', W / 2, H - 32);

  await shareCanvas(canvas, `mon-top-${slug(category)}.png`, `Mon top ${top.length}`);
}

function paintBackground(ctx: CanvasRenderingContext2D, W: number, H: number) {
  // Fond : dégradé sombre et halos colorés, comme dans l'appli.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#140f2b');
  bg.addColorStop(1, '#2a1640');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, color] of [
    [W * 0.15, Math.min(H * 0.1, 200), 420, 'rgba(255,95,162,0.25)'],
    [W * 0.9, H * 0.25, 380, 'rgba(61,214,245,0.16)'],
    [W * 0.6, H * 0.95, 460, 'rgba(139,124,255,0.25)'],
  ] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

function paintTitle(ctx: CanvasRenderingContext2D, W: number, title: string, subtitle: string) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const grad = ctx.createLinearGradient(W * 0.25, 0, W * 0.75, 0);
  grad.addColorStop(0, '#ff5fa2');
  grad.addColorStop(0.5, '#ff9f43');
  grad.addColorStop(1, '#ffd166');
  ctx.fillStyle = grad;
  ctx.font = `700 72px ${FONT}`;
  ctx.fillText(title, W / 2, 105);
  ctx.fillStyle = '#aaa4ca';
  ctx.font = `500 30px ${FONT}`;
  ctx.fillText(subtitle, W / 2, 152);
}

async function shareCanvas(canvas: HTMLCanvasElement, filename: string, title: string): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Impossible de créer l’image.');
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') throw e;
    }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

/** Image de la tier list : une rangée colorée par palier, avec les affiches des titres. */
export async function shareTierList(category: Category, tiers: { label: string; color: string; items: Title[] }[], filterLabel?: string): Promise<void> {
  await document.fonts.load(`700 64px ${FONT}`).catch(() => undefined);
  const count = tiers.reduce((s, t) => s + t.items.length, 0);
  const W = 1080;
  const pad = 40;
  const labelW = 110;
  const gap = 8;
  const pw = count > 120 ? 52 : count > 60 ? 68 : 92; // affiches plus petites quand il y en a beaucoup
  const ph = pw * 1.5;
  const perRow = Math.max(1, Math.floor((W - 2 * pad - labelW - 16 + gap) / (pw + gap)));
  const header = 190;
  const rowHeights = tiers.map((t) => Math.max(1, Math.ceil(t.items.length / perRow)) * (ph + gap) + gap);
  const H = header + rowHeights.reduce((s, h) => s + h + 10, 0) + 70;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  paintBackground(ctx, W, H);
  paintTitle(ctx, W, `Ma tier list ${plural(category)}`, filterLabel ? `🏆 ${count} titres · ${filterLabel}` : `🏆 ${count} titres classés duel après duel`);

  const images = await Promise.all(tiers.flatMap((t) => t.items).map((t) => loadImage(posterUrl(t.posterPath, 'w185'))));
  let index = 0;
  let y = header;
  tiers.forEach((tier, r) => {
    const h = rowHeights[r];
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, pad, y, W - 2 * pad, h, 14);
    ctx.fill();
    ctx.fillStyle = tier.color;
    roundRect(ctx, pad, y, labelW, h, 14);
    ctx.fill();
    ctx.fillStyle = '#15102a';
    ctx.font = `700 56px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tier.label, pad + labelW / 2, y + h / 2);
    tier.items.forEach((_, i) => {
      const x = pad + labelW + 16 + (i % perRow) * (pw + gap);
      const py = y + gap + Math.floor(i / perRow) * (ph + gap);
      const img = images[index++];
      ctx.save();
      roundRect(ctx, x, py, pw, ph, 6);
      ctx.clip();
      if (img) ctx.drawImage(img, x, py, pw, ph);
      else {
        ctx.fillStyle = '#2a2445';
        ctx.fillRect(x, py, pw, ph);
      }
      ctx.restore();
    });
    y += h + 10;
  });

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(246,244,255,0.55)';
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText('Fait avec Sort my stuffs 🍿', W / 2, H - 28);
  await shareCanvas(canvas, `ma-tier-list-${slug(category)}.png`, 'Ma tier list');
}
