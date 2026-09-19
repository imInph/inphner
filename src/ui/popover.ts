/**
 * inphner: a glass-strong popover 8px below its trigger (session / event
 * pickers). Closes on outside press, Esc, scroll-away or a choice. One at a time.
 */

let open: { el: HTMLElement; trigger: HTMLElement; close: () => void } | null = null;

export function closePopover(): void {
  open?.close();
}

export function openPopover(trigger: HTMLElement, html: string, onPick: (value: string, el: HTMLElement) => void): HTMLElement {
  if (open?.trigger === trigger) {
    open.close();
    return trigger;
  }
  open?.close();
  const el = document.createElement('div');
  el.className = 'popover';
  el.setAttribute('role', 'dialog');
  el.innerHTML = html;
  document.body.appendChild(el);

  const place = () => {
    const r = trigger.getBoundingClientRect();
    const w = el.offsetWidth;
    const left = Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12));
    el.style.left = `${left + window.scrollX}px`;
    el.style.top = `${r.bottom + 8 + window.scrollY}px`;
  };
  place();

  const onDown = (e: PointerEvent) => {
    const t = e.target as Node;
    if (!el.contains(t) && !trigger.contains(t)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      trigger.focus();
    }
  };
  const close = () => {
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', close);
    trigger.setAttribute('aria-expanded', 'false');
    el.remove();
    if (open?.el === el) open = null;
  };
  el.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>('[data-pick]');
    if (!item) return;
    close();
    onPick(item.dataset.pick!, item);
  });
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', close);
  trigger.setAttribute('aria-expanded', 'true');
  open = { el, trigger, close };
  (el.querySelector<HTMLElement>('[aria-current="true"]') ?? el.querySelector<HTMLElement>('[data-pick]'))?.focus({ preventScroll: true });
  return el;
}
