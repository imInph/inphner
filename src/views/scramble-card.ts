/**
 * inphner: the scramble card + preview above the timer (inphner-prompt.md §A5).
 *
 * - Each move is its own <span> (no line ever breaks inside a move; one move
 *   can be highlighted). Text shrinks until it fits in 5 lines (Megaminx keeps
 *   one line per WCA row instead).
 * - ← previous · → next · copy · edit/paste your own · lock (reuse it).
 * - Preview: our own SVG net for N×N cubes, a 2D cubing.js <twisty-player> for
 *   everything else; clicking it toggles a 3D <twisty-player>.
 * - Scrambles are prefetched (generator.ts); history is per event, this visit.
 */
import { eventDef } from '../events.ts';
import { prefs, setPrefs } from '../prefs.ts';
import { nextScramble, warm } from '../scramble/generator.ts';
import { normalizeScramble, scrambleLength, scrambleRows } from '../scramble/moves.ts';
import { netSvg } from '../scramble/net.ts';
import { applyScramble, cubeSize, solvedCube } from '../scramble/nxn.ts';
import { esc, onAction as delegate } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { openModal } from '../ui/modal.ts';
import { toast } from '../ui/toast.ts';

interface EventScrambles {
  history: string[];
  index: number;
  locked: boolean;
  loading: boolean;
  /** Still loading after 1.5 s (cubing.js warms up big-cube scramblers once). */
  slow: boolean;
  error: string;
}

const byEvent = new Map<string, EventScrambles>();
let host: HTMLElement | null = null;
let event = '333';
let preview3d = false;
let previewOpen = false; // phone: the preview is collapsible
let loadToken = 0;

const TWISTY_PUZZLE: Record<string, string> = {
  pyram: 'pyraminx', skewb: 'skewb', sq1: 'square1', minx: 'megaminx', clock: 'clock',
};

function st(): EventScrambles {
  let s = byEvent.get(event);
  if (!s) {
    s = { history: [], index: -1, locked: false, loading: false, slow: false, error: '' };
    byEvent.set(event, s);
  }
  return s;
}

/** The scramble on screen (what the next solve will be stored with). */
export function currentScramble(): string {
  const s = st();
  return s.history[s.index] ?? '';
}

const wiredHosts = new WeakSet<HTMLElement>();

export function mountScramble(el: HTMLElement, eventId: string): void {
  host = el;
  delegate(el, (action) => { void onAction(action); });
  if (!wiredHosts.has(el)) {
    wiredHosts.add(el);
    // The preview is a div role=button (<twisty-player> won't render inside a real <button>).
    el.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (e.key === 'Enter' && t.matches('[role="button"][data-action]')) {
        e.preventDefault();
        t.click();
      }
    });
    el.addEventListener('change', (e) => {
      const cubes = (e.target as HTMLElement).closest<HTMLInputElement>('[data-scr-cubes]');
      if (cubes) {
        const v = setPrefs({ multiCubes: Math.round(Number(cubes.value)) || 5 });
        cubes.value = String(v.multiCubes);
        warm(event);
        void goNextFresh();
        return;
      }
      const len = (e.target as HTMLElement).closest<HTMLInputElement>('[data-scr-len]');
      if (!len) return;
      const v = setPrefs({ customLength: Math.round(Number(len.value)) || 25 });
      len.value = String(v.customLength);
      warm(event);
      void goNextFresh();
    });
  }
  if (eventId !== event) preview3d = false;
  event = eventId;
  const s = st();
  if (s.index < 0 && !s.loading && eventDef(event).scrambler.kind !== 'none') void load();
  render();
}

export function unmountScramble(): void {
  host = null;
}

/** After a solve: a fresh scramble unless locked. */
export function advanceScramble(): void {
  if (st().locked || eventDef(event).scrambler.kind === 'none') return;
  void goNext();
}

async function load(): Promise<void> {
  const s = st();
  const forEvent = event;
  const token = ++loadToken;
  s.loading = true;
  s.slow = false;
  s.error = '';
  render();
  const slowTimer = window.setTimeout(() => {
    const target = byEvent.get(forEvent)!;
    if (!target.loading) return;
    target.slow = true;
    if (forEvent === event) render();
  }, 1500);
  try {
    const scramble = await nextScramble(forEvent);
    const target = byEvent.get(forEvent)!;
    target.history.push(scramble);
    if (target.history.length > 100) target.history.shift();
    target.index = target.history.length - 1;
  } catch (err) {
    byEvent.get(forEvent)!.error = err instanceof Error ? err.message : 'Could not generate a scramble.';
  } finally {
    clearTimeout(slowTimer);
    byEvent.get(forEvent)!.loading = false;
    byEvent.get(forEvent)!.slow = false;
    if (token === loadToken || forEvent === event) render();
  }
}

async function goNext(): Promise<void> {
  const s = st();
  if (s.index < s.history.length - 1) {
    s.index++;
    render();
    return;
  }
  await load();
}

function goPrev(): void {
  const s = st();
  if (s.index > 0) {
    s.index--;
    render();
  }
}

/* ------------------------------------------------------------------ render */

function sizeClass(): string {
  if (event === 'minx') return 'is-minx';
  if (event === '333mbf') return 'is-multi';
  if (['666', '777'].includes(event)) return 'is-long';
  if (['555', '555bf', '444', '444bf'].includes(event)) return 'is-mid';
  return '';
}

function textHtml(scramble: string): string {
  const rows = scrambleRows(scramble, event);
  return rows.map((row) => `<div class="scramble-row">${row.map((m, i) => `<span class="mv" data-i="${i}">${esc(m)}</span>`).join(' ')}</div>`).join('');
}

function render(): void {
  if (!host) return;
  const def = eventDef(event);
  const s = st();
  const scramble = currentScramble();
  const none = def.scrambler.kind === 'none';
  const noPreview = none || event === '333mbf';
  const n = cubeSize(event);
  const len = scrambleLength(scramble, event);
  const btn = (action: string, ico: Parameters<typeof icon>[0], label: string, disabled = false, pressed?: boolean) =>
    `<button type="button" class="btn btn-ghost btn-sm btn-icon" data-action="${action}" title="${label}" aria-label="${label}"
      ${pressed !== undefined ? `aria-pressed="${pressed}"` : ''} ${disabled ? 'disabled' : ''}>${icon(ico, 18)}</button>`;

  let body: string;
  if (none) body = `<p class="scramble-note">${esc(def.scrambler.kind === 'none' ? def.scrambler.note : '')}</p>`;
  else if (s.error && !scramble) body = `<p class="scramble-note text-bad">${esc(s.error)} <button type="button" class="btn btn-sm" data-action="retry">Retry</button></p>`;
  else if (!scramble) {
    body = `<div class="scramble-skeleton" aria-label="Generating a scramble"><span></span><span></span></div>
      ${s.slow ? `<p class="scramble-note slow-note">Warming up the ${esc(def.short)} scrambler. This happens once per visit.</p>` : ''}`;
  }
  else body = `<div class="scramble-text ${sizeClass()}" aria-label="Scramble">${textHtml(scramble)}</div>`;

  const customLen = event === '333len'
    ? `<label class="len-field" title="Moves per scramble"><input type="number" min="1" max="100" value="${prefs().customLength}" data-scr-len aria-label="Scramble length"> moves</label>`
    : event === '333mbf'
      ? `<label class="len-field" title="Cubes in this attempt"><input type="number" min="2" max="60" value="${prefs().multiCubes}" data-scr-cubes aria-label="Number of cubes"> cubes</label>`
      : '';

  host.innerHTML = `
    <div class="scramble-wrap ${previewOpen ? 'preview-open' : ''} ${noPreview ? 'no-preview' : ''}">
      <section class="card scramble-card" aria-label="Scramble">
        ${body}
        ${none ? '' : `
        <div class="scramble-actions">
          ${customLen || (len ? `<span class="chip num" title="Scramble length">${len}<span class="chip-unit"> ${event === 'sq1' ? 'twists' : 'moves'}</span></span>` : '')}
          ${s.locked ? '<span class="chip is-lock">Locked</span>' : ''}
          <span class="grow"></span>
          ${btn('prev', 'left', 'Previous scramble', s.index <= 0)}
          ${btn('next', 'right', 'Next scramble', s.loading || s.locked)}
          ${btn('copy', 'copy', 'Copy scramble', !scramble)}
          ${btn('edit', 'edit', 'Use your own scramble')}
          ${btn('lock', s.locked ? 'lock' : 'unlock', s.locked ? 'Unlock: new scramble after each solve' : 'Lock: reuse this scramble', false, s.locked)}
          ${event === '333mbf' ? '' : btn('toggle-preview', 'cube3d', previewOpen ? 'Hide preview' : 'Show preview', false, previewOpen)}
        </div>`}
      </section>
      ${noPreview ? '' : `
      <div class="card preview-card" role="button" tabindex="0" data-action="3d" title="${preview3d ? 'Show the 2D net' : 'Show in 3D'}" aria-label="${preview3d ? 'Scramble preview, 3D. Click for 2D' : 'Scramble preview. Click for 3D'}">
        ${scramble ? previewHtml(scramble, n) : '<div class="preview-empty"></div>'}
      </div>`}
    </div>`;

  fitText();
  if (scramble !== lastAnnounced) {
    lastAnnounced = scramble;
    window.dispatchEvent(new Event('inphner:scramble'));
  }
}

let lastAnnounced = '';

function previewHtml(scramble: string, n: number): string {
  // N×N in 2D: our own net (exact colours, sticker gap and radius from the spec).
  if (n && !preview3d && applyScramble(solvedCube(n), scramble)) return netSvg(n, scramble, 204);
  // Everything else, and 3D: cubing.js's <twisty-player> (loaded on demand).
  void import('cubing/twisty');
  const puzzle = n ? `${n}x${n}x${n}` : TWISTY_PUZZLE[event] ?? '3x3x3';
  // control-panel="none" leaves the player blank in cubing.js 0.63 (verified in the browser),
  // so the default control bar is rendered and cropped off by .twisty-clip instead.
  return `<div class="twisty-clip"><twisty-player class="${preview3d ? 'preview-3d' : 'preview-2d'}" puzzle="${puzzle}"
    experimental-setup-alg="${esc(scramble)}" alg="" visualization="${preview3d ? '3D' : '2D'}" background="none"
    hint-facelets="none" experimental-drag-input="none"></twisty-player></div>`;
}

/** Shrink the scramble until it fits in 5 lines (Megaminx: its own rows). */
function fitText(): void {
  const text = host?.querySelector<HTMLElement>('.scramble-text');
  if (!text || text.classList.contains('is-minx') || text.classList.contains('is-multi')) return;
  text.style.fontSize = '';
  const lineHeight = () => parseFloat(getComputedStyle(text).lineHeight) || 24;
  let size = parseFloat(getComputedStyle(text).fontSize);
  for (let i = 0; i < 12 && text.scrollHeight > lineHeight() * 5 + 2 && size > 11; i++) {
    size -= 1;
    text.style.fontSize = `${size}px`;
  }
}

async function goNextFresh(): Promise<void> {
  const s = st();
  s.index = s.history.length - 1;
  await load();
}

async function onAction(action: string): Promise<void> {
  const s = st();
  const scramble = currentScramble();
  switch (action) {
    case 'prev': goPrev(); break;
    case 'next': if (!s.locked) await goNext(); break;
    case 'retry': await load(); break;
    case 'lock':
      s.locked = !s.locked;
      render();
      toast(s.locked ? 'Scramble locked: every solve reuses it.' : 'Scramble unlocked.');
      break;
    case 'copy':
      try {
        await navigator.clipboard.writeText(scramble);
        toast('Scramble copied.', { kind: 'good' });
      } catch {
        toast('Copy failed: your browser blocked the clipboard.', { kind: 'bad' });
      }
      break;
    case 'edit': editScramble(); break;
    case '3d':
      preview3d = !preview3d;
      render();
      break;
    case 'toggle-preview':
      previewOpen = !previewOpen;
      render();
      break;
    default: break;
  }
}

function editScramble(): void {
  const n = cubeSize(event);
  openModal({
    title: 'Your own scramble',
    bodyHtml: `<label><span>Paste or type a scramble for ${esc(eventDef(event).short)}</span>
      <textarea name="scramble" rows="4" class="mono" spellcheck="false" placeholder="R U R' U' …">${esc(currentScramble())}</textarea></label>
      <div class="error-block" data-err hidden></div>`,
    confirmLabel: 'Use it',
    onConfirm: (m) => {
      const value = normalizeScramble(m.querySelector<HTMLTextAreaElement>('textarea')!.value);
      const err = m.querySelector<HTMLElement>('[data-err]')!;
      if (!value) {
        err.hidden = false;
        err.textContent = 'Enter a scramble first.';
        return false;
      }
      if (n && !applyScramble(solvedCube(n), value)) {
        err.hidden = false;
        err.textContent = `That isn't valid ${n}x${n} notation (e.g. R U2 F' Rw 3Fw2).`;
        return false;
      }
      const s = st();
      s.history.push(value);
      s.index = s.history.length - 1;
      render();
    },
  });
}
