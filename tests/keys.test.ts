import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BINDINGS,
  isKey,
  keyLabel,
  keyProblem,
  parseBindings,
  withKey,
  withoutKey,
  type Bindings,
} from '../client/keys';

const copy = (): Bindings => parseBindings(null);

describe('key settings', () => {
  it('start from the original keys, either Ctrl working', () => {
    const b = copy();
    expect(b).toEqual(DEFAULT_BINDINGS);
    expect(isKey(b, 'item', 'ControlRight')).toBe(true);
    expect(isKey(b, 'balloon', 'Space')).toBe(true);
    expect(isKey(b, 'balloon', 'KeyZ')).toBe(false);
  });

  it('refuse movement keys, browser keys and keys another action already has', () => {
    const b = copy();
    expect(keyProblem(b, 'balloon', 0, 'ArrowUp')).toEqual({ kind: 'move' });
    expect(keyProblem(b, 'balloon', 0, 'KeyA')).toEqual({ kind: 'move' });
    for (const code of ['Escape', 'Tab', 'F5', 'MetaLeft', 'Backspace']) expect(keyProblem(b, 'mute', 0, code)?.kind).toBe('reserved');
    expect(keyProblem(b, 'balloon', 2, 'KeyZ')).toEqual({ kind: 'taken', action: 'item', label: '使用道具' });
    expect(keyProblem(b, 'balloon', 2, 'KeyJ')?.kind).toBe('taken'); // its own other slot counts too
    expect(keyProblem(b, 'balloon', 1, 'KeyJ')).toBeNull(); // the same key back into the same slot
    expect(keyProblem(b, 'mute', 0, 'ShiftRight')).toBeNull();
    expect(keyProblem(b, 'mute', 0, '')).toEqual({ kind: 'unknown' }); // a key that reports no position
    expect(keyProblem(b, 'mute', 0, 'Unidentified')).toEqual({ kind: 'unknown' });
  });

  it('change and clear slots, but never leave an action without a key', () => {
    let b = withKey(copy(), 'balloon', 2, 'KeyL');
    expect(b.balloon).toEqual(['Space', 'KeyJ', 'KeyL']);
    b = withoutKey(b, 'balloon', 0)!;
    expect(b.balloon).toEqual(['KeyJ', 'KeyL']);
    expect(withoutKey(b, 'mute', 0)).toBeNull();
    expect(withKey(b, 'item', 0, 'ShiftRight').item[0]).toBe('ShiftLeft');
  });

  it('fall back to the defaults when the saved keys are broken', () => {
    const good = withKey(copy(), 'mute', 0, 'KeyP');
    expect(parseBindings(JSON.stringify(good))).toEqual(good);
    for (const raw of [
      'not json',
      JSON.stringify({ ...good, mute: ['KeyJ'] }), // twice
      JSON.stringify({ ...good, chat: ['ArrowLeft'] }), // a movement key
      JSON.stringify({ ...good, chat: [] }),
      JSON.stringify({ ...good, mute: ['KeyP', 'KeyO'] }), // more keys than slots
      JSON.stringify({ ...good, mute: [''] }), // a key with no position
    ]) {
      expect(parseBindings(raw)).toEqual(DEFAULT_BINDINGS);
    }
  });

  it('name keys the way they are printed on the keyboard', () => {
    expect(['KeyJ', 'Digit1', 'ControlRight', 'Numpad5', 'Space', 'Semicolon'].map(keyLabel)).toEqual([
      'J',
      '1',
      'Ctrl',
      '數字鍵 5',
      'Space',
      ';',
    ]);
  });
});
