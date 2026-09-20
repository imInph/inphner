/**
 * inphner: the Tools view (inphner-prompt.md §A9) — a scramble generator you
 * can print, solver hints for the start of a solve, a metronome and a BLD memo
 * helper. Everything here is optional practice equipment, so nothing runs
 * until you ask for it: the solver worker and cubing.js load on first use.
 */
import { EVENTS, eventDef } from '../events.ts';
import { prefs } from '../prefs.ts';
import { nextScramble } from '../scramble/generator.ts';
import { currentSession, currentSolves } from '../store.ts';
import { cubeFromScramble } from '../tools/cube.ts';
import { memoFor, pairs, SPEFFZ, type Scheme } from '../tools/memo.ts';
import { COLOUR_HEX, COLOUR_NAMES, describeOrientation, FACE_ORDER, orientations } from '../tools/orient.ts';
import { netSvg } from '../scramble/net.ts';
import type { Face } from '../scramble/nxn.ts';
import { metronomeRunning, setMetronomeBpm, startMetronome, stopMetronome, tapTempo } from '../tools/metronome.ts';
import type { HintKind, HintOption, HintReply } from '../tools/solver-worker.ts';
import { esc, onAction } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { toast } from '../ui/toast.ts';

const COUNTS = [5, 12, 25, 50];
const HINT_ROWS: [HintKind, string, string][] = [
  ['cross', 'Cross', 'The optimal cross, at most 8 moves.'],
  ['xcross', 'XCross', 'The cross and one F2L pair together, whichever pair is cheapest.'],
  ['eoline', 'EOLine', 'Every edge oriented, the line placed (ZZ).'],
  ['fb', 'First block', 'The left block (Roux). The table takes a few seconds to build.'],
];
const EDGE_BUFFERS: [string, number][] = [['UF', 0], ['DF', 8], ['UR', 2], ['UB', 4]];
const CORNER_BUFFERS: [string, number][] = [['UFR', 0], ['UBL', 6], ['ULF', 9], ['DFL', 15]];

interface ToolsState {
  event: string;
  count: number;
  scrambles: string[];
  busy: boolean;
  hintScramble: string;
  hints: Partial<Record<HintKind, { options: HintOption[]; pick: number }>>;
  hintBusy: HintKind | null;
  crossColour: Face | 'any';
  bpm: number;
  accent: number;
  memoScramble: string;
  edgeBuffer: number;
  cornerBuffer: number;
  scheme: Scheme;
}

const state: ToolsState = {
  event: '333', count: 12, scrambles: [], busy: false,
  hintScramble: '', hints: {}, hintBusy: null, crossColour: 'U',
  bpm: 120, accent: 4,
  memoScramble: '', edgeBuffer: 0, cornerBuffer: 0, scheme: SPEFFZ,
};

let host: HTMLElement | null = null;
let worker: Worker | null = null;
let hintId = 0;
let taps: number[] = [];

/* ------------------------------------------------------------------ saved */

const KEY = 'inphner.memo';

function loadMemoPrefs(): void {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as
      { edgeBuffer?: number; cornerBuffer?: number; scheme?: Scheme } | null;
    if (!raw) return;
    if (typeof raw.edgeBuffer === 'number') state.edgeBuffer = raw.edgeBuffer;
    if (typeof raw.cornerBuffer === 'number') state.cornerBuffer = raw.cornerBuffer;
    const s = raw.scheme;
    if (s && Array.isArray(s.edges) && s.edges.length === 24 && Array.isArray(s.corners) && s.corners.length === 24) {
      state.scheme = { edges: s.edges.map(String), corners: s.corners.map(String) };
    }
  } catch { /* a corrupt scheme just means Speffz */ }
}

function saveMemoPrefs(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      edgeBuffer: state.edgeBuffer, cornerBuffer: state.cornerBuffer, scheme: state.scheme,
    }));
  } catch { /* private mode: it just won't be remembered */ }
}

/* ------------------------------------------------------------ the cards */

function scrambleCard(): string {
  const options = (group: 'wca' | 'training') => EVENTS.filter((e) => e.group === group)
    .map((e) => `<option value="${e.id}" ${e.id === state.event ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
  return `
    <section class="card" style="--i:0">
      <div class="card-head"><span class="badge-ico tint-green">${icon('cube', 16)}</span><h3>Scramble generator</h3>
        <small class="text-dim">Official random-state scrambles</small></div>
      <div class="field-row">
        <label><span>Event</span><select data-field="event">
          <optgroup label="WCA">${options('wca')}</optgroup><optgroup label="Training">${options('training')}</optgroup>
        </select></label>
        <label style="flex:0 1 120px"><span>How many</span><select data-field="count">
          ${COUNTS.map((n) => `<option value="${n}" ${n === state.count ? 'selected' : ''}>${n}</option>`).join('')}
        </select></label>
        <button class="btn btn-primary" data-action="generate" style="align-self:flex-end" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? 'Generating…' : 'Generate'}</button>
      </div>
      ${state.scrambles.length ? `
        <div class="tool-actions">
          <button type="button" class="btn btn-sm" data-action="copy-scrambles">${icon('copy', 16)} Copy all</button>
          <button type="button" class="btn btn-sm" data-action="print-scrambles">Print</button>
          <span class="grow"></span>
          <small class="text-dim">${state.scrambles.length} × ${esc(eventDef(state.event).name)}</small>
        </div>
        <ol class="scramble-sheet mono" id="scramble-sheet">
          ${state.scrambles.map((s) => `<li>${esc(s)}</li>`).join('')}
        </ol>` : '<p class="text-faint" style="margin:12px 0 0">Big cubes take a few seconds the first time: cubing.js warms up its solver.</p>'}
    </section>`;
}

function hintRow(kind: HintKind, label: string, note: string): string {
  const hint = state.hints[kind];
  const option = hint?.options[hint.pick];
  const moves = option ? option.moves.join(' ') : '';
  const count = option?.moves.length ?? 0;

  // With "Any" the six colours are all shown with what they cost: no silent
  // pick, and you can see whether your second colour is worth learning.
  const chips = hint && hint.options.length > 1
    ? `<div class="hint-colours">${hint.options.map((o, i) => `
        <button type="button" class="hint-colour${i === hint.pick ? ' on' : ''}" data-action="hint-pick"
          data-kind="${kind}" data-index="${i}" style="--sw:${COLOUR_HEX[o.colour as Face]}"
          aria-pressed="${i === hint.pick}" title="${esc(COLOUR_NAMES[o.colour as Face])}">
          <i aria-hidden="true"></i><span class="num">${o.moves.length}</span></button>`).join('')}</div>`
    : '';

  const answer = () => {
    if (state.hintBusy === kind) return '<span class="text-dim">Building the table…</span>';
    if (!option) return `<span class="text-faint">${esc(note)}</span>`;
    return `
      <div class="hint-hold">Hold it <strong>${esc(describeOrientation(option.rotation))}</strong>${
        option.rotation ? ` — that's <span class="mono">${esc(option.rotation)}</span>` : ' — no rotation needed'}${
        kind === 'xcross' ? ', pair in the front-right slot' : ''}</div>
      ${count ? `<div class="mono hint-moves">${esc(moves)}</div>
        <small class="text-dim">${count} move${count === 1 ? '' : 's'}, optimal</small>`
        : '<div class="text-good">Already done.</div>'}
      ${chips}`;
  };

  // Two nets, so nothing has to be taken on trust: the cube as it should look
  // once it's turned the right way up, and how it should look when you're done.
  // If the first doesn't match your cube, the scramble is the problem, not the hint.
  const nets = option
    ? `<div class="hint-nets">
        <figure class="hint-net">${netSvg(3, [state.hintScramble, option.rotation].filter(Boolean).join(' '), 118)}
          <figcaption>now</figcaption></figure>
        <span class="hint-arrow" aria-hidden="true">${icon('right', 14)}</span>
        <figure class="hint-net">${netSvg(3, [state.hintScramble, option.rotation, moves].filter(Boolean).join(' '), 118)}
          <figcaption>after</figcaption></figure>
      </div>`
    : '';
  return `
    <div class="hint-row${option ? ' has-answer' : ''}">
      <button type="button" class="btn btn-sm" data-action="hint" data-kind="${kind}" ${state.hintBusy ? 'disabled' : ''}>${esc(label)}</button>
      <div class="hint-answer">${answer()}</div>
      ${nets}
    </div>`;
}

function colourPicker(): string {
  const swatch = (face: Face) => `
    <button type="button" class="cross-colour ${state.crossColour === face ? 'on' : ''}" data-action="cross-colour"
      data-value="${face}" style="--sw:${COLOUR_HEX[face]}" aria-pressed="${state.crossColour === face}"
      title="${esc(COLOUR_NAMES[face])}" aria-label="${esc(COLOUR_NAMES[face])} cross"></button>`;
  return `
    <div class="cross-colours">
      <span class="micro-label">Cross colour</span>
      ${FACE_ORDER.map(swatch).join('')}
      <button type="button" class="btn btn-sm ${state.crossColour === 'any' ? 'btn-primary' : ''}"
        data-action="cross-colour" data-value="any" aria-pressed="${state.crossColour === 'any'}"
        title="Try all six and show the shortest">Any</button>
    </div>`;
}

function hintCard(): string {
  return `
    <section class="card" style="--i:1">
      <div class="card-head"><span class="badge-ico tint-green">${icon('target', 16)}</span><h3>Solver hints</h3>
        <small class="text-dim">Look after the solve, not before</small></div>
      <label><span>Scramble</span><textarea class="mono scramble-field" data-field="hintScramble" rows="2"
        placeholder="R U R' U' …" spellcheck="false" autocomplete="off">${esc(state.hintScramble)}</textarea></label>
      <div class="tool-actions" style="margin-top:8px">
        <button type="button" class="btn btn-sm" data-action="hint-last">Use my last solve</button>
        <button type="button" class="btn btn-sm" data-action="hint-current">Use the current scramble</button>
      </div>
      ${colourPicker()}
      <div class="hint-list" id="hint-list">${HINT_ROWS.map(([kind, label, note]) => hintRow(kind, label, note)).join('')}</div>
      <small class="text-faint" style="display:block;margin-top:10px">
        Hold the cube the way the scramble was applied — white on top, green in front — then do the
        rotation at the front of the answer. With <strong>Any</strong>, every colour is solved and
        the cost of each one is shown; click a colour to see its solution.</small>
    </section>`;
}

function metronomeCard(): string {
  const on = metronomeRunning();
  return `
    <section class="card" style="--i:2">
      <div class="card-head"><span class="badge-ico tint-green">${icon('clock', 16)}</span><h3>Metronome</h3>
        <small class="text-dim">For turn speed practice</small></div>
      <div class="metronome">
        <div class="bpm num" id="bpm-readout">${state.bpm}<small> BPM</small></div>
        <div class="range-field">
          <input type="range" min="30" max="260" step="1" value="${state.bpm}" data-field="bpm" aria-label="Beats per minute">
        </div>
      </div>
      <div class="field-row" style="align-items:flex-end">
        <label style="flex:0 1 150px"><span>Accent every</span><select data-field="accent">
          ${[1, 2, 3, 4, 6, 8].map((n) => `<option value="${n}" ${n === state.accent ? 'selected' : ''}>${n === 1 ? 'no accent' : `${n} beats`}</option>`).join('')}
        </select></label>
        <button class="btn ${on ? 'btn-danger' : 'btn-primary'}" data-action="metronome">${on ? 'Stop' : 'Start'}</button>
        <button class="btn" data-action="tap">Tap tempo</button>
        <span class="beat-dot" id="beat-dot" aria-hidden="true"></span>
      </div>
    </section>`;
}

/** The letters themselves: repainted on its own while you type. */
function memoBody(): string {
  const cube = state.memoScramble.trim() ? cubeFromScramble(state.memoScramble) : null;
  const memo = cube ? memoFor(cube, { scheme: state.scheme, edgeBuffer: state.edgeBuffer, cornerBuffer: state.cornerBuffer }) : null;
  return `<div class="memo-body" id="memo-body">
      ${state.memoScramble.trim() && !memo ? '<p class="text-bad" style="margin:12px 0 0">That scramble has notation this helper cannot read.</p>' : ''}
      ${memo ? `
        <div class="memo-out">
          <div><div class="micro-label">Edges · ${memo.edges.length}</div>
            <div class="mono memo-letters">${memo.edges.length ? esc(pairs(memo.edges).join(' ')) : '—'}</div></div>
          <div><div class="micro-label">Corners · ${memo.corners.length}</div>
            <div class="mono memo-letters">${memo.corners.length ? esc(pairs(memo.corners).join(' ')) : '—'}</div></div>
        </div>
        <p class="text-dim" style="margin:10px 0 0">
          ${memo.parity ? '<strong>Parity.</strong> ' : ''}
          ${memo.flipped.length ? `Flipped in place: <span class="mono">${esc(memo.flipped.join(' '))}</span>. ` : ''}
          ${memo.twisted.length ? `Twisted in place: <span class="mono">${esc(memo.twisted.join(' '))}</span>.` : ''}
          ${!memo.parity && !memo.flipped.length && !memo.twisted.length ? 'No parity, nothing flipped or twisted.' : ''}
        </p>` : ''}
    </div>`;
}

function memoCard(): string {
  const buffer = (label: string, field: string, list: [string, number][], value: number) => `
    <label style="flex:0 1 140px"><span>${label}</span><select data-field="${field}">
      ${list.map(([name, sticker]) => `<option value="${sticker}" ${sticker === value ? 'selected' : ''}>${name}</option>`).join('')}
    </select></label>`;
  return `
    <section class="card" style="--i:3">
      <div class="card-head"><span class="badge-ico tint-green">${icon('book', 16)}</span><h3>BLD memo helper</h3>
        <small class="text-dim">Speffz by default</small></div>
      <label><span>Scramble</span><textarea class="mono scramble-field" data-field="memoScramble" rows="2"
        placeholder="R U R' U' …" spellcheck="false" autocomplete="off">${esc(state.memoScramble)}</textarea></label>
      <div class="field-row" style="margin-top:10px">
        ${buffer('Edge buffer', 'edgeBuffer', EDGE_BUFFERS, state.edgeBuffer)}
        ${buffer('Corner buffer', 'cornerBuffer', CORNER_BUFFERS, state.cornerBuffer)}
        <button type="button" class="btn btn-sm" data-action="memo-current" style="align-self:flex-end">Use the current scramble</button>
      </div>
      ${memoBody()}
      <details class="scheme-editor">
        <summary>Letter scheme</summary>
        <div class="tool-actions" style="margin:10px 0">
          <button type="button" class="btn btn-sm" data-action="scheme-reset">Reset to Speffz</button>
          <small class="text-dim">Stickers in Speffz order: U, L, F, R, B, D — clockwise from each face's top-left.</small>
        </div>
        ${(['corners', 'edges'] as const).map((orbit) => `
          <div class="micro-label" style="margin:8px 0 4px">${orbit === 'corners' ? 'Corners' : 'Edges'}</div>
          <div class="scheme-grid">
            ${state.scheme[orbit].map((letter, i) => `<input maxlength="2" data-scheme="${orbit}" data-i="${i}"
              value="${esc(letter)}" aria-label="${orbit} sticker ${i + 1}" autocomplete="off" spellcheck="false">`).join('')}
          </div>`).join('')}
      </details>
    </section>`;
}

/** Grow a scramble box to fit what's in it: a scramble you have to scroll to
 *  read is a scramble you will apply wrongly. */
function fitField(el: HTMLTextAreaElement): void {
  el.style.height = 'auto';
  const style = getComputedStyle(el);
  // scrollHeight is the content box; with border-box the borders must be added
  // back or the last line is cut off.
  const borders = style.boxSizing === 'border-box'
    ? parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth) : 0;
  el.style.height = `${el.scrollHeight + borders}px`;
}

function fitScrambleFields(): void {
  host?.querySelectorAll<HTMLTextAreaElement>('.scramble-field').forEach(fitField);
}

function paint(): void {
  if (!host) return;
  host.innerHTML = `<div class="grid stagger tools-grid">
    ${scrambleCard()}${hintCard()}${metronomeCard()}${memoCard()}
  </div>`;
  fitScrambleFields();
}

/** Repaint one region, so typing doesn't tear the field out from under the cursor. */
function repaint(selector: string, html: string): void {
  const el = host?.querySelector(selector);
  if (!el) return;
  el.outerHTML = html;
}

function paintHints(): void {
  repaint('#hint-list', `<div class="hint-list" id="hint-list">${
    HINT_ROWS.map(([kind, label, note]) => hintRow(kind, label, note)).join('')}</div>`);
}

/* --------------------------------------------------------------- actions */

async function generate(): Promise<void> {
  state.busy = true;
  paint();
  const out: string[] = [];
  try {
    for (let i = 0; i < state.count; i++) out.push(await nextScramble(state.event));
    state.scrambles = out;
  } catch {
    toast('The scrambler could not start. Reload and try again.', { kind: 'bad' });
  } finally {
    state.busy = false;
    paint();
  }
}

function askHint(kind: HintKind): void {
  const scramble = state.hintScramble.trim();
  if (!scramble) {
    toast('Paste a scramble first.', { kind: 'bad' });
    return;
  }
  worker ??= new Worker('js/solver-worker.js');
  worker.onmessage = (e: MessageEvent<HintReply>) => {
    const reply = e.data;
    state.hintBusy = null;
    if (reply.error) toast(reply.error, { kind: 'bad' });
    else if (reply.options?.length) {
      const options = [...reply.options];
      // Shortest first, so the pick is the best one and the rest stay visible.
      options.sort((a, b) => a.moves.length - b.moves.length);
      state.hints[reply.kind] = { options, pick: 0 };
    }
    paintHints();
  };
  state.hintBusy = kind;
  state.hints[kind] = undefined;
  paintHints();
  // The cross is the same whichever way the cube faces; the line, the block and
  // which F2L pair an XCross picks up are not.
  const colours: (Face | 'any')[] = state.crossColour === 'any' ? [...FACE_ORDER] : [state.crossColour];
  worker.postMessage({
    id: ++hintId, kind, scramble,
    groups: colours.map((colour) => ({
      colour: colour as string,
      rotations: orientations(colour, kind !== 'cross'),
    })),
  });
}

function lastScramble(): string | null {
  const solves = currentSolves();
  return solves.length ? solves[solves.length - 1]!.scramble ?? null : null;
}

function currentScramble(): string | null {
  return document.querySelector<HTMLElement>('#scramble-text')?.textContent?.trim() || null;
}

function toggleMetronome(): void {
  if (metronomeRunning()) stopMetronome();
  else {
    startMetronome({
      bpm: state.bpm,
      accent: state.accent,
      volume: prefs().volume,
      onBeat: (beat) => {
        const dot = document.getElementById('beat-dot');
        if (!dot) return;
        dot.classList.toggle('strong', state.accent > 1 && beat % state.accent === 0);
        dot.classList.remove('on');
        void dot.offsetWidth;
        dot.classList.add('on');
      },
    });
  }
  paint();
}

export function renderTools(el: HTMLElement): void {
  host = el;
  loadMemoPrefs();
  if (!state.event) state.event = currentSession().event;
  paint();

  onAction(el, (action, t) => {
    if (action === 'generate') void generate();
    else if (action === 'copy-scrambles') {
      void navigator.clipboard.writeText(state.scrambles.map((s, i) => `${i + 1}. ${s}`).join('\n'))
        .then(() => toast('Scrambles copied.', { kind: 'good' }), () => toast('The clipboard said no.', { kind: 'bad' }));
    } else if (action === 'print-scrambles') {
      document.documentElement.setAttribute('data-print', 'scrambles');
      window.print();
      document.documentElement.removeAttribute('data-print');
    } else if (action === 'hint') askHint(t.dataset.kind as HintKind);
    else if (action === 'hint-last' || action === 'hint-current') {
      const s = action === 'hint-last' ? lastScramble() : currentScramble();
      if (!s) toast(action === 'hint-last' ? 'No solves in this session yet.' : 'Open the Timer first.', { kind: 'bad' });
      else { state.hintScramble = s; state.hints = {}; paint(); }
    } else if (action === 'memo-current') {
      const s = currentScramble() ?? lastScramble();
      if (!s) toast('Open the Timer first.', { kind: 'bad' });
      else { state.memoScramble = s; paint(); }
    } else if (action === 'metronome') toggleMetronome();
    else if (action === 'tap') {
      taps = [...taps.filter((x) => performance.now() - x < 4000), performance.now()];
      const bpm = tapTempo(taps);
      if (bpm) {
        state.bpm = Math.min(260, Math.max(30, bpm));
        setMetronomeBpm(state.bpm);
        paint();
      }
    } else if (action === 'hint-pick') {
      const hint = state.hints[t.dataset.kind as HintKind];
      if (hint) hint.pick = Number(t.dataset.index);
      paintHints();
    } else if (action === 'cross-colour') {
      state.crossColour = t.dataset.value as Face | 'any';
      state.hints = {};
      paint();
    } else if (action === 'scheme-reset') {
      state.scheme = SPEFFZ;
      saveMemoPrefs();
      paint();
    }
  });

  el.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.classList.contains('scramble-field')) {
      fitField(t as unknown as HTMLTextAreaElement);
      if (t.dataset.field === 'hintScramble') {
        state.hintScramble = t.value;
        state.hints = {};
        paintHints();
      } else {
        state.memoScramble = t.value;
        repaint('#memo-body', memoBody());
      }
      return;
    }
    if (t.dataset.field === 'bpm') {
      state.bpm = Number(t.value);
      setMetronomeBpm(state.bpm);
      const out = document.getElementById('bpm-readout');
      if (out) out.innerHTML = `${state.bpm}<small> BPM</small>`;
    }
  });

  el.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const field = t.dataset.field;
    const orbit = t.dataset.scheme as 'edges' | 'corners' | undefined;
    if (orbit) {
      const letters = [...state.scheme[orbit]];
      letters[Number(t.dataset.i)] = t.value.trim().toUpperCase().slice(0, 2);
      state.scheme = { ...state.scheme, [orbit]: letters };
      saveMemoPrefs();
      paint();
      return;
    }
    if (field === 'event') { state.event = t.value; state.scrambles = []; paint(); }
    else if (field === 'count') { state.count = Number(t.value); }
    else if (field === 'accent') { state.accent = Number(t.value); if (metronomeRunning()) { stopMetronome(); toggleMetronome(); } }
    else if (field === 'edgeBuffer' || field === 'cornerBuffer') {
      state[field] = Number(t.value);
      saveMemoPrefs();
      paint();
    }
  });
}

/** Leaving the view silences the metronome. */
export function leaveTools(): void {
  stopMetronome();
}
