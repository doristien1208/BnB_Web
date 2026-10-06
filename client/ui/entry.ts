import { CHARACTERS } from '../../shared/characters';
import { VERSION } from '../../shared/constants';
import type { Audio } from '../audio';
import { h, isSubmitKey, store, toast } from '../dom';
import { keysText, loadBindings } from '../keys';
import { portrait, settingsModal } from './common';

export function entryScreen(onEnter: (name: string) => void, audio: Audio): HTMLElement {
  const input = h('input', {
    class: 'input big',
    maxLength: 12,
    placeholder: '輸入暱稱（最多 12 字）',
    value: store.get('bnb.name') ?? '',
  });
  const go = () => {
    const name = input.value.trim();
    if (!name) {
      toast('請先輸入暱稱', 'error');
      input.focus();
      return;
    }
    store.set('bnb.name', name);
    onEnter(name);
  };
  input.addEventListener('keydown', (e) => isSubmitKey(e) && go());
  const hint = h('p', { class: 'hint' });
  const paintHint = () => {
    const b = loadBindings();
    hint.textContent = `方向鍵移動 · ${keysText(b, 'balloon')} 放水球 · ${keysText(b, 'item')} 用道具`;
  };
  paintHint();
  const colors = [0, 5, 3, 1, 6, 7];
  const el = h(
    'div',
    { class: 'screen entry' },
    h(
      'div',
      { class: 'entry-card' },
      h('h1', { class: 'logo' }, '水球大亂鬥'),
      h('p', { class: 'muted' }, '爆爆王規則 · 2–4 人連線對戰'),
      h('div', { class: 'parade' }, ...CHARACTERS.map((c, k) => portrait(c.id, colors[k] ?? 0, 3))),
      input,
      h('button', { class: 'btn primary big', onclick: go }, '進入大廳'),
      hint,
      h(
        'div',
        { class: 'entry-tools' },
        h('button', { class: 'btn ghost small', onclick: () => settingsModal(audio, paintHint) }, '設定與按鍵'),
      ),
      h('p', { class: 'hint small' }, `v${VERSION}`),
    ),
  );
  requestAnimationFrame(() => input.focus());
  return el;
}
