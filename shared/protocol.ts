import type { Dir } from './types';

export type Mode = 'ffa' | 'team';
export type TeamAssign = 'free' | 'random';
export type RoomPhase = 'waiting' | 'playing' | 'results';

export interface PlayerStats {
  kills: number;
  rescues: number;
  trapped: number;
  items: number;
}

/** Player state in a snapshot. Short keys keep the 60 Hz stream small. */
export interface SnapPlayer {
  i: string; // id
  x: number;
  y: number;
  f: Dir; // facing
  m: 0 | 1; // moving
  s: 0 | 1 | 2; // alive, trapped, dead
  tt: number; // trapped ticks left
  dm: number; // dismount ticks left
  mt: string; // mount code ('' = none)
  a: number; // jump progress 0..1 (0 = on the ground)
  b: number; // balloons
  w: number; // stream length
  v: number; // speed level
  k: 0 | 1; // can kick
  g: 0 | 1; // has glove
  it: string; // active item code
  n: number; // active item count
  cu: string; // curse: 'r' reverse, 'a' auto-balloon
  cl: number; // cloak ticks left
  dc: 0 | 1; // disconnected
}

export interface SnapBalloon {
  i: number;
  x: number;
  y: number;
  o: string; // owner id
  f: number; // fuse ticks left
  z: number; // throw progress 0..1 (0 = on the ground)
}

export interface SnapBlast {
  i: number;
  c: number;
  r: number;
  a: [number, number, number, number]; // arm length up, down, left, right
  t: number; // ticks left
}

export interface SnapDart {
  x: number;
  y: number;
  d: Dir;
}

export type FxKind =
  | 'go'
  | 'place'
  | 'boom'
  | 'break'
  | 'trap'
  | 'free'
  | 'pop'
  | 'pick'
  | 'kick'
  | 'throw'
  | 'dart'
  | 'banana'
  | 'slip'
  | 'jump'
  | 'dismount'
  | 'needle'
  | 'push'
  | 'portal'
  | 'end';

export interface Fx {
  k: FxKind;
  x?: number;
  y?: number;
  id?: string;
  by?: string;
  item?: string;
}

export interface Snapshot {
  k: number; // tick
  ph: 0 | 1 | 2; // countdown, play, over
  cd: number; // countdown ticks left
  tl: number; // time left in ticks
  p: SnapPlayer[];
  b: SnapBalloon[];
  e: SnapBlast[];
  d: SnapDart[];
  n: number[]; // banana tile indexes
  g?: string; // tile grid, sent when it changed
  i?: string; // floor items, sent when they changed
  fx: Fx[];
}

export interface GamePlayerInfo {
  id: string;
  name: string;
  char: number;
  color: number;
  team: number; // -1 in free-for-all
  slot: number; // 0..3, shown as P1..P4
}

export interface GameStartInfo {
  map: number;
  mode: Mode;
  time: number;
  players: GamePlayerInfo[];
}

export interface GameResult {
  draw: boolean;
  winners: string[];
  reason: 'ko' | 'time';
  stats: Record<string, PlayerStats>;
}

export interface RoomSummary {
  id: number;
  name: string;
  host: string;
  map: number;
  players: number;
  phase: RoomPhase;
  locked: boolean;
}

export interface RoomMember {
  id: string;
  name: string;
  char: number;
  color: number;
  team: number;
  slot: number;
  ready: boolean;
  host: boolean;
  connected: boolean;
  ping: number;
}

export interface RoomConfig {
  map: number; // -1 = random
  mode: Mode;
  assign: TeamAssign;
  time: number; // seconds
}

export interface RoomView {
  id: number;
  name: string;
  locked: boolean;
  phase: RoomPhase;
  config: RoomConfig;
  members: RoomMember[];
}

export type C2S =
  | { t: 'hello'; name: string; token?: string }
  | { t: 'create'; name: string; password?: string }
  | { t: 'join'; room: number; password?: string }
  | { t: 'quick' }
  | { t: 'leave' }
  | { t: 'pick'; char?: number; color?: number; team?: number }
  | { t: 'ready'; ready: boolean }
  | { t: 'chat'; text: string }
  | { t: 'config'; map?: number; mode?: Mode; assign?: TeamAssign; time?: number }
  | { t: 'kick'; id: string }
  | { t: 'start' }
  | { t: 'in'; d: Dir; d2: Dir }
  | { t: 'act'; a: 'b' | 'u' }
  | { t: 'ping'; c: number; r?: number };

export type S2C =
  | { t: 'welcome'; id: string; token: string; name: string }
  | { t: 'lobby'; rooms: RoomSummary[]; online: number }
  | { t: 'room'; room: RoomView }
  | { t: 'chat'; from: string | null; name: string; text: string }
  | { t: 'start'; game: GameStartInfo }
  | { t: 'snap'; s: Snapshot }
  | { t: 'end'; result: GameResult }
  | { t: 'pong'; c: number }
  | { t: 'error'; code: string; msg: string }
  | { t: 'kicked' };
