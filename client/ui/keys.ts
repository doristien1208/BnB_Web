import { clear, h, toast } from '../dom';
import {
  KEY_ACTIONS,
  isModifier,
  keyLabel,
  keyProblem,
  loadBindings,
  normalizeCode,
  parseBindings,
  problemText,
  saveBindings,
  withKey,
  withoutKey,
  type Bindings,
  type KeyAction,
} from '../keys';

/**
 * Key settings table: click a slot, then press one key. A key another action already has, a key held
 * together with Ctrl / Shift / Alt, or a mouse button gets a warning and the slot keeps waiting for
 * another key; Esc cancels, Backspace empties the slot. Every change is saved at once.
 */
export function keyEditor(): HTMLElement {
  let b: Bindings = loadBindings();
  let capture: { action: KeyAction; slot: number } | null = null;
  /** a lone Ctrl / Shift / Alt counts once it is released without another key in between */
  let held: string | null = null;
  const table = h('table', { class: 'keys key-table' });
  const notice = h('div', { class: 'key-notice', role: 'alert' });

  const say = (text: string, bad = false) => {
    notice.textContent = text;
    notice.classList.toggle('bad', bad);
  };
  const warn = (text: string) => {
    say(text, true);
    toast(text, 'error');
  };

  const render = () => {
    clear(table);
    const fixed = (label: string, keys: string[]) =>
      h('tr', null, h('td', null, label), h('td', null, ...keys.map((k) => h('span', { class: 'key-slot fixed' }, k))));
    const rows = KEY_ACTIONS.map(({ action, label, slots }) => {
      const list = b[action];
      const shown = Math.min(slots, list.length + 1); // the keys, plus one empty slot while there is room
      const cells = Array.from({ length: shown }, (_, slot) => {
        const waiting = capture?.action === action && capture.slot === slot;
        const code = list[slot];
        return h(
          'button',
          {
            class: `key-slot ${waiting ? 'capturing' : ''} ${code ? '' : 'empty'}`,
            title: code ? '點一下換鍵' : '點一下加一個鍵',
            onclick: () => start(action, slot),
          },
          waiting ? '請按鍵…' : code ? keyLabel(code) : '＋',
        );
      });
      return h('tr', null, h('td', null, label), h('td', null, ...cells));
    });
    table.append(h('tbody', null, fixed('移動', ['方向鍵', 'W A S D']), ...rows));
  };

  const start = (action: KeyAction, slot: number) => {
    stop();
    capture = { action, slot };
    held = null;
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    for (const ev of ['mousedown', 'click', 'auxclick', 'contextmenu'] as const) window.addEventListener(ev, onMouse, true);
    say('按下要設定的鍵（只能一個鍵）；Esc 取消，Backspace 清空這一格');
    render();
  };

  const stop = () => {
    window.removeEventListener('keydown', onDown, true);
    window.removeEventListener('keyup', onUp, true);
    for (const ev of ['mousedown', 'click', 'auxclick', 'contextmenu'] as const) window.removeEventListener(ev, onMouse, true);
    capture = null;
    held = null;
    render();
  };

  const apply = (code: string) => {
    if (!capture) return;
    const problem = keyProblem(b, capture.action, capture.slot, code);
    if (problem) return warn(problemText(problem)); // the slot keeps waiting: pick another key
    b = withKey(b, capture.action, capture.slot, code);
    saveBindings(b);
    say(`已設定為 ${keyLabel(code)}`);
    stop();
  };

  const onDown = (e: KeyboardEvent) => {
    if (!capture) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (e.code === 'Escape') {
      say('');
      return stop();
    }
    if (e.code === 'Backspace') {
      const next = withoutKey(b, capture.action, capture.slot);
      if (!next) return warn('每個動作至少要留 1 個鍵');
      b = next;
      saveBindings(b);
      say('已清空這一格');
      return stop();
    }
    const combo = () => {
      held = null;
      warn('不支援組合鍵，請只按一個鍵');
    };
    if (!e.code || e.code === 'Unidentified') return warn(problemText({ kind: 'unknown' }));
    if (isModifier(e.code)) {
      // its own flag is set on its own keydown; any other modifier being down makes it a combination
      const self = normalizeCode(e.code);
      const others =
        (e.ctrlKey && self !== 'ControlLeft') || (e.shiftKey && self !== 'ShiftLeft') || (e.altKey && self !== 'AltLeft') || e.metaKey;
      if (others || (held !== null && held !== self)) return combo();
      held = self; // decided on release
      return;
    }
    if (held !== null || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return combo();
    apply(e.code);
  };

  const onUp = (e: KeyboardEvent) => {
    if (!capture || held === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (normalizeCode(e.code) !== held) return;
    const code = held;
    held = null;
    apply(code);
  };

  const onMouse = (e: MouseEvent) => {
    if (!capture) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'mousedown') warn('只能用鍵盤按鍵，不能設定滑鼠；按 Esc 取消');
  };

  const reset = h(
    'button',
    {
      class: 'btn small',
      onclick: () => {
        b = parseBindings(null);
        saveBindings(b);
        say('已恢復預設按鍵');
        render();
      },
    },
    '恢復預設',
  );
  render();
  return h(
    'div',
    { class: 'key-editor' },
    table,
    notice,
    h('div', { class: 'row' }, reset, h('span', { class: 'muted small' }, '設定存在這個瀏覽器；對戰中不能改。')),
  );
}
