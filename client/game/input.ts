import type { Dir } from '../../shared/types';

const DIR_KEYS: Record<string, Dir> = {
  ArrowUp: 1,
  ArrowDown: 2,
  ArrowLeft: 3,
  ArrowRight: 4,
  KeyW: 1,
  KeyS: 2,
  KeyA: 3,
  KeyD: 4,
};
// Ctrl is the original item key; Z (Mac, where Ctrl+arrows switch desktops) and K (WASD layout) also work.
const BALLOON_KEYS = new Set(['Space', 'KeyJ']);
const ITEM_KEYS = new Set(['ControlLeft', 'ControlRight', 'KeyZ', 'KeyK']);

/** Tracks held directions (newest wins, the previous one is the fallback) and edge-triggered actions. */
export class Input {
  enabled = true;
  private held: Dir[] = [];
  private last = '';

  constructor(
    private readonly onDir: (d1: Dir, d2: Dir) => void,
    private readonly onAction: (a: 'b' | 'u') => void,
  ) {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.reset);
  }

  detach(): void {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.reset);
  }

  readonly reset = (): void => {
    this.held = [];
    this.emit();
  };

  private readonly down = (e: KeyboardEvent): void => {
    if (!this.enabled) return;
    const d = DIR_KEYS[e.code];
    if (d !== undefined) {
      e.preventDefault();
      this.held = this.held.filter((x) => x !== d);
      this.held.push(d);
      this.emit();
    } else if (BALLOON_KEYS.has(e.code)) {
      e.preventDefault();
      if (!e.repeat) this.onAction('b');
    } else if (ITEM_KEYS.has(e.code)) {
      e.preventDefault();
      if (!e.repeat) this.onAction('u');
    }
  };

  private readonly up = (e: KeyboardEvent): void => {
    const d = DIR_KEYS[e.code];
    if (d === undefined) return;
    this.held = this.held.filter((x) => x !== d);
    this.emit();
  };

  private emit(): void {
    const d1 = this.held[this.held.length - 1] ?? 0;
    const d2 = this.held[this.held.length - 2] ?? 0;
    const key = `${d1},${d2}`;
    if (key === this.last) return;
    this.last = key;
    this.onDir(d1, d2);
  }
}
