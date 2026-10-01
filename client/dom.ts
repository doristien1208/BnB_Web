type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; style?: Partial<CSSStyleDeclaration> };

/** Tiny element builder: h('button', { class: 'btn', onclick }, '開始'). Text is always set as text, never HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k in el) (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

/**
 * Enter that should submit. While a Chinese IME is composing, Enter only confirms the composition
 * (keyCode 229 covers Safari, which ends the composition before this keydown).
 */
export function isSubmitKey(e: KeyboardEvent): boolean {
  return e.key === 'Enter' && !e.isComposing && e.keyCode !== 229;
}

export function clear(el: Element): void {
  while (el.firstChild) el.firstChild.remove();
}

let toastBox: HTMLElement | null = null;

export function toast(text: string, kind: 'info' | 'error' = 'info'): void {
  if (!toastBox) {
    toastBox = h('div', { class: 'toasts' });
    document.body.append(toastBox);
  }
  const t = h('div', { class: `toast ${kind}` }, text);
  toastBox.append(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3000);
}

export const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode: settings just don't persist */
    }
  },
};
