import { CHARACTERS } from '../../shared/characters';
import { h, store, toast } from '../dom';
import { portrait } from './common';

export function entryScreen(onEnter: (name: string) => void): HTMLElement {
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
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
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
      h('p', { class: 'hint' }, '方向鍵移動 · Space 放水球 · Ctrl / Z 用道具'),
    ),
  );
  requestAnimationFrame(() => input.focus());
  return el;
}
