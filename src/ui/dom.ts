/**
 * inphner: small DOM helpers. No framework: views build HTML strings and swap
 * a persistent container's innerHTML, so every user-originated string must go
 * through esc() before it touches markup.
 */

/** Escape a value for safe interpolation into HTML (text and attribute values). */
export function esc(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type ActionHandler = (action: string, el: HTMLElement, event: MouseEvent) => void;

const handlers = new WeakMap<HTMLElement, ActionHandler>();

/**
 * One delegated click handler per persistent container, registered once.
 * Re-rendering swaps innerHTML, so child nodes are never captured; calling
 * onAction again just replaces the handler the single listener dispatches to.
 * Elements opt in with data-action="…".
 */
export function onAction(container: HTMLElement, handler: ActionHandler): void {
  const had = handlers.has(container);
  handlers.set(container, handler);
  if (had) return;
  container.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
    if (!target || !container.contains(target)) return;
    if ((target as HTMLButtonElement).disabled) return;
    handlers.get(container)?.(target.dataset.action!, target, e);
  });
}

/** Whether the event target is a text-entry control (shortcuts must ignore it). */
export function isTyping(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node || !node.tagName) return false;
  if (node.isContentEditable) return true;
  if (node.tagName === 'TEXTAREA' || node.tagName === 'SELECT') return true;
  if (node.tagName !== 'INPUT') return false;
  const type = (node as HTMLInputElement).type;
  return !['checkbox', 'radio', 'button', 'submit', 'range', 'color'].includes(type);
}
