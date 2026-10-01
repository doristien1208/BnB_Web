export const TILE = 40;
export const COLS = 15;
export const ROWS = 13;
export const FIELD_W = COLS * TILE;
export const FIELD_H = ROWS * TILE;
export const VIEW_W = 800;
export const VIEW_H = 600;
export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;
export const MAX_PLAYERS = 4;

export const sec = (s: number) => Math.round(s * TICK_RATE);

/**
 * Gameplay tunables. Values the original game never published are marked 暫定
 * in the design doc and can be adjusted here after play-testing.
 */
export const RULES = {
  fuse: sec(3),
  streamLinger: sec(0.5),
  trapped: sec(5),
  trappedSpeed: 20, // px/s, 0.5 tile/s
  dismount: sec(0.5),
  curse: sec(10),
  cloak: sec(10),
  portalCooldown: sec(1),
  conveyorSpeed: 80, // px/s, 2 tiles/s
  pushDelay: sec(0.3),
  kickSpeed: 320, // px/s
  throwTiles: 3,
  throwTime: sec(0.35),
  dartSpeed: 600, // px/s
  springMaxTiles: 3,
  springTime: sec(0.3),
  dropRate: 0.45,
  countdown: sec(3),
  touch: 30, // px: centre distance on both axes that counts as touching
  hitbox: 32, // px: player collision box
  tileHysteresis: 6, // px past a tile edge before the player counts as standing on the next tile
  laneSnap: 10, // px: max lane offset that still kicks a balloon or pushes a barrel ahead
  disconnectGrace: sec(30),
  resultsMs: 8000,
} as const;

/** Movement speed in px/s for speed level 1–10 (turtle = 1, UFO = 10). */
export const speedPx = (level: number) => 60 + 20 * level;

export const TIME_OPTIONS = [120, 180, 300] as const;
