import type { ThemeKey } from '../../shared/maps';
import { INK, WHITE, cached, sprite, type Px } from './art';

type FloorStyle = 'grass' | 'plank' | 'snow' | 'plate' | 'sand' | 'candy' | 'dirt' | 'stone';
type HardStyle = 'house' | 'tree' | 'mast' | 'rock' | 'machine' | 'sandstone' | 'candy' | 'tomb' | 'pillar' | 'brick';
type SoftStyle = 'crate' | 'snow' | 'gift' | 'pot';

export interface Theme {
  floor: FloorStyle;
  floorA: string;
  floorB: string;
  floorMark: string;
  hard: HardStyle;
  hardMain: string;
  hardDark: string;
  hardLight: string;
  hardAccent: string;
  soft: SoftStyle;
  softMain: string;
  softDark: string;
  softLight: string;
  softAccent: string;
  bush: string;
  bushDark: string;
  bushLight: string;
  /** colour around the field (side panel) */
  panel: string;
  music: number;
}

const WOOD = { softMain: '#d9a066', softDark: '#8a5a2b', softLight: '#f0c58a', softAccent: '#f0c58a' };

export const THEMES: Record<ThemeKey, Theme> = {
  village: {
    floor: 'grass', floorA: '#8fd16d', floorB: '#83c862', floorMark: '#62a94a',
    hard: 'house', hardMain: '#f6e7c8', hardDark: '#8a5a3b', hardLight: '#ff9b8a', hardAccent: '#e3584a',
    soft: 'crate', ...WOOD,
    bush: '#3f9e4d', bushDark: '#246b30', bushLight: '#7fd36f',
    panel: '#2f6aa3', music: 0,
  },
  jungle: {
    floor: 'grass', floorA: '#63b050', floorB: '#58a647', floorMark: '#3d8a35',
    hard: 'tree', hardMain: '#2f9a45', hardDark: '#1b6b2c', hardLight: '#6fd36a', hardAccent: '#8d5a35',
    soft: 'crate', softMain: '#b07d4a', softDark: '#6b4423', softLight: '#d6a56d', softAccent: '#d6a56d',
    bush: '#2f8f3a', bushDark: '#1a5e24', bushLight: '#69c95c',
    panel: '#2e6b3a', music: 2,
  },
  pirate: {
    floor: 'plank', floorA: '#c99359', floorB: '#bf894f', floorMark: '#8a5a2b',
    hard: 'mast', hardMain: '#7a5240', hardDark: '#4e3328', hardLight: '#b08a5a', hardAccent: '#c9a227',
    soft: 'crate', ...WOOD,
    bush: '#3f9e4d', bushDark: '#246b30', bushLight: '#7fd36f',
    panel: '#22597f', music: 0,
  },
  snow: {
    floor: 'snow', floorA: '#eef6fb', floorB: '#e2eef6', floorMark: '#c3dcec',
    hard: 'rock', hardMain: '#9cc6de', hardDark: '#5f8fae', hardLight: '#e1f2fb', hardAccent: '#ffffff',
    soft: 'snow', softMain: '#ffffff', softDark: '#a9cbe0', softLight: '#ffffff', softAccent: '#d7e9f4',
    bush: '#4f9c7a', bushDark: '#2b6b52', bushLight: '#9fd8bd',
    panel: '#3f7ca6', music: 2,
  },
  factory: {
    floor: 'plate', floorA: '#a3acb5', floorB: '#99a2ab', floorMark: '#77818b',
    hard: 'machine', hardMain: '#5b6770', hardDark: '#38424a', hardLight: '#83919b', hardAccent: '#f2c230',
    soft: 'crate', softMain: '#b6c3cb', softDark: '#6c7b85', softLight: '#dbe4ea', softAccent: '#f2c230',
    bush: '#3f9e4d', bushDark: '#246b30', bushLight: '#7fd36f',
    panel: '#3c4752', music: 2,
  },
  pyramid: {
    floor: 'sand', floorA: '#efd594', floorB: '#e7cb87', floorMark: '#c9a861',
    hard: 'sandstone', hardMain: '#d1a865', hardDark: '#93703a', hardLight: '#f1d39a', hardAccent: '#b8862f',
    soft: 'pot', softMain: '#c86e3d', softDark: '#7f3d1d', softLight: '#ec9a66', softAccent: '#2f8f8a',
    bush: '#7f9c43', bushDark: '#4f6b26', bushLight: '#b4cf6c',
    panel: '#9b6a2f', music: 1,
  },
  candy: {
    floor: 'candy', floorA: '#ffd1e3', floorB: '#ffe6f0', floorMark: '#ff9ec4',
    hard: 'candy', hardMain: '#ffffff', hardDark: '#c43d63', hardLight: '#ffd1e3', hardAccent: '#e8496f',
    soft: 'gift', softMain: '#8fd3ff', softDark: '#3f8fc4', softLight: '#c9eaff', softAccent: '#ff6fa8',
    bush: '#3f9e4d', bushDark: '#246b30', bushLight: '#7fd36f',
    panel: '#c9507e', music: 0,
  },
  graveyard: {
    floor: 'dirt', floorA: '#5d6b50', floorB: '#566448', floorMark: '#3f4b37',
    hard: 'tomb', hardMain: '#a3a9ae', hardDark: '#5f666c', hardLight: '#cfd4d8', hardAccent: '#7cb342',
    soft: 'crate', softMain: '#7a6450', softDark: '#45372b', softLight: '#9c8468', softAccent: '#9c8468',
    bush: '#4c6b3d', bushDark: '#2c4224', bushLight: '#7e9a64',
    panel: '#2b3040', music: 1,
  },
  arena: {
    floor: 'stone', floorA: '#ddcfae', floorB: '#d3c4a2', floorMark: '#b3a27c',
    hard: 'pillar', hardMain: '#cdbb94', hardDark: '#8f7d58', hardLight: '#efe2c4', hardAccent: '#c9a227',
    soft: 'crate', ...WOOD,
    bush: '#3f9e4d', bushDark: '#246b30', bushLight: '#7fd36f',
    panel: '#8a5a2b', music: 2,
  },
  maze: {
    floor: 'stone', floorA: '#a39c88', floorB: '#9a937f', floorMark: '#7c7562',
    hard: 'brick', hardMain: '#86785f', hardDark: '#56493a', hardLight: '#ab9c80', hardAccent: '#56493a',
    soft: 'crate', ...WOOD,
    bush: '#4f8a43', bushDark: '#2e5a27', bushLight: '#86bf6c',
    panel: '#56493a', music: 1,
  },
};

// ---------------------------------------------------------------- static tiles (20 x 20, blocks 20 x 24)

export function floorSprite(key: ThemeKey, alt: boolean, v: number): HTMLCanvasElement {
  const t = THEMES[key];
  return cached(`floor:${key}:${alt ? 1 : 0}:${v}`, () =>
    sprite(20, 20, (p) => {
      p.rect(0, 0, 20, 20, alt ? t.floorA : t.floorB);
      const m = t.floorMark;
      const spots: [number, number][] = [
        [3, 4],
        [14, 12],
        [8, 15],
        [15, 3],
      ];
      const pick = spots.filter((_, k) => (v + k) % 2 === 0);
      switch (t.floor) {
        case 'grass':
        case 'dirt':
          for (const [x, y] of pick) {
            p.dot(x, y, m);
            p.dot(x + 1, y - 1, m);
            p.dot(x + 2, y, m);
          }
          if (t.floor === 'dirt' && v % 3 === 0) p.oval(10, 9, 2.5, 1.5, m);
          break;
        case 'plank':
          for (const y of [4, 9, 14, 19]) p.rect(0, y, 20, 1, m);
          p.rect((v * 7) % 20, 0, 1, 4, m);
          p.rect((v * 7 + 10) % 20, 5, 1, 4, m);
          p.rect((v * 3 + 4) % 20, 10, 1, 4, m);
          p.rect((v * 5 + 14) % 20, 15, 1, 4, m);
          break;
        case 'snow':
          for (const [x, y] of pick) p.dot(x, y, WHITE);
          p.dot(10, 8 + (v % 3), m);
          break;
        case 'plate':
          p.rect(0, 0, 20, 1, m);
          p.rect(0, 0, 1, 20, m);
          for (const [x, y] of [
            [2, 2],
            [17, 2],
            [2, 17],
            [17, 17],
          ] as const)
            p.dot(x, y, m);
          break;
        case 'sand':
          for (const [x, y] of pick) p.rect(x, y, 3, 1, m);
          break;
        case 'candy':
          for (const [x, y] of pick) p.rect(x, y, 2, 1, ['#ff6fa8', '#8fd3ff', '#ffd54f', '#9be88a'][(x + y + v) % 4]!);
          break;
        case 'stone':
          p.rect(0, 19, 20, 1, m);
          p.rect(19, 0, 1, 20, m);
          if (v === 1) p.line(4, 6, 8, 9, m);
          break;
      }
    }),
  );
}

export function hardSprite(key: ThemeKey): HTMLCanvasElement {
  const t = THEMES[key];
  return cached(`hard:${key}`, () => sprite(20, 24, (p) => HARD[t.hard](p, t)));
}

const HARD: Record<HardStyle, (p: Px, t: Theme) => void> = {
  house: (p, t) => {
    p.rect(2, 11, 16, 12, INK);
    p.rect(3, 12, 14, 10, t.hardMain);
    p.rect(1, 9, 18, 4, INK);
    p.rect(2, 10, 16, 2, t.hardAccent);
    p.rect(3, 6, 14, 4, INK);
    p.rect(4, 6, 12, 4, t.hardAccent);
    p.rect(5, 3, 10, 4, INK);
    p.rect(6, 3, 8, 4, t.hardAccent);
    p.rect(7, 1, 6, 3, INK);
    p.rect(8, 2, 4, 2, t.hardAccent);
    p.rect(6, 4, 3, 1, t.hardLight);
    p.rect(4, 7, 3, 1, t.hardLight);
    p.rect(8, 16, 4, 6, t.hardDark);
    p.dot(11, 19, '#ffd54f');
    p.rect(4, 14, 3, 3, '#9be7ff');
    p.rect(13, 14, 3, 3, '#9be7ff');
    p.rect(2, 22, 16, 1, INK);
  },
  tree: (p, t) => {
    p.rect(8, 15, 4, 8, INK);
    p.rect(9, 15, 2, 7, t.hardAccent);
    p.ovalO(10, 9, 9, 8, t.hardMain, INK);
    p.oval(10, 12, 7, 4, t.hardDark);
    p.oval(10, 9, 7, 5, t.hardMain);
    p.oval(7, 6, 3, 2, t.hardLight);
    p.dot(13, 5, t.hardLight);
    p.rect(6, 22, 8, 1, INK);
  },
  mast: (p, t) => {
    p.rect(1, 5, 18, 18, INK);
    p.rect(2, 6, 16, 16, t.hardMain);
    p.rect(2, 6, 16, 3, t.hardLight);
    p.rect(2, 13, 16, 1, t.hardDark);
    p.rect(2, 18, 16, 1, t.hardDark);
    p.rect(5, 9, 1, 13, t.hardAccent);
    p.rect(14, 9, 1, 13, t.hardAccent);
  },
  rock: (p, t) => {
    p.ovalO(10, 14, 9.5, 9, t.hardMain, INK);
    p.oval(11, 17, 7.5, 5, t.hardDark);
    p.oval(9, 13, 7, 6, t.hardMain);
    p.oval(7, 9, 3, 2, t.hardLight);
    p.line(12, 8, 15, 14, t.hardDark);
  },
  machine: (p, t) => {
    p.rect(1, 4, 18, 19, INK);
    p.rect(2, 5, 16, 17, t.hardMain);
    p.rect(2, 5, 16, 3, t.hardLight);
    p.rect(4, 10, 12, 6, t.hardDark);
    p.dot(6, 12, '#66bb6a');
    p.dot(9, 12, t.hardAccent);
    p.dot(12, 12, '#ef5350');
    p.rect(5, 14, 10, 1, '#4dd0e1');
    p.rect(4, 18, 12, 1, t.hardDark);
    p.rect(4, 20, 12, 1, t.hardDark);
  },
  sandstone: (p, t) => {
    p.rect(0, 4, 20, 19, INK);
    p.rect(1, 5, 18, 17, t.hardMain);
    p.rect(1, 5, 18, 4, t.hardLight);
    p.rect(1, 13, 18, 1, t.hardDark);
    p.rect(10, 9, 1, 4, t.hardDark);
    p.rect(5, 14, 1, 8, t.hardDark);
    p.rect(14, 14, 1, 8, t.hardDark);
    p.rect(1, 21, 18, 1, t.hardDark);
  },
  candy: (p, t) => {
    p.rect(4, 3, 12, 20, INK);
    p.rect(5, 4, 10, 18, WHITE);
    for (let y = 4; y < 22; y++) for (let x = 5; x < 15; x++) if (((x + y) >> 2) % 2 === 0) p.dot(x, y, t.hardAccent);
    p.ovalO(10, 4, 6, 2.5, t.hardLight, INK);
    p.rect(6, 6, 1, 14, 'rgba(255,255,255,0.6)');
  },
  tomb: (p, t) => {
    p.oval(10, 22, 9, 2, t.hardDark);
    p.oval(10, 8, 7, 6, INK);
    p.rect(3, 8, 14, 14, INK);
    p.oval(10, 8, 6, 5, t.hardMain);
    p.rect(4, 8, 12, 13, t.hardMain);
    p.rect(9, 9, 2, 8, t.hardDark);
    p.rect(7, 11, 6, 2, t.hardDark);
    p.oval(7, 5, 1.5, 1, t.hardLight);
    p.dot(5, 19, t.hardAccent);
    p.dot(6, 20, t.hardAccent);
    p.dot(14, 20, t.hardAccent);
  },
  pillar: (p, t) => {
    p.rect(3, 3, 14, 4, INK);
    p.rect(4, 4, 12, 2, t.hardLight);
    p.rect(5, 6, 10, 15, INK);
    p.rect(6, 6, 8, 15, t.hardMain);
    p.rect(8, 7, 1, 13, t.hardDark);
    p.rect(11, 7, 1, 13, t.hardDark);
    p.rect(3, 20, 14, 3, INK);
    p.rect(4, 20, 12, 2, t.hardLight);
  },
  brick: (p, t) => {
    p.rect(0, 3, 20, 20, INK);
    p.rect(1, 4, 18, 18, t.hardMain);
    p.rect(1, 4, 18, 3, t.hardLight);
    for (const y of [10, 14, 18]) p.rect(1, y, 18, 1, t.hardDark);
    for (const [x, y] of [
      [6, 7],
      [14, 7],
      [10, 11],
      [4, 15],
      [13, 15],
      [8, 19],
      [16, 19],
    ] as const)
      p.rect(x, y, 1, 3, t.hardDark);
  },
};

export function softSprite(key: ThemeKey): HTMLCanvasElement {
  const t = THEMES[key];
  return cached(`soft:${key}`, () => sprite(20, 24, (p) => SOFT[t.soft](p, t)));
}

const SOFT: Record<SoftStyle, (p: Px, t: Theme) => void> = {
  crate: (p, t) => {
    p.rect(1, 4, 18, 19, INK);
    p.rect(2, 5, 16, 17, t.softMain);
    p.rect(2, 5, 16, 3, t.softLight);
    p.rect(4, 9, 12, 11, t.softDark);
    p.rect(5, 10, 10, 9, t.softMain);
    p.line(5, 18, 14, 10, t.softDark);
    p.line(6, 18, 14, 11, t.softDark);
    for (const [x, y] of [
      [3, 9],
      [16, 9],
      [3, 20],
      [16, 20],
    ] as const)
      p.dot(x, y, t.softDark);
  },
  snow: (p, t) => {
    p.ovalO(10, 14, 9, 8.5, t.softMain, t.softDark);
    p.oval(11, 17, 7, 4.5, t.softAccent);
    p.oval(9, 13, 7, 6, t.softMain);
    p.oval(7, 9, 3, 2, WHITE);
    p.dot(13, 12, t.softDark);
    p.dot(6, 17, t.softDark);
  },
  gift: (p, t) => {
    p.rect(2, 8, 16, 15, INK);
    p.rect(3, 9, 14, 13, t.softMain);
    p.rect(1, 6, 18, 4, INK);
    p.rect(2, 7, 16, 2, t.softLight);
    p.rect(9, 6, 2, 16, t.softAccent);
    p.rect(3, 13, 14, 2, t.softAccent);
    p.ovalO(7, 4.5, 2.6, 2, t.softAccent, INK);
    p.ovalO(13, 4.5, 2.6, 2, t.softAccent, INK);
  },
  pot: (p, t) => {
    p.ovalO(10, 15, 8.5, 7.5, t.softMain, INK);
    p.rect(6, 4, 8, 5, INK);
    p.rect(7, 5, 6, 4, t.softMain);
    p.rect(5, 3, 10, 2, INK);
    p.rect(6, 3, 8, 1, t.softLight);
    p.rect(3, 13, 14, 2, t.softAccent);
    p.oval(6.5, 12, 1.5, 2.5, t.softLight);
  },
};

export function barrelSprite(): HTMLCanvasElement {
  return cached('barrel', () =>
    sprite(20, 24, (p) => {
      p.ovalO(10, 14, 8, 9.5, '#a1693c', INK);
      p.oval(12, 15, 5, 7.5, '#8a5630');
      p.rect(2, 9, 16, 2, '#4e342e');
      p.rect(2, 18, 16, 2, '#4e342e');
      p.ovalO(10, 5.5, 6.5, 2.5, '#c58b55', INK);
      p.oval(6, 12, 1.2, 3, '#c58b55');
    }),
  );
}

export function bushSprite(key: ThemeKey): HTMLCanvasElement {
  const t = THEMES[key];
  return cached(`bush:${key}`, () =>
    sprite(20, 22, (p) => {
      p.ovalO(5.5, 14, 5.5, 6, t.bush, INK);
      p.ovalO(14.5, 14, 5.5, 6, t.bush, INK);
      p.ovalO(10, 9, 6.5, 6.5, t.bush, INK);
      p.ovalO(10, 16, 8, 5.5, t.bush, INK);
      p.oval(10, 18, 6.5, 3, t.bushDark);
      p.oval(8, 7, 2, 1.5, t.bushLight);
      p.dot(4, 11, t.bushLight);
      p.dot(15, 12, t.bushLight);
      p.dot(12, 14, t.bushLight);
    }),
  );
}

// ---------------------------------------------------------------- animated tiles

export function waterSprite(frame: number): HTMLCanvasElement {
  return cached(`water:${frame}`, () =>
    sprite(20, 20, (p) => {
      p.rect(0, 0, 20, 20, '#3a8ee0');
      p.rect(0, 0, 20, 2, '#2c6fb5');
      const o = frame * 3;
      for (const y of [6, 13]) {
        p.rect((2 + o) % 20, y, 5, 1, '#8fd0ff');
        p.rect((12 + o) % 20, y + 3, 4, 1, '#8fd0ff');
      }
    }),
  );
}

export function iceSprite(): HTMLCanvasElement {
  return cached('ice', () =>
    sprite(20, 20, (p) => {
      p.rect(0, 0, 20, 20, '#bfe8f7');
      p.rect(0, 0, 20, 1, '#a2d7ec');
      p.rect(0, 0, 1, 20, '#a2d7ec');
      p.line(3, 13, 9, 7, WHITE);
      p.line(4, 15, 12, 7, WHITE);
      p.dot(15, 14, WHITE);
    }),
  );
}

/** Belt pointing in `dir` (1 up, 2 down, 3 left, 4 right); chevrons scroll with `frame` (0..3). */
export function conveyorSprite(dir: number, frame: number): HTMLCanvasElement {
  return cached(`belt:${dir}:${frame}`, () => {
    const right = sprite(20, 20, (p) => {
      p.rect(0, 0, 20, 20, '#4f5a63');
      p.rect(0, 0, 20, 3, '#2f3840');
      p.rect(0, 17, 20, 3, '#2f3840');
      for (let k = -1; k < 3; k++) {
        const x = k * 8 + frame * 2;
        for (let i = 0; i < 4; i++) {
          p.dot(x + i, 6 + i, '#f2c230');
          p.dot(x + i, 13 - i, '#f2c230');
          p.dot(x + i + 1, 6 + i, '#f2c230');
          p.dot(x + i + 1, 13 - i, '#f2c230');
        }
      }
    });
    if (dir === 4) return right;
    const cv = document.createElement('canvas');
    cv.width = 20;
    cv.height = 20;
    const ctx = cv.getContext('2d')!;
    ctx.translate(10, 10);
    ctx.rotate(dir === 3 ? Math.PI : dir === 1 ? -Math.PI / 2 : Math.PI / 2);
    ctx.drawImage(right, -10, -10);
    return cv;
  });
}

export function portalSprite(frame: number): HTMLCanvasElement {
  return cached(`portal:${frame}`, () =>
    sprite(20, 20, (p) => {
      p.ovalO(10, 10, 9, 9, '#7e57c2', INK);
      p.oval(10, 10, 6.5, 6.5, '#4527a0');
      p.oval(10, 10, 3.5, 3.5, '#4dd0e1');
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + (frame / 8) * Math.PI * 2;
        p.rect(10 + Math.cos(a) * 5.5 - 1, 10 + Math.sin(a) * 5.5 - 1, 2, 2, '#b39ddb');
      }
    }),
  );
}
