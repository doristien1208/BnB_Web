/** Shown on the entry screen and in /healthz, so a deployment can be checked at a glance. */
export const VERSION = '0.3.0';

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
  mountInvuln: sec(1), // after losing a mount, streams cannot hit the rider (chained blasts count once)
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
  // shrink: from 55 s left, the outermost open ring closes every 10 s, 4 rings at most
  shrinkStart: sec(55),
  shrinkEvery: sec(10),
  shrinkRings: 4,
  shrinkWarn: sec(3), // the ring flashes this long before it closes
  // supply drops: every 30 s, two basic items (balloon, potion or skate) fall onto random free tiles
  supplyEvery: sec(30),
  supplyCount: 2,
  supplyFall: sec(1),
  // the balloon machine in 水球工廠
  machineEvery: sec(20),
  machineMin: 4,
  machineMax: 8,
  machinePow: 2,
  // deathmatch: the dead come back where they fell, then nothing can trap them for a moment
  respawn: sec(3),
  respawnInvuln: sec(1.5),
  // the tank of 野戰前線: fires balloons forward like a kick and holds this many more of them
  tankExtra: 2,
  // 程式碼空間: from codeStart, every codeEveryMin–codeEveryMax 1–2 regions throw an error for codeError, with
  // no warning; anyone standing on an error moves at codeSlow of their speed, and the first time an error
  // catches a player their screen crashes (covered by glitches) for codeCrash
  codeStart: sec(10),
  codeEveryMin: sec(6),
  codeEveryMax: sec(10),
  codeError: sec(3),
  codeSlow: 0.3,
  codeCrash: sec(1.2),
  // the pirate eyepatch: turtles and owls run this many speed levels faster
  eyepatchBonus: 2,
} as const;

/** Movement speed in px/s for speed level 1–10 (turtle = 1, UFO = 10). */
export const speedPx = (level: number) => 60 + 20 * level;

export const TIME_OPTIONS = [120, 180, 300] as const;
