/**
 * inphner: the command palette (`k` / ⌘K, inphner-prompt.md §B8). A glass
 * sheet over a dimmed, blurred page: an input, uppercase section labels and
 * rows with a two-line label and a right-aligned hint. The tint + blur live on
 * .palette-overlay::before, never on the overlay itself, or the glass box
 * inside it would blur only the flat tint.
 *
 * The item list is supplied by views/commands.ts; this module only filters
 * (ui/fuzzy.ts), paints and handles the keyboard.
 */
import { esc } from './dom.ts';
import { icon } from './icons.ts';
import { fuzzyFields, fuzzyMatch, rank, type FuzzyMatch } from './fuzzy.ts';

export interface PaletteItem {
  id: string;
  /** Uppercase micro-label the row is grouped under; sections keep their first-seen order. */
  section: string;
  label: string;
  /** Second, dimmed line. */
  sub?: string;
  /** Right-aligned faint hint ("g t", "current"…). */
  hint?: string;
  /** Extra words that should match; the subtitle itself isn't searched. */
  keywords?: string;
  /** Raw icon SVG (ui/icons.ts or ui/event-icon.ts). */
  icon?: string;
  /** Marks the row as the current session/event. */
  current?: boolean;
  run: () => void | Promise<void>;
}

/* Full screen on a phone has no outside to tap, so the input row carries a close button. */
const CLOSE_ICON = icon('close', 20);

const PER_SECTION = 6;
/** Per query character. Below this the match is a few letters scattered over a
 *  long label, which is noise, not a result. */
const FLOOR = 4;
const MAX_ROWS = 40;

let open: { close: () => void } | null = null;

export function paletteOpen(): boolean {
  return open !== null;
}

export function closePalette(): void {
  open?.close();
}

/** The label plus its keywords. Subtitles are left out: half of them are
 *  boilerplate ("Starts a new session for it") that would match anything. */
function searchText(item: PaletteItem): string {
  return [item.label, item.keywords].filter(Boolean).join(' ');
}

/** Highlight the matched characters of `text`, escaping everything around them. */
function mark(text: string, indices: number[]): string {
  if (!indices.length) return esc(text);
  let out = '';
  let at = 0;
  for (let i = 0; i < indices.length;) {
    const start = indices[i]!;
    let end = start;
    while (i + 1 < indices.length && indices[i + 1] === end + 1) { end++; i++; }
    i++;
    if (start >= text.length) break;
    out += esc(text.slice(at, start));
    out += `<mark class="pal-hit">${esc(text.slice(start, end + 1))}</mark>`;
    at = end + 1;
  }
  return out + esc(text.slice(at));
}

interface Row { item: PaletteItem; match: FuzzyMatch }

/** Rank everything, then group by section (each section capped) keeping the best first. */
function filter(items: PaletteItem[], query: string): Row[] {
  const q = query.trim();
  const sections: string[] = [];
  for (const item of items) if (!sections.includes(item.section)) sections.push(item.section);

  const ranked = q
    ? rank(q, items, (item) => fuzzyFields(q, item.label, searchText(item)))
      .filter((r) => r.match.score >= FLOOR * q.replace(/\s+/g, '').length)
    : items.map((item) => ({ item, match: fuzzyMatch('', item.label)! }));

  const grouped = sections
    .map((section) => ({ section, rows: ranked.filter((r) => r.item.section === section) }))
    .filter((g) => g.rows.length);
  // With a query the section holding the best row comes first, or a weak
  // "Commands" hit would sit above an exact "Go to Stats".
  if (q) grouped.sort((a, b) => b.rows[0]!.match.score - a.rows[0]!.match.score);

  const out: Row[] = [];
  for (const g of grouped) {
    for (const r of g.rows.slice(0, q ? PER_SECTION + 2 : PER_SECTION)) out.push(r);
  }
  return out.slice(0, MAX_ROWS);
}

export function openPalette(load: () => Promise<PaletteItem[]>): void {
  if (open) return;

  const returnTo = document.activeElement as HTMLElement | null;
  const overlay = document.createElement('div');
  overlay.className = 'palette-overlay';
  overlay.innerHTML = `
    <div class="palette-box" role="dialog" aria-modal="true" aria-label="Search and commands">
      <div class="palette-head">
        <input class="palette-input" type="text" role="combobox" aria-expanded="true" aria-controls="palette-list"
               placeholder="Search sessions, events and commands…" autocomplete="off" spellcheck="false" aria-autocomplete="list">
        <button type="button" class="btn btn-ghost btn-icon palette-close" data-close aria-label="Close">${CLOSE_ICON}</button>
      </div>
      <div class="palette-list" id="palette-list" role="listbox" aria-label="Results">
        <div class="skeleton" style="margin:8px"></div>
      </div>
    </div>`;
  const input = overlay.querySelector<HTMLInputElement>('.palette-input')!;
  const list = overlay.querySelector<HTMLElement>('.palette-list')!;

  let items: PaletteItem[] = [];
  let rows: Row[] = [];
  let active = 0;

  const paint = (): void => {
    rows = filter(items, input.value);
    if (active >= rows.length) active = Math.max(0, rows.length - 1);
    if (!rows.length) {
      list.innerHTML = '<div class="empty">Nothing matches that.</div>';
      input.removeAttribute('aria-activedescendant');
      return;
    }
    let html = '';
    let section = '';
    rows.forEach((r, i) => {
      if (r.item.section !== section) {
        section = r.item.section;
        html += `<div class="micro-label palette-section">${esc(section)}</div>`;
      }
      html += `
        <div class="palette-item${i === active ? ' on' : ''}" role="option" id="palette-row-${i}" data-row="${i}"
             aria-selected="${i === active}">
          ${r.item.icon ?? ''}
          <span class="palette-text">
            <span class="palette-label">${mark(r.item.label, r.match.indices)}</span>
            ${r.item.sub ? `<span class="palette-sub">${esc(r.item.sub)}</span>` : ''}
          </span>
          ${r.item.hint ? `<span class="palette-hint">${esc(r.item.hint)}</span>` : ''}
        </div>`;
    });
    list.innerHTML = html;
    input.setAttribute('aria-activedescendant', `palette-row-${active}`);
    list.querySelector<HTMLElement>('.palette-item.on')?.scrollIntoView({ block: 'nearest' });
  };

  const move = (delta: number): void => {
    if (!rows.length) return;
    active = (active + delta + rows.length) % rows.length;
    paint();
  };

  const choose = (i: number): void => {
    const row = rows[i];
    if (!row) return;
    close();
    void row.item.run();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); active = 0; paint(); }
    else if (e.key === 'End') { e.preventDefault(); active = rows.length - 1; paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
  };

  const close = (): void => {
    if (open?.close !== close) return;
    open = null;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('hashchange', close);
    overlay.remove();
    document.body.classList.remove('palette-on');
    returnTo?.focus?.();
  };

  overlay.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    if (t === overlay || t.closest('[data-close]')) { close(); return; }
    const row = t.closest<HTMLElement>('.palette-item');
    if (row) { e.preventDefault(); choose(Number(row.dataset.row)); }
  });
  overlay.addEventListener('pointermove', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.palette-item');
    const i = row ? Number(row.dataset.row) : -1;
    if (i >= 0 && i !== active) { active = i; paint(); }
  });
  input.addEventListener('input', () => { active = 0; paint(); });
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('hashchange', close);

  document.body.appendChild(overlay);
  document.body.classList.add('palette-on');
  open = { close };
  input.focus();

  void load().then((loaded) => {
    if (open?.close !== close) return;
    items = loaded;
    paint();
  });
}
