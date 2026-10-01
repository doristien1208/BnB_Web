import type { AnimalKey } from '../../shared/characters';
import { COLORS } from '../../shared/colors';
import type { ItemType, MountType } from '../../shared/items';

/**
 * Original Q-style pixel art, drawn in code: every sprite is painted once at
 * art resolution (1 art px = 2 screen px) onto a small canvas and cached.
 */
export const INK = '#2a2235';
export const WHITE = '#ffffff';
const ORANGE = '#f59e2b';
const BLUSH = '#ff9fb0';

export class Px {
  constructor(readonly ctx: CanvasRenderingContext2D) {}

  rect(x: number, y: number, w: number, h: number, c: string): void {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  dot(x: number, y: number, c: string): void {
    this.rect(x, y, 1, 1, c);
  }

  /** Filled ellipse with hard pixel edges (no anti-aliasing). */
  oval(cx: number, cy: number, rx: number, ry: number, c: string): void {
    if (rx <= 0 || ry <= 0) return;
    this.ctx.fillStyle = c;
    for (let y = Math.floor(cy - ry); y < Math.ceil(cy + ry); y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (dy <= -1 || dy >= 1) continue;
      const hw = rx * Math.sqrt(1 - dy * dy);
      const x0 = Math.round(cx - hw);
      const x1 = Math.round(cx + hw);
      if (x1 > x0) this.ctx.fillRect(x0, y, x1 - x0, 1);
    }
  }

  /** Ellipse with a 1 px outline. */
  ovalO(cx: number, cy: number, rx: number, ry: number, fill: string, line: string): void {
    this.oval(cx, cy, rx, ry, line);
    this.oval(cx, cy, rx - 1, ry - 1, fill);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: string): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const ex = Math.round(x1);
    const ey = Math.round(y1);
    const dx = Math.abs(ex - x);
    const dy = -Math.abs(ey - y);
    const sx = x < ex ? 1 : -1;
    const sy = y < ey ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.dot(x, y, c);
      if (x === ex && y === ey) return;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }
}

export function sprite(w: number, h: number, draw: (p: Px) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(new Px(cv.getContext('2d')!));
  return cv;
}

export function flipX(src: HTMLCanvasElement): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = src.width;
  cv.height = src.height;
  const ctx = cv.getContext('2d')!;
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return cv;
}

const cache = new Map<string, HTMLCanvasElement>();
export function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = cache.get(key);
  if (!c) {
    c = make();
    cache.set(key, c);
  }
  return c;
}

// ---------------------------------------------------------------- characters (20 x 24)

interface Pal {
  body: string;
  dark: string;
  light: string;
}
export type Facing = 'down' | 'up' | 'side';

function eye(p: Px, x: number, y: number): void {
  p.rect(x, y, 2, 2, INK);
  p.dot(x, y, WHITE);
}

function feet(p: Px, fr: number, c: string): void {
  const l = fr === 1 ? 1 : 0;
  const r = fr === 2 ? 1 : 0;
  p.ovalO(6.5, 21.5 - l, 2.6, 1.7, c, INK);
  p.ovalO(13.5, 21.5 - r, 2.6, 1.7, c, INK);
}

function hippo(p: Px, c: Pal, f: Facing, fr: number): void {
  feet(p, fr, c.dark);
  p.ovalO(10, 17.5, 6.5, 4.8, c.body, INK);
  if (f !== 'up') p.oval(10, 18.2, 3.8, 2.8, c.light);
  if (f === 'side') {
    p.ovalO(6.5, 3.5, 2.2, 2.2, c.body, INK);
    p.dot(6, 3, c.dark);
    p.ovalO(9.5, 9, 7.5, 6.5, c.body, INK);
    p.ovalO(14.5, 11, 4.5, 3.4, c.light, INK);
    p.dot(17, 10, c.dark);
    eye(p, 11, 6);
    p.dot(13, 9, BLUSH);
    return;
  }
  p.ovalO(4.5, 3.5, 2.2, 2.2, c.body, INK);
  p.ovalO(15.5, 3.5, 2.2, 2.2, c.body, INK);
  p.dot(4, 3, c.dark);
  p.dot(15, 3, c.dark);
  p.ovalO(10, 9, 8, 6.5, c.body, INK);
  if (f === 'up') return;
  p.ovalO(10, 12, 5.5, 3.2, c.light, INK);
  p.dot(8, 12, c.dark);
  p.dot(11, 12, c.dark);
  eye(p, 6, 7);
  eye(p, 12, 7);
  p.dot(3, 10, BLUSH);
  p.dot(16, 10, BLUSH);
}

function otter(p: Px, c: Pal, f: Facing, fr: number): void {
  if (f === 'side') p.ovalO(3.5, 18.5, 3.2, 2, c.dark, INK);
  if (f === 'up') p.ovalO(10, 22, 2.2, 2.4, c.dark, INK);
  feet(p, fr, c.dark);
  p.ovalO(10, 17.5, 5.5, 4.6, c.body, INK);
  if (f !== 'up') p.oval(10, 18, 3.2, 3, c.light);
  if (f === 'side') {
    p.ovalO(7, 4.5, 1.8, 1.8, c.body, INK);
    p.ovalO(10, 9.5, 7, 6, c.body, INK);
    p.ovalO(14, 11, 3.6, 2.6, c.light, INK);
    p.rect(16, 9, 2, 1, INK);
    eye(p, 12, 7);
    p.rect(15, 12, 3, 1, c.dark);
    return;
  }
  p.ovalO(4.5, 4.5, 1.9, 1.9, c.body, INK);
  p.ovalO(15.5, 4.5, 1.9, 1.9, c.body, INK);
  p.ovalO(10, 9.5, 7.5, 6, c.body, INK);
  if (f === 'up') return;
  p.ovalO(10, 11.5, 4, 2.7, c.light, INK);
  p.rect(9, 10, 2, 1, INK);
  eye(p, 6, 7);
  eye(p, 12, 7);
  p.rect(1, 11, 3, 1, c.dark);
  p.rect(16, 11, 3, 1, c.dark);
}

function octopus(p: Px, c: Pal, f: Facing, fr: number): void {
  const w = fr === 0 ? 0 : fr === 1 ? 1 : -1;
  [3.5, 7.5, 12.5, 16.5].forEach((x, k) => p.ovalO(x, 20 + (k % 2 ? w : -w), 2.3, 3, c.body, INK));
  p.ovalO(10, 10, 8.5, 8.5, c.body, INK);
  p.oval(5.5, 6, 1.5, 1.5, c.light);
  p.oval(14, 4.5, 1.2, 1.2, c.light);
  p.oval(15, 9, 0.9, 0.9, c.light);
  if (f === 'up') {
    p.oval(9, 8, 1.6, 1.6, c.light);
    return;
  }
  if (f === 'side') {
    eye(p, 12, 9);
    p.rect(15, 13, 2, 1, INK);
    return;
  }
  eye(p, 6, 9);
  eye(p, 12, 9);
  p.rect(9, 13, 2, 1, INK);
  p.dot(4, 12, BLUSH);
  p.dot(15, 12, BLUSH);
}

function crab(p: Px, c: Pal, f: Facing, fr: number): void {
  const a = fr === 1 ? 1 : 0;
  const b = fr === 2 ? 1 : 0;
  p.rect(2, 19 - a, 2, 3, INK);
  p.rect(6, 20 - b, 2, 3, INK);
  p.rect(12, 20 - a, 2, 3, INK);
  p.rect(16, 19 - b, 2, 3, INK);
  p.ovalO(3, 10, 3, 3.4, c.body, INK);
  p.ovalO(17, 10, 3, 3.4, c.body, INK);
  p.rect(3, 7, 1, 3, INK);
  p.rect(16, 7, 1, 3, INK);
  const ex = f === 'side' ? 2 : 0;
  p.rect(7 + ex, 6, 1, 5, INK);
  p.rect(12 + ex, 6, 1, 5, INK);
  p.ovalO(7.5 + ex, 5, 2.2, 2.2, WHITE, INK);
  p.ovalO(12.5 + ex, 5, 2.2, 2.2, WHITE, INK);
  p.ovalO(10, 15, 8.8, 5.6, c.body, INK);
  if (f === 'up') return;
  p.oval(10 + ex, 16.5, 5, 2.4, c.light);
  p.dot(7 + ex + (f === 'side' ? 1 : 0), 5, INK);
  p.dot(12 + ex + (f === 'side' ? 1 : 0), 5, INK);
  p.rect(9 + ex, 13, 2, 1, INK);
  if (f === 'down') {
    p.dot(5, 13, BLUSH);
    p.dot(14, 13, BLUSH);
  }
}

function frog(p: Px, c: Pal, f: Facing, fr: number): void {
  feet(p, fr, c.dark);
  p.ovalO(10, 18, 6.5, 4.5, c.body, INK);
  if (f !== 'up') p.oval(10, 18.5, 4.2, 3, c.light);
  if (f === 'side') {
    p.ovalO(9.5, 11.5, 8.5, 5.5, c.body, INK);
    p.ovalO(12, 6, 3.3, 3.3, c.body, INK);
    p.oval(12.5, 6, 2, 2, WHITE);
    p.rect(13, 5, 1, 2, INK);
    p.rect(12, 13, 6, 1, INK);
    p.dot(15, 11, BLUSH);
    return;
  }
  p.ovalO(10, 11.5, 9, 5.8, c.body, INK);
  p.ovalO(5, 6, 3.3, 3.3, c.body, INK);
  p.ovalO(15, 6, 3.3, 3.3, c.body, INK);
  if (f === 'up') return;
  p.oval(5, 6, 2, 2, WHITE);
  p.oval(15, 6, 2, 2, WHITE);
  p.rect(5, 5, 1, 2, INK);
  p.rect(14, 5, 1, 2, INK);
  p.rect(6, 13, 8, 1, INK);
  p.dot(5, 12, INK);
  p.dot(14, 12, INK);
  p.dot(3, 11, BLUSH);
  p.dot(16, 11, BLUSH);
}

function penguin(p: Px, c: Pal, f: Facing, fr: number): void {
  const l = fr === 1 ? 1 : 0;
  const r = fr === 2 ? 1 : 0;
  p.ovalO(6.5, 21.5 - l, 2.6, 1.6, ORANGE, INK);
  p.ovalO(13.5, 21.5 - r, 2.6, 1.6, ORANGE, INK);
  if (f !== 'side') {
    p.ovalO(2.8, 14, 2, 4, c.dark, INK);
    p.ovalO(17.2, 14, 2, 4, c.dark, INK);
  }
  p.ovalO(10, 11.5, 8, 10, c.body, INK);
  if (f === 'side') {
    p.oval(12.5, 13.5, 4, 6.5, WHITE);
    p.ovalO(8, 14, 2.2, 4.5, c.dark, INK);
    eye(p, 13, 7);
    p.rect(17, 9, 2, 2, ORANGE);
    return;
  }
  if (f === 'up') return;
  p.oval(10, 12.5, 5.8, 8, WHITE);
  eye(p, 7, 7);
  eye(p, 11, 7);
  p.rect(9, 10, 2, 2, ORANGE);
  p.dot(5, 10, BLUSH);
  p.dot(14, 10, BLUSH);
}

const ANIMALS: Record<AnimalKey, (p: Px, c: Pal, f: Facing, fr: number) => void> = {
  hippo,
  otter,
  octopus,
  crab,
  frog,
  penguin,
};

/** Character sprite (20 x 24 art px). dir: 1 up, 2 down, 3 left, 4 right. frame 0 stand, 1/2 walk. */
export function characterSprite(animal: AnimalKey, color: number, dir: number, frame: number): HTMLCanvasElement {
  const facing: Facing = dir === 1 ? 'up' : dir === 3 || dir === 4 ? 'side' : 'down';
  const key = `ch:${animal}:${color}:${facing}:${frame}`;
  const base = cached(key, () => {
    const col = COLORS[color] ?? COLORS[0]!;
    return sprite(20, 24, (p) => ANIMALS[animal](p, { body: col.main, dark: col.dark, light: col.light }, facing, frame));
  });
  return dir === 3 ? cached(`${key}:l`, () => flipX(base)) : base;
}

// ---------------------------------------------------------------- mounts (24 x 16)

export function mountSprite(t: MountType): HTMLCanvasElement {
  return cached(`mount:${t}`, () =>
    sprite(24, 16, (p) => {
      if (t === 'ufo') {
        p.ovalO(12, 10, 11.5, 4, '#b8c4cc', INK);
        p.oval(12, 9, 9, 2, '#e3eaee');
        [4, 9, 15, 20].forEach((x, k) => p.dot(x, 11, k % 2 ? '#ffd54f' : '#ff7043'));
        p.oval(12, 13.5, 5, 1.5, '#7b8a94');
        return;
      }
      if (t === 'owl') {
        p.ovalO(3, 8, 3, 5, '#7d5d52', INK);
        p.ovalO(21, 8, 3, 5, '#7d5d52', INK);
        p.ovalO(12, 8, 9, 7, '#a1887f', INK);
        p.oval(12, 10, 5.5, 4, '#d7ccc8');
        p.ovalO(9, 11, 2.2, 2.2, '#ffe082', INK);
        p.ovalO(15, 11, 2.2, 2.2, '#ffe082', INK);
        p.dot(9, 11, INK);
        p.dot(15, 11, INK);
        p.rect(11, 13, 2, 2, ORANGE);
        return;
      }
      const pirate = t === 'pirateTurtle';
      const skin = '#a5d66b';
      p.ovalO(4, 12, 3, 2.4, skin, INK);
      p.ovalO(20, 12, 3, 2.4, skin, INK);
      p.ovalO(12, 7.5, 10.5, 6.5, pirate ? '#2f6f4f' : '#43a047', INK);
      p.oval(12, 6, 7, 3.5, pirate ? '#3f8f63' : '#7bd17f');
      p.rect(7, 5, 2, 2, pirate ? '#24573d' : '#2e7d32');
      p.rect(15, 5, 2, 2, pirate ? '#24573d' : '#2e7d32');
      p.rect(11, 3, 2, 2, pirate ? '#24573d' : '#2e7d32');
      p.ovalO(12, 13, 3.6, 2.8, skin, INK);
      p.dot(10, 13, INK);
      p.dot(13, 13, INK);
      if (pirate) {
        p.rect(8, 10, 8, 2, '#e53935');
        p.dot(16, 11, '#e53935');
        p.rect(11, 6, 2, 2, WHITE);
      }
    }),
  );
}

// ---------------------------------------------------------------- balloons (16 x 16)

export function balloonSprite(color: number): HTMLCanvasElement {
  return cached(`balloon:${color}`, () =>
    sprite(16, 16, (p) => {
      p.ovalO(8, 9.5, 6.8, 6.2, '#46a8f0', '#1d5f9e');
      p.oval(8, 10.5, 4.8, 4, '#3593dd');
      p.oval(5.8, 7, 2, 1.5, '#c4e8ff');
      p.dot(5, 6, WHITE);
      p.rect(7, 2, 2, 2, COLORS[color]?.main ?? WHITE);
      p.dot(7, 1, INK);
      p.dot(8, 1, INK);
    }),
  );
}

export function bananaSprite(): HTMLCanvasElement {
  return cached('banana', () =>
    sprite(16, 16, (p) => {
      for (let k = 0; k <= 8; k++) {
        const a = Math.PI * (0.15 + (k / 8) * 0.7);
        p.oval(8 - Math.cos(a) * 5, 12 - Math.sin(a) * 6, 1.8, 1.8, k % 3 ? '#ffd54f' : '#fbc02d');
      }
      p.dot(2, 9, '#6d4c41');
      p.dot(13, 9, '#6d4c41');
    }),
  );
}

// ---------------------------------------------------------------- items (16 x 16)

function devilFace(p: Px, main: string, dark: string): void {
  p.rect(3, 2, 2, 4, dark);
  p.rect(11, 2, 2, 4, dark);
  p.ovalO(8, 9, 6, 5.5, main, INK);
  p.rect(5, 7, 2, 2, '#ffeb3b');
  p.rect(9, 7, 2, 2, '#ffeb3b');
  p.dot(6, 8, INK);
  p.dot(10, 8, INK);
  p.rect(5, 11, 6, 1, INK);
  p.dot(5, 12, WHITE);
  p.dot(10, 12, WHITE);
}

function turtleIcon(p: Px, pirate: boolean): void {
  p.ovalO(3.5, 12, 2, 1.6, '#a5d66b', INK);
  p.ovalO(12.5, 12, 2, 1.6, '#a5d66b', INK);
  p.ovalO(8, 13, 2.6, 2, '#a5d66b', INK);
  p.ovalO(8, 8, 6.5, 5, pirate ? '#2f6f4f' : '#43a047', INK);
  p.oval(8, 7, 4, 2.5, pirate ? '#3f8f63' : '#7bd17f');
  if (pirate) {
    p.rect(5, 12, 6, 1, '#e53935');
    p.rect(7, 6, 2, 2, WHITE);
  }
}

const ITEM_PAINT: Record<ItemType, (p: Px) => void> = {
  bubble: (p) => {
    p.ovalO(8, 9, 6, 5.8, '#46a8f0', '#1d5f9e');
    p.oval(6, 7, 1.7, 1.4, WHITE);
    p.rect(7, 2, 2, 2, '#1d5f9e');
  },
  potion: (p) => {
    p.rect(6, 1, 4, 2, '#8d6e63');
    p.rect(6, 3, 4, 3, '#dfe6ea');
    p.ovalO(8, 10.5, 5.8, 5, '#7e57c2', INK);
    p.oval(8, 11.5, 4, 3, '#9575cd');
    p.oval(6, 9, 1.5, 1.3, '#ede7f6');
  },
  skate: (p) => {
    p.rect(4, 2, 6, 8, INK);
    p.rect(5, 3, 4, 7, '#e53935');
    p.rect(3, 9, 11, 3, INK);
    p.rect(4, 9, 9, 2, '#e53935');
    p.rect(5, 4, 3, 1, WHITE);
    p.ovalO(5, 13.5, 1.8, 1.8, '#ffca28', INK);
    p.ovalO(11, 13.5, 1.8, 1.8, '#ffca28', INK);
  },
  shoe: (p) => {
    p.ovalO(7, 9, 5, 4, '#1e88e5', INK);
    p.ovalO(10, 11, 5, 2.6, '#1e88e5', INK);
    p.rect(2, 12, 13, 2, WHITE);
    p.rect(2, 14, 13, 1, INK);
    p.dot(6, 7, WHITE);
    p.dot(8, 8, WHITE);
  },
  ultra: (p) => {
    p.ovalO(8, 8, 6.5, 4, '#ffca28', INK);
    p.oval(5, 8, 3, 2.8, '#e53935');
    p.oval(5, 6.5, 1.5, 0.9, '#ffcdd2');
    p.rect(7, 10, 6, 1, '#f9a825');
  },
  redDevil: (p) => devilFace(p, '#e53935', '#8e1b1b'),
  glove: (p) => {
    p.ovalO(9, 7, 5, 5, '#e53935', INK);
    p.ovalO(4, 8.5, 2, 2.6, '#e53935', INK);
    p.rect(5, 11, 8, 4, INK);
    p.rect(6, 11, 6, 3, WHITE);
    p.oval(8, 5, 1.5, 1, '#ff8a80');
  },
  greenDevil: (p) => devilFace(p, '#43a047', '#1b5e20'),
  devil: (p) => devilFace(p, '#8e24aa', '#4a148c'),
  cloak: (p) => {
    p.ovalO(8, 7, 5.5, 5.5, '#eceff1', INK);
    p.rect(3, 7, 11, 6, INK);
    p.rect(4, 7, 9, 6, '#eceff1');
    for (let x = 3; x < 14; x += 3) p.rect(x, 13, 2, 2, INK);
    p.rect(6, 6, 1, 2, INK);
    p.rect(9, 6, 1, 2, INK);
  },
  turtle: (p) => turtleIcon(p, false),
  owl: (p) => {
    p.ovalO(8, 9, 6, 6, '#a1887f', INK);
    p.oval(8, 11, 3.5, 3, '#d7ccc8');
    p.ovalO(5.5, 7.5, 2.2, 2.2, '#ffe082', INK);
    p.ovalO(10.5, 7.5, 2.2, 2.2, '#ffe082', INK);
    p.dot(5, 7, INK);
    p.dot(10, 7, INK);
    p.rect(7, 9, 2, 2, ORANGE);
    p.rect(3, 2, 2, 2, '#7d5d52');
    p.rect(11, 2, 2, 2, '#7d5d52');
  },
  ufo: (p) => {
    p.ovalO(8, 7, 3.8, 3.5, '#80deea', INK);
    p.oval(7, 6, 1.3, 1, WHITE);
    p.ovalO(8, 10, 7.5, 2.8, '#b0bec5', INK);
    p.dot(4, 10, '#ffd54f');
    p.dot(8, 11, '#ff7043');
    p.dot(12, 10, '#ffd54f');
  },
  pirateTurtle: (p) => turtleIcon(p, true),
  needle: (p) => {
    p.line(3, 13, 12, 4, '#90a4ae');
    p.line(4, 13, 13, 4, '#cfd8dc');
    p.dot(12, 3, INK);
    p.dot(13, 3, INK);
    p.line(13, 3, 14, 8, '#e53935');
    p.line(14, 8, 11, 11, '#e53935');
  },
  dart: (p) => {
    p.line(2, 14, 11, 5, '#795548');
    p.line(3, 14, 12, 5, '#8d6e63');
    p.rect(11, 2, 3, 3, '#cfd8dc');
    p.rect(12, 1, 2, 2, '#eceff1');
    p.rect(1, 11, 3, 2, '#e53935');
    p.rect(3, 13, 2, 3, '#e53935');
  },
  spring: (p) => {
    p.rect(3, 2, 10, 2, '#607d8b');
    for (let k = 0; k < 5; k++) p.line(k % 2 ? 12 : 4, 4 + k * 2, k % 2 ? 4 : 12, 6 + k * 2, '#b0bec5');
    p.rect(3, 13, 10, 2, '#607d8b');
  },
  banana: (p) => {
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI * (0.15 + (k / 8) * 0.7);
      p.oval(8 - Math.cos(a) * 5, 12 - Math.sin(a) * 6, 2, 2, k % 3 ? '#ffd54f' : '#fbc02d');
    }
    p.dot(2, 9, '#6d4c41');
  },
  iceSkate: (p) => {
    p.rect(4, 2, 6, 8, INK);
    p.rect(5, 3, 4, 7, WHITE);
    p.rect(3, 9, 10, 3, INK);
    p.rect(4, 9, 8, 2, WHITE);
    p.rect(5, 12, 1, 2, '#90a4ae');
    p.rect(10, 12, 1, 2, '#90a4ae');
    p.rect(2, 14, 12, 1, '#90a4ae');
  },
};

export function itemSprite(t: ItemType): HTMLCanvasElement {
  return cached(`item:${t}`, () => sprite(16, 16, (p) => ITEM_PAINT[t](p)));
}
