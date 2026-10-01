import { TIME_OPTIONS } from '../shared/constants';
import type { C2S } from '../shared/protocol';
import { isDir } from '../shared/types';

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v : null);
const int = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;

/** Parses and validates one client message; anything malformed is dropped. */
export function parseC2S(raw: string): C2S | null {
  if (raw.length > 2048) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  switch (m.t) {
    case 'hello': {
      const name = str(m.name, 64);
      return name === null ? null : { t: 'hello', name, token: str(m.token, 64) ?? undefined };
    }
    case 'create': {
      const name = str(m.name, 64);
      return name === null ? null : { t: 'create', name, password: str(m.password, 32) ?? undefined };
    }
    case 'join': {
      const room = int(m.room, 1, 1e9);
      return room === null ? null : { t: 'join', room, password: str(m.password, 32) ?? undefined };
    }
    case 'quick':
      return { t: 'quick' };
    case 'leave':
      return { t: 'leave' };
    case 'pick': {
      const out: { t: 'pick'; char?: number; color?: number; team?: number } = { t: 'pick' };
      if (m.char !== undefined) out.char = int(m.char, 0, 5) ?? undefined;
      if (m.color !== undefined) out.color = int(m.color, 0, 7) ?? undefined;
      if (m.team !== undefined) out.team = int(m.team, 0, 1) ?? undefined;
      return out;
    }
    case 'ready':
      return typeof m.ready === 'boolean' ? { t: 'ready', ready: m.ready } : null;
    case 'chat': {
      const text = str(m.text, 500);
      return text === null ? null : { t: 'chat', text };
    }
    case 'config': {
      const out: { t: 'config'; map?: number; mode?: 'ffa' | 'team'; assign?: 'free' | 'random'; time?: number } = {
        t: 'config',
      };
      if (m.map !== undefined) out.map = int(m.map, -1, 9) ?? undefined;
      if (m.mode === 'ffa' || m.mode === 'team') out.mode = m.mode;
      if (m.assign === 'free' || m.assign === 'random') out.assign = m.assign;
      if (typeof m.time === 'number' && (TIME_OPTIONS as readonly number[]).includes(m.time)) out.time = m.time;
      return out;
    }
    case 'kick': {
      const id = str(m.id, 32);
      return id ? { t: 'kick', id } : null;
    }
    case 'start':
      return { t: 'start' };
    case 'in':
      return isDir(m.d) && isDir(m.d2) ? { t: 'in', d: m.d, d2: m.d2 } : null;
    case 'act':
      return m.a === 'b' || m.a === 'u' ? { t: 'act', a: m.a } : null;
    case 'ping': {
      if (typeof m.c !== 'number' || !Number.isFinite(m.c)) return null;
      const r = typeof m.r === 'number' && Number.isFinite(m.r) ? Math.max(0, Math.min(9999, Math.round(m.r))) : undefined;
      return { t: 'ping', c: m.c, r };
    }
    default:
      return null;
  }
}

/** Strips control characters, collapses whitespace and trims to `max` characters. */
export function cleanText(raw: string, max: number): string {
  return [...raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()].slice(0, max).join('');
}
