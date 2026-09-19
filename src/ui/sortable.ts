/**
 * inphner: drag-to-reorder, the same interaction as inphub's widget picker
 * (its sortable() in src/ui.ts). Children carry `data-sort`; dragging starts on
 * a `[data-handle]`. Pointer events (HTML5 drag-and-drop never fires for
 * touch). Buttons with `data-move="-1|1"` move an item one step, for keyboards.
 * `onChange` runs after every reorder. Bind once per freshly built list node.
 */
export function sortable(list: HTMLElement, onChange: () => void): void {
  let dragging: HTMLElement | null = null;
  let pointerId = -1;
  let offsetY = 0;

  const items = () => [...list.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.dataset.sort !== undefined);

  list.addEventListener('pointerdown', (e) => {
    const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]');
    const item = handle?.closest<HTMLElement>('[data-sort]');
    if (!handle || !item || item.parentElement !== list || e.button !== 0) return;
    e.preventDefault();
    dragging = item;
    pointerId = e.pointerId;
    offsetY = e.clientY - item.getBoundingClientRect().top;
    handle.setPointerCapture(e.pointerId);
    item.classList.add('dragging');
  });

  list.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    const y = e.clientY;
    const siblings = items().filter((c) => c !== dragging);
    // Insert before the first sibling whose midpoint is below the dragged item's middle.
    const before = siblings.find((c) => {
      const r = c.getBoundingClientRect();
      return y - offsetY + dragging!.offsetHeight / 2 < r.top + r.height / 2;
    });
    if (before) {
      if (dragging.nextElementSibling !== before) list.insertBefore(dragging, before);
    } else if (siblings.length) {
      const lastItem = siblings[siblings.length - 1]!;
      if (lastItem.nextElementSibling !== dragging) lastItem.after(dragging);
    }
  });

  const end = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging.classList.remove('dragging');
    dragging = null;
    pointerId = -1;
    onChange();
  };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);

  list.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-move]');
    const item = btn?.closest<HTMLElement>('[data-sort]');
    if (!btn || !item || item.parentElement !== list) return;
    e.preventDefault();
    e.stopPropagation();
    const all = items();
    const to = all.indexOf(item) + Number(btn.dataset.move);
    if (to < 0 || to >= all.length) return;
    if (Number(btn.dataset.move) < 0) all[to]!.before(item);
    else all[to]!.after(item);
    btn.focus();
    onChange();
  });
}
