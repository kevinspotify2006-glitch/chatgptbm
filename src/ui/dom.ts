/** Tiny DOM helpers. No framework: the UI is small enough to build by hand. */

type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  html?: string;
  title?: string;
  id?: string;
  type?: string;
  value?: string | number;
  placeholder?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  disabled?: boolean;
  checked?: boolean;
  selected?: boolean;
  href?: string;
  style?: string;
  role?: string;
  inputmode?: string;
  maxlength?: number;
  data?: Record<string, string>;
  aria?: Record<string, string>;
  on?: Partial<Record<keyof HTMLElementEventMap, (event: never) => void>>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.id) el.id = props.id;
  if (props.title) el.title = props.title;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.html !== undefined) el.innerHTML = props.html;
  if (props.style) el.setAttribute('style', props.style);
  if (props.role) el.setAttribute('role', props.role);
  if (props.href && el instanceof HTMLAnchorElement) el.href = props.href;
  if (props.inputmode) el.setAttribute('inputmode', props.inputmode);
  if (props.maxlength !== undefined) el.setAttribute('maxlength', String(props.maxlength));

  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    if (props.type && el instanceof HTMLInputElement) el.type = props.type;
    if (props.value !== undefined) el.value = String(props.value);
    if (props.placeholder && !(el instanceof HTMLSelectElement)) {
      (el as HTMLInputElement).placeholder = props.placeholder;
    }
    if (props.disabled) el.disabled = true;
    if (el instanceof HTMLInputElement) {
      if (props.min !== undefined) el.min = String(props.min);
      if (props.max !== undefined) el.max = String(props.max);
      if (props.step !== undefined) el.step = String(props.step);
      if (props.checked) el.checked = true;
    }
  } else if (el instanceof HTMLButtonElement) {
    if (props.disabled) el.disabled = true;
    if (props.value !== undefined) el.value = String(props.value);
  } else if (el instanceof HTMLOptionElement) {
    if (props.value !== undefined) el.value = String(props.value);
    if (props.selected) el.selected = true;
  }

  if (props.data) {
    for (const [key, value] of Object.entries(props.data)) el.dataset[key] = value;
  }
  if (props.aria) {
    for (const [key, value] of Object.entries(props.aria)) el.setAttribute(`aria-${key}`, value);
  }
  if (props.on) {
    for (const [event, handler] of Object.entries(props.on)) {
      if (typeof handler === 'function') {
        el.addEventListener(event, handler as EventListener);
      }
    }
  }

  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function button(label: string, onClick: () => void, variant = 'btn'): HTMLButtonElement {
  return h('button', { class: variant, on: { click: onClick } }, label);
}

/** A label/value pair, the workhorse of every panel in the game. */
export function stat(label: string, value: string, tone?: 'good' | 'bad' | 'muted'): HTMLElement {
  return h(
    'div',
    { class: 'stat' },
    h('span', { class: 'stat-label', text: label }),
    h('span', { class: `stat-value${tone ? ` ${tone}` : ''}`, text: value }),
  );
}

export function section(title: string, ...children: Child[]): HTMLElement {
  return h('section', { class: 'panel' }, h('h3', { class: 'panel-title', text: title }), ...children);
}

export function empty(message: string): HTMLElement {
  return h('p', { class: 'empty', text: message });
}

/** A horizontal bar, 0..1. */
export function bar(value: number, tone = ''): HTMLElement {
  const width = Math.max(0, Math.min(1, value)) * 100;
  return h(
    'div',
    { class: 'bar' },
    h('div', { class: `bar-fill ${tone}`, style: `width:${width.toFixed(1)}%` }),
  );
}

export function table(headers: string[], rows: Child[][]): HTMLElement {
  const thead = h('thead', {}, h('tr', {}, ...headers.map((label) => h('th', { text: label }))));
  const tbody = h(
    'tbody',
    {},
    ...rows.map((cells) => h('tr', {}, ...cells.map((cell) => h('td', {}, cell)))),
  );
  return h('div', { class: 'table-wrap' }, h('table', {}, thead, tbody));
}

let toastTimer: number | null = null;

/** Transient feedback for an action the player just took. */
export function toast(message: string, tone: 'info' | 'good' | 'bad' = 'info'): void {
  let host = document.getElementById('toast');
  if (!host) {
    host = h('div', { id: 'toast' });
    document.body.appendChild(host);
  }
  host.textContent = message;
  host.className = `toast show ${tone}`;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    host.className = 'toast';
  }, 3200);
}

export interface ModalOptions {
  title: string;
  width?: number;
  onClose?: () => void;
}

/** Opens a modal and returns its body element for the caller to fill. */
export function modal(options: ModalOptions): { body: HTMLElement; close: () => void; footer: HTMLElement } {
  const body = h('div', { class: 'modal-body' });
  const footer = h('div', { class: 'modal-footer' });
  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    options.onClose?.();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close();
  };
  const card = h(
    'div',
    { class: 'modal-card', style: options.width ? `max-width:${options.width}px` : '' },
    h(
      'div',
      { class: 'modal-head' },
      h('h2', { text: options.title }),
      h('button', { class: 'icon-btn', title: 'Close', on: { click: close } }, '✕'),
    ),
    body,
    footer,
  );
  const overlay = h(
    'div',
    {
      class: 'modal-overlay',
      on: {
        click: (event: MouseEvent) => {
          if (event.target === overlay) close();
        },
      },
    },
    card,
  );
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey);
  return { body, close, footer };
}

/** Yes/no confirmation used before anything expensive or destructive. */
export function confirmDialog(title: string, message: string, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(value);
      close();
    };
    const { body, footer, close } = modal({ title, width: 460, onClose: () => finish(false) });
    body.appendChild(h('p', { class: 'confirm-text', text: message }));
    footer.appendChild(button('Cancel', () => finish(false), 'btn ghost'));
    footer.appendChild(button(confirmLabel, () => finish(true), 'btn primary'));
  });
}

export function numberInput(value: number, onChange: (value: number) => void, props: Props = {}): HTMLInputElement {
  const input = h('input', {
    type: 'number',
    value: String(value),
    inputmode: 'decimal',
    ...props,
    on: {
      change: () => {
        const parsed = Number(input.value);
        if (Number.isFinite(parsed)) onChange(parsed);
      },
    },
  });
  return input;
}

export function select(
  options: { value: string; label: string }[],
  current: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const el = h(
    'select',
    {
      on: {
        change: () => onChange(el.value),
      },
    },
    ...options.map((option) =>
      h('option', { value: option.value, selected: option.value === current }, option.label),
    ),
  );
  return el;
}
