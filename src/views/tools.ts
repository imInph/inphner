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
import { currentScramble as timerScramble } from './scramble-card.ts';
import type { Face } from '../scramble/nxn.ts';
import { metronomeRunning, setMetronomeBpm, startMetronome, stopMetronome, tapTempo } from '../tools/metronome.ts';
import type { HintKind, HintOption, HintReply } from '../tools/solver-worker.ts';
import { esc, onAction } from '../ui/dom.ts';
import { attachSide, clampOffset, components, edgesFor, findAttach, offsetFrom, positionFrom, reflow, snapOffset, touching, type Edges, type Rect } from '../ui/snap.ts';
import { setDock } from './scramble-card.ts';
import { icon } from '../ui/icons.ts';
import { toast } from '../ui/toast.ts';

const MAX_COUNT = 200;
const SIZES = { min: 6, max: 32, standard: 11 };
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
  /** The printed sheet's font size, in points. */
  fontPt: number;
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
  event: '333', count: 12, fontPt: SIZES.standard, scrambles: [], busy: false,
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

const SHEET_KEY = 'inphner.scrambleSheet';

function loadSheetPrefs(): void {
  try {
    const raw = JSON.parse(localStorage.getItem(SHEET_KEY) ?? 'null') as { count?: number; fontPt?: number } | null;
    if (!raw) return;
    if (typeof raw.count === 'number') state.count = clampInt(raw.count, 1, MAX_COUNT, state.count);
    if (typeof raw.fontPt === 'number') state.fontPt = clampInt(raw.fontPt, SIZES.min, SIZES.max, state.fontPt);
  } catch { /* defaults it is */ }
}

function saveSheetPrefs(): void {
  try {
    localStorage.setItem(SHEET_KEY, JSON.stringify({ count: state.count, fontPt: state.fontPt }));
  } catch { /* private mode: it just won't be remembered */ }
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/*
 * Two columns only when every scramble line fits in half the page in at most
 * two lines (one line only fits a 3x3 scramble at about 6pt). The page is taken as A4 (narrower than US Letter, so it holds for
 * both) with the 12 mm margins set in the print stylesheet.
 */
const PT_PER_MM = 72 / 25.4;
const PRINT_WIDTH_PT = (210 - 2 * 12) * PT_PER_MM;
const COLUMN_GAP_PT = 24;
let measureCtx: CanvasRenderingContext2D | null = null;

function fitsTwoColumns(scrambles: string[], fontPt: number): boolean {
  if (!scrambles.length) return false;
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return false;
  const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace';
  measureCtx.font = `560 ${fontPt}pt ${mono}`;
  // The number takes 3em at the start of each item (.ps-n in the print CSS).
  const column = (PRINT_WIDTH_PT - COLUMN_GAP_PT) / 2 - 3 * fontPt;
  // canvas measures in CSS px; 1pt = 4/3 px.
  const widest = Math.max(...scrambles.flatMap((s) => s.split('\n')).map((line) => measureCtx!.measureText(line).width));
  // 1.85, not 2: wrapping happens between moves, so a line never fills its width.
  return widest * 0.75 <= column * 1.85;
}

/** PLL/OLL attack and "No scramble" start from solved: nothing to generate. */
function hasScramble(id: string): boolean {
  return eventDef(id).scrambler.kind !== 'none';
}

/* ------------------------------------------------------------ the cards */

function scrambleCard(): string {
  const options = (group: 'wca' | 'other' | 'training') => EVENTS.filter((e) => e.group === group && hasScramble(e.id))
    .map((e) => `<option value="${e.id}" ${e.id === state.event ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
  return `
    <section class="card" style="--i:0">
      <div class="card-head"><span class="badge-ico tint-green">${icon('cube', 16)}</span><h3>Scramble generator</h3>
        <small class="text-dim">Official random-state scrambles</small>${headButtons('scramble')}</div>
      <div class="field-row">
        <label><span>Event</span><select data-field="event">
          <optgroup label="WCA">${options('wca')}</optgroup><optgroup label="Other puzzles">${options('other')}</optgroup><optgroup label="Training">${options('training')}</optgroup>
        </select></label>
        <label style="flex:0 1 100px"><span>How many</span><input type="number" inputmode="numeric"
          data-field="count" min="1" max="${MAX_COUNT}" step="1" value="${state.count}"></label>
        <label style="flex:0 1 100px"><span>Print size (pt)</span><input type="number" inputmode="numeric"
          data-field="fontPt" min="${SIZES.min}" max="${SIZES.max}" step="1" value="${state.fontPt}"></label>
        <button class="btn btn-primary" data-action="generate" style="align-self:flex-end" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? 'Generating…' : 'Generate'}</button>
      </div>
      ${state.scrambles.length ? `
        <div class="tool-actions">
          <button type="button" class="btn btn-sm" data-action="copy-scrambles">${icon('copy', 16)} Copy all</button>
          <button type="button" class="btn btn-sm" data-action="print-scrambles">Print</button>
          <span class="grow"></span>
          <small class="text-dim">${state.scrambles.length} × ${esc(eventDef(state.event).name)} · prints in ${
            fitsTwoColumns(state.scrambles, state.fontPt) ? 'two columns' : 'one column'}</small>
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
        <small class="text-dim">Look after the solve, not before</small>${headButtons('hints')}</div>
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
        <small class="text-dim">For turn speed practice</small>${headButtons('metronome')}</div>
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
        <small class="text-dim">Speffz by default</small>${headButtons('memo')}</div>
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
  for (const root of [host, layer]) root?.querySelectorAll<HTMLTextAreaElement>('.scramble-field').forEach(fitField);
}

/** Each card lives in exactly one place: the Tools grid, or its floating window. */
function paint(): void {
  if (host) {
    host.innerHTML = `<div class="grid stagger tools-grid">
      ${TOOL_IDS.map((id) => (popped[id] ? awayCard(id) : CARDS[id]())).join('')}
    </div>`;
  }
  paintFloats();
  fitScrambleFields();
}

/** Repaint one region, so typing doesn't tear the field out from under the cursor. */
function repaint(selector: string, html: string): void {
  const el = host?.querySelector(selector) ?? layer?.querySelector(selector);
  if (!el) return;
  el.outerHTML = html;
}

/* ------------------------------------------------------------- pop-outs */

/*
 * Any tool card can pop out of the grid into a floating window that stays on
 * screen on every page (the metronome keeps ticking on the Timer). The windows
 * live in one layer on <body>, outside the views, so switching pages never
 * re-renders them. They move by their header, resize from the corner, snap to
 * the screen and to each other, and windows dropped against each other stick:
 * they move as one until one is detached (its button, or Shift-drag). They
 * fade with the chrome while a solve runs. All of it survives a reload.
 * The geometry is ui/snap.ts (pure, tested).
 */
type ToolId = 'scramble' | 'hints' | 'metronome' | 'memo';
/** The Timer's cards a window can stick to; 'slot' is the dock between the two. */
type AnchorId = 'scramble' | 'preview' | 'slot';
interface Anchor extends Edges { to: AnchorId; dx: number; dy: number }
interface Float { x: number; y: number; w?: number; h?: number; folded?: boolean; anchor?: Anchor }

const TOOL_IDS: ToolId[] = ['scramble', 'hints', 'metronome', 'memo'];
const TOOL_NAMES: Record<ToolId, string> = {
  scramble: 'Scramble generator', hints: 'Solver hints', metronome: 'Metronome', memo: 'BLD memo helper',
};
const TOOL_ICONS: Record<ToolId, Parameters<typeof icon>[0]> = {
  scramble: 'cube', hints: 'target', metronome: 'clock', memo: 'book',
};
const CARDS: Record<ToolId, () => string> = {
  scramble: () => scrambleCard(), hints: () => hintCard(), metronome: () => metronomeCard(), memo: () => memoCard(),
};
const POP_KEY = 'inphner.popped';
const EDGE = 8;
/** How much of a window must stay above the bottom of the screen: its header. */
const KEEP = 64;
const MIN_W = 260;
const MIN_H = 120;
const DOCK_MAX = 520;

let popped: Partial<Record<ToolId, Float>> = {};
/** Pairs of windows stuck together. Groups are whatever these join up. */
let links: [ToolId, ToolId][] = [];
let layer: HTMLElement | null = null;
let onToolsView = false;
let front = 0;

const isLinked = (id: ToolId): boolean => links.some((l) => l.includes(id)) || !!popped[id]?.anchor;

function headButtons(id: ToolId): string {
  const name = esc(TOOL_NAMES[id]);
  if (!popped[id]) {
    return `<button type="button" class="card-open tool-pop" data-action="pop" data-tool="${id}"
      title="Pop out" aria-label="Pop ${name} out">${icon('popout', 16)}</button>`;
  }
  const folded = popped[id]!.folded;
  return `<span class="tool-float-btns">
    ${isLinked(id) ? `<button type="button" class="card-open" data-action="pop-detach" data-tool="${id}"
      title="Detach (or Shift-drag)" aria-label="Detach ${name} from the windows it is stuck to">${icon('unlink', 16)}</button>` : ''}
    <button type="button" class="card-open" data-action="pop-fold" data-tool="${id}" aria-expanded="${!folded}"
      title="${folded ? 'Unfold' : 'Fold'}" aria-label="${folded ? 'Unfold' : 'Fold'} ${name}">${icon(folded ? 'down' : 'minus', 16)}</button>
    <button type="button" class="card-open" data-action="pop-in" data-tool="${id}"
      title="Put back on the Tools page" aria-label="Put ${name} back on the Tools page">${icon('popin', 16)}</button>
  </span>`;
}

/** What stays in the grid while a tool is out. */
function awayCard(id: ToolId): string {
  return `
    <section class="card tool-away">
      <div class="card-head"><span class="badge-ico tint-green">${icon(TOOL_ICONS[id], 16)}</span><h3>${esc(TOOL_NAMES[id])}</h3></div>
      <p class="text-dim">Popped out. It stays on screen on every page until you put it back.</p>
      <button type="button" class="btn btn-sm" data-action="pop-in" data-tool="${id}">${icon('popin', 16)} Put it back</button>
    </section>`;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function parseAnchor(a: unknown): Anchor | undefined {
  const o = a as Partial<Anchor> | undefined;
  if (!o || !['scramble', 'preview', 'slot'].includes(o.to as string)) return undefined;
  const dx = num(o.dx);
  const dy = num(o.dy);
  if (dx === undefined || dy === undefined) return undefined;
  return { to: o.to as AnchorId, dx, dy, ax: o.ax === 'r' ? 'r' : 'l', ay: o.ay === 'b' ? 'b' : 't' };
}

function loadPopped(): void {
  popped = {};
  links = [];
  try {
    const raw = JSON.parse(localStorage.getItem(POP_KEY) ?? '{}') as { windows?: Record<string, Float>; links?: unknown };
    // v1 stored the windows at the top level, with no links.
    const windows = (raw.windows ?? raw) as Record<string, Float>;
    for (const id of TOOL_IDS) {
      const f = windows[id];
      const x = num(f?.x);
      const y = num(f?.y);
      if (x === undefined || y === undefined) continue;
      popped[id] = { x, y, w: num(f!.w), h: num(f!.h), folded: !!f!.folded, anchor: parseAnchor(f!.anchor) };
    }
    if (Array.isArray(raw.links)) {
      for (const l of raw.links) {
        if (Array.isArray(l) && popped[l[0] as ToolId] && popped[l[1] as ToolId] && l[0] !== l[1]) {
          links.push([l[0] as ToolId, l[1] as ToolId]);
        }
      }
    }
  } catch { popped = {}; links = []; }
}

function savePopped(): void {
  try { localStorage.setItem(POP_KEY, JSON.stringify({ windows: popped, links })); } catch { /* private mode: not remembered */ }
  syncDock();
}

/* --- sticking to the Timer's cards --- */

const ANCHOR_SEL: Record<AnchorId, string> = {
  scramble: '#view-timer .scramble-card', preview: '#view-timer .preview-card', slot: '#view-timer .dock-slot',
};

/** Where a Timer card is on screen, or null when it isn't showing (another page, a phone layout). */
function anchorRect(to: AnchorId): Rect | null {
  const el = document.querySelector<HTMLElement>(ANCHOR_SEL[to]);
  if (!el || !el.getClientRects().length) return null;
  const b = el.getBoundingClientRect();
  return b.width ? { x: b.left, y: b.top, w: b.width, h: b.height } : null;
}

/** The dock is as wide and as tall as the windows in it. */
function syncDock(): void {
  // The dock's windows start at its top-left corner, wherever they were let go:
  // a window dropped a little low must not sit lower than the cards beside it.
  const inDock = openIds().filter((id) => popped[id]!.anchor?.to === 'slot');
  if (inDock.length) {
    const minX = Math.min(...inDock.map((id) => popped[id]!.anchor!.dx));
    const minY = Math.min(...inDock.map((id) => popped[id]!.anchor!.dy));
    if (minX || minY) {
      for (const id of inDock) { popped[id]!.anchor!.dx -= minX; popped[id]!.anchor!.dy -= minY; }
      scheduleLayout();
    }
  }
  const docked = inDock.map(rectOf).filter((r) => r.w);
  if (!docked.length) { setDock(0, 0); return; }
  const span = (lo: number[], hi: number[]) => Math.max(...hi) - Math.min(...lo);
  // The row grows to fit, but never by more than 45% of the screen: a tall
  // stack in the dock must not push the timer itself out of sight.
  // Never wider than DOCK_MAX: the scramble beside it must stay readable.
  setDock(Math.min(DOCK_MAX, span(docked.map((r) => r.x), docked.map((r) => r.x + r.w))),
    Math.min(span(docked.map((r) => r.y), docked.map((r) => r.y + r.h)), innerHeight * 0.45));
}

/** Windows stuck to a Timer card go where the card is now. */
function layoutAnchored(): void {
  for (const id of openIds()) {
    const f = popped[id]!;
    const r = f.anchor && anchorRect(f.anchor.to);
    // Stuck to a card on screen, it's part of the page: no floating shadow.
    elOf(id)?.classList.toggle('anchored', !!r);
    if (!r) continue;
    const p = positionFrom(r, f.anchor!, f.anchor!);
    f.x = Math.round(p.x);
    f.y = Math.round(p.y);
    place(id);
  }
}

/** After a window stuck to a card moved for another reason, measure its offset again. */
function rebase(id: ToolId): void {
  const f = popped[id];
  const r = f?.anchor && anchorRect(f.anchor.to);
  if (!r) return;
  Object.assign(f!.anchor!, offsetFrom(r, f!, f!.anchor!));
}

let layoutQueued = false;
function scheduleLayout(): void {
  if (layoutQueued) return;
  layoutQueued = true;
  requestAnimationFrame(() => {
    layoutQueued = false;
    layoutAnchored();
    // The Timer page slides in as it opens (viewIn): measured mid-slide, a stuck
    // window lands a few px off. Measure again once the slide has finished.
    const sliding = document.getElementById('view-timer')?.getAnimations().filter((a) => a.playState === 'running') ?? [];
    if (sliding.length) void Promise.allSettled(sliding.map((a) => a.finished)).then(scheduleLayout);
  });
}

/**
 * A group dropped against the Timer's scramble or preview sticks to it. Against
 * the inner edge of either, the side facing the other card, it goes into the
 * dock between them, which then opens up to its width.
 */
function stickToCards(ids: ToolId[]): void {
  const cards = (['scramble', 'preview'] as const)
    .map((to) => [to, anchorRect(to)] as const).filter((c): c is readonly ['scramble' | 'preview', Rect] => !!c[1]);
  // Touching both cards (under the scramble's end and the preview, say): the
  // one it shares the longer edge with wins.
  let hit: { to: 'scramble' | 'preview'; side: ReturnType<typeof attachSide> & {}; shared: number } | null = null;
  for (const i of ids) {
    const w = rectOf(i);
    for (const [to, r] of cards) {
      const side = attachSide(w, r);
      if (!side) continue;
      const shared = side === 'left' || side === 'right'
        ? Math.min(w.y + w.h, r.y + r.h) - Math.max(w.y, r.y)
        : Math.min(w.x + w.w, r.x + r.w) - Math.max(w.x, r.x);
      if (!hit || shared > hit.shared) hit = { to, side, shared };
    }
  }
  if (!hit) { ids.forEach((i) => delete popped[i]!.anchor); return; }
  const between = (hit.to === 'preview' && hit.side === 'left') || (hit.to === 'scramble' && hit.side === 'right');
  if (between && innerWidth > 768) {
    const left = Math.min(...ids.map((i) => popped[i]!.x));
    const top = Math.min(...ids.map((i) => popped[i]!.y));
    for (const i of ids) popped[i]!.anchor = { to: 'slot', ax: 'l', ay: 't', dx: popped[i]!.x - left, dy: popped[i]!.y - top };
    return;
  }
  const r = anchorRect(hit.to)!;
  const edges = edgesFor(hit.side);
  for (const i of ids) popped[i]!.anchor = { to: hit.to, ...edges, ...offsetFrom(r, popped[i]!, edges) };
}

const openIds = (): ToolId[] => TOOL_IDS.filter((id) => popped[id]);
const elOf = (id: ToolId): HTMLElement | null => layer?.querySelector<HTMLElement>(`.tool-float[data-tool="${id}"]`) ?? null;

function rectOf(id: ToolId): Rect {
  const f = popped[id]!;
  const el = elOf(id);
  return { x: f.x, y: f.y, w: el?.offsetWidth ?? 0, h: el?.offsetHeight ?? 0 };
}

function groups(): ToolId[][] {
  const ids = openIds();
  const pairs = links.map(([a, b]) => [ids.indexOf(a), ids.indexOf(b)] as [number, number])
    .filter(([a, b]) => a >= 0 && b >= 0);
  return components(ids.length, pairs).map((g) => g.map((i) => ids[i]!));
}

const groupOf = (id: ToolId): ToolId[] => groups().find((g) => g.includes(id)) ?? [id];

function unlink(id: ToolId): void {
  links = links.filter((l) => !l.includes(id));
  if (popped[id]) delete popped[id]!.anchor;
}

/** Put a window where its Float says. Whatever doesn't fit scrolls inside it. */
function place(id: ToolId): void {
  const f = popped[id];
  const el = elOf(id);
  if (!f || !el) return;
  el.style.left = `${f.x}px`;
  el.style.top = `${f.y}px`;
  el.style.width = f.w ? `${Math.min(f.w, innerWidth - 2 * EDGE)}px` : '';
  const card = el.querySelector<HTMLElement>('.card');
  if (!card) return;
  const room = innerHeight - f.y - EDGE;
  card.style.maxHeight = `${room}px`;
  card.style.height = f.h && !f.folded ? `${Math.min(f.h, room)}px` : '';
}

/** Keep every group's headers on screen, whatever the viewport did meanwhile. */
function fitAll(): void {
  for (const g of groups()) {
    // A group stuck to a card on screen goes where the card goes, even off screen.
    if (g.some((id) => popped[id]!.anchor && anchorRect(popped[id]!.anchor!.to))) continue;
    const { dx, dy } = clampOffset(g.map(rectOf), 0, 0, { w: innerWidth, h: innerHeight }, EDGE, KEEP);
    if (!dx && !dy) continue;
    for (const id of g) {
      popped[id]!.x = Math.round(popped[id]!.x + dx);
      popped[id]!.y = Math.round(popped[id]!.y + dy);
      place(id);
    }
  }
}

function ensureLayer(): HTMLElement {
  if (layer) return layer;
  layer = document.createElement('div');
  layer.className = 'tool-layer';
  document.body.append(layer);
  bind(layer);
  layer.addEventListener('pointerdown', onFloatPointerDown);
  window.addEventListener('resize', () => {
    for (const id of openIds()) place(id);
    layoutAnchored();
    fitAll();
  });
  // The Timer's cards move with the page, a new scramble, the size grips, the dock.
  window.addEventListener('inphner:layout', scheduleLayout);
  window.addEventListener('scroll', scheduleLayout, { capture: true, passive: true });
  window.addEventListener('hashchange', scheduleLayout);
  return layer;
}

function paintFloats(): void {
  const ids = openIds();
  if (!ids.length && !layer) return;
  const root = ensureLayer();
  root.querySelectorAll<HTMLElement>('.tool-float').forEach((el) => {
    if (!popped[el.dataset.tool as ToolId]) el.remove();
  });
  for (const id of ids) {
    let el = elOf(id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'tool-float';
      el.dataset.tool = id;
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', TOOL_NAMES[id]);
      root.append(el);
    }
    el.classList.toggle('folded', !!popped[id]!.folded);
    el.innerHTML = `${CARDS[id]()}<div class="tool-resize" aria-hidden="true" title="Drag to resize"></div>`;
    place(id);
  }
  layoutAnchored();
  fitAll();
  syncDock(); // what's in a docked window may have changed height
}

function popOut(id: ToolId, from: HTMLElement | null): void {
  const card = from?.closest<HTMLElement>('.card');
  const r = card?.getBoundingClientRect();
  // Cascade new windows so two popped at once don't sit exactly on top of each other.
  const n = Object.keys(popped).length;
  // Start where the card was, moved up if that would run it off the bottom.
  popped[id] = r
    ? { x: r.left, y: Math.min(r.top, innerHeight - Math.min(r.height, innerHeight * 0.6) - EDGE) }
    : { x: 24 + n * 28, y: 80 + n * 28 };
  savePopped();
  paint();
}

function popIn(id: ToolId): void {
  unlink(id);
  delete popped[id];
  savePopped();
  // Off the Tools page a metronome put back would tick on with nothing to stop it.
  if (id === 'metronome' && !onToolsView) stopMetronome();
  paint();
}

function detach(id: ToolId): void {
  unlink(id);
  // Nudge it off its neighbours so it is plainly on its own again.
  const f = popped[id];
  if (f) { f.x += 16; f.y += 16; delete f.anchor; }
  savePopped();
  paint();
}

/** A window changed size (fold, unfold, resize): keep its group's stack together. */
function reflowAround(id: ToolId, before: Rect, rest: Map<ToolId, Rect>): void {
  const ids = [...rest.keys()];
  const moved = reflow(before, rectOf(id), ids.map((i) => rest.get(i)!));
  ids.forEach((i, k) => {
    popped[i]!.x = Math.round(moved[k]!.x);
    popped[i]!.y = Math.round(moved[k]!.y);
    place(i);
    rebase(i);
  });
}

function toggleFold(id: ToolId): void {
  const f = popped[id];
  if (!f) return;
  const before = rectOf(id);
  const rest = new Map(groupOf(id).filter((i) => i !== id).map((i) => [i, rectOf(i)] as const));
  f.folded = !f.folded;
  paintFloats();
  fitScrambleFields();
  reflowAround(id, before, rest);
  fitAll();
  savePopped();
}

/** Follow one pointer until it lets go. */
function track(target: HTMLElement, e: PointerEvent, move: (dx: number, dy: number) => void, done: () => void): void {
  const sx = e.clientX;
  const sy = e.clientY;
  try { target.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
  const onMove = (m: PointerEvent): void => move(m.clientX - sx, m.clientY - sy);
  const onUp = (): void => {
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', onUp);
    target.removeEventListener('pointercancel', onUp);
    done();
  };
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onUp);
  target.addEventListener('pointercancel', onUp);
}

function onFloatPointerDown(e: PointerEvent): void {
  const t = e.target as HTMLElement;
  const el = t.closest<HTMLElement>('.tool-float');
  const id = el?.dataset.tool as ToolId | undefined;
  if (!el || !id || !popped[id]) return;
  // The group you touch comes to the front. A z-index, not a re-append: moving
  // the node between press and release would swallow the click.
  for (const g of groupOf(id)) { const w = elOf(g); if (w) w.style.zIndex = String(++front); }
  if (e.button !== 0) return;
  if (t.closest('.tool-resize')) startResize(id, el, t, e);
  else if (t.closest('.card-head') && !t.closest('button, a, input, select, textarea')) startDrag(id, t, e);
}

type Target = { kind: 'window'; id: ToolId; rect: Rect } | { kind: 'card'; id: 'scramble' | 'preview'; rect: Rect };

/** While dragging: outline the window(s) and what they'd stick to; the divider for the dock. */
function showTarget(ids: ToolId[], t: (Target & { side: string }) | null): void {
  document.querySelectorAll('.attach-target').forEach((el) => el.classList.remove('attach-target'));
  document.querySelector('.scramble-wrap.dock-target')?.classList.remove('dock-target');
  ids.forEach((i) => elOf(i)?.classList.toggle('attach-on', !!t));
  if (!t) return;
  if (t.kind === 'window') { elOf(t.id)?.classList.add('attach-target'); return; }
  const card = document.querySelector<HTMLElement>(ANCHOR_SEL[t.id]);
  const wrap = card?.closest<HTMLElement>('.scramble-wrap');
  const dock = innerWidth > 768 && ((t.id === 'preview' && t.side === 'left') || (t.id === 'scramble' && t.side === 'right'));
  if (dock && wrap?.querySelector('.scr-grip-preview')) wrap.classList.add('dock-target');
  else card?.classList.add('attach-target');
}

function startDrag(id: ToolId, handle: HTMLElement, e: PointerEvent): void {
  e.preventDefault();
  if (e.shiftKey && isLinked(id)) { unlink(id); paintFloats(); }
  const ids = groupOf(id);
  const view = { w: innerWidth, h: innerHeight };
  let start: Rect[] = [];
  let targets: Target[] = [];
  let lifted = false;
  // Nothing lets go until the pointer has really moved: a click on the header
  // must not pull a window off its card or out of the dock.
  const lift = (): void => {
    lifted = true;
    if (ids.some((i) => popped[i]!.anchor)) {
      ids.forEach((i) => delete popped[i]!.anchor);
      syncDock(); // leaving the dock closes it
    }
    start = ids.map(rectOf);
    targets = [
      ...openIds().filter((i) => !ids.includes(i)).map((i): Target => ({ kind: 'window', id: i, rect: rectOf(i) })),
      ...(['scramble', 'preview'] as const).flatMap((to): Target[] => {
        const rect = anchorRect(to);
        return rect ? [{ kind: 'card', id: to, rect }] : [];
      }),
    ];
    ids.forEach((i) => elOf(i)?.classList.add('dragging'));
  };
  track(handle, e, (mx, my) => {
    if (!lifted) {
      if (Math.hypot(mx, my) < 4) return;
      lift();
    }
    let d = clampOffset(start, mx, my, view, EDGE, KEEP);
    const moved = start.map((r) => ({ ...r, x: r.x + d.dx, y: r.y + d.dy }));
    // Near something it can stick to: jump into place and light both up, so
    // it's plain that letting go now will stick it.
    const att = findAttach(moved, targets.map((t) => t.rect));
    const hitTarget = att ? targets[att.index] : undefined;
    if (att && hitTarget) {
      const want = { dx: d.dx + att.dx, dy: d.dy + att.dy };
      d = clampOffset(start, want.dx, want.dy, view, EDGE, KEEP);
      showTarget(ids, d.dx === want.dx && d.dy === want.dy ? { ...hitTarget, side: att.side } : null);
    } else {
      const snap = snapOffset(moved, [], view, EDGE); // just the screen's edges
      d = clampOffset(start, d.dx + snap.dx, d.dy + snap.dy, view, EDGE, KEEP);
      showTarget(ids, null);
    }
    ids.forEach((i, k) => {
      popped[i]!.x = Math.round(start[k]!.x + d.dx);
      popped[i]!.y = Math.round(start[k]!.y + d.dy);
      place(i);
    });
  }, () => {
    if (!lifted) return;
    showTarget(ids, null);
    ids.forEach((i) => elOf(i)?.classList.remove('dragging'));
    // Dropped against another window: they stick together from now on.
    for (const i of ids) {
      for (const o of openIds().filter((x) => !ids.includes(x))) {
        if (touching(rectOf(i), rectOf(o))) links.push([i, o]);
      }
    }
    // Now one group: if part of it already holds on to a card, the newcomers hold on too.
    const group = groupOf(id);
    const held = group.find((i) => popped[i]!.anchor);
    const a = held ? popped[held]!.anchor! : null;
    const r = a && anchorRect(a.to);
    if (a && r) {
      for (const i of group) popped[i]!.anchor = { ...a, ...offsetFrom(r, popped[i]!, a) };
    } else stickToCards(group);
    savePopped();
    paintFloats(); // the detach buttons, and windows that just docked go into the dock
  });
}

function startResize(id: ToolId, el: HTMLElement, handle: HTMLElement, e: PointerEvent): void {
  e.preventDefault();
  const f = popped[id]!;
  const card = el.querySelector<HTMLElement>('.card')!;
  const before = rectOf(id);
  const w0 = el.offsetWidth;
  const h0 = card.offsetHeight;
  const rest = new Map(groupOf(id).filter((i) => i !== id).map((i) => [i, rectOf(i)] as const));
  el.classList.add('resizing');
  track(handle, e, (dx, dy) => {
    f.w = Math.round(Math.min(Math.max(MIN_W, w0 + dx), innerWidth - f.x - EDGE));
    f.h = Math.round(Math.min(Math.max(MIN_H, h0 + dy), innerHeight - f.y - EDGE));
    place(id);
    fitScrambleFields();
    reflowAround(id, before, rest);
    if (f.anchor?.to === 'slot') syncDock();
  }, () => {
    el.classList.remove('resizing');
    rebase(id);
    fitAll();
    savePopped();
  });
}

/** At boot: bring back whatever was popped out last time. */
export function initToolPopouts(): void {
  loadPopped();
  if (!Object.keys(popped).length) return;
  loadMemoPrefs();
  loadSheetPrefs();
  paintFloats();
  fitScrambleFields();
}

function paintHints(): void {
  repaint('#hint-list', `<div class="hint-list" id="hint-list">${
    HINT_ROWS.map(([kind, label, note]) => hintRow(kind, label, note)).join('')}</div>`);
}

/* --------------------------------------------------------------- actions */

/**
 * Builds the sheet as its own element on <body> and prints that alone. Two
 * columns read left to right (1 | 2, 3 | 4). It is removed on `afterprint`, not
 * after window.print() returns: Safari returns before it has laid the page out.
 */
function printScrambles(): void {
  document.querySelector('.print-sheet')?.remove();
  const perRow = fitsTwoColumns(state.scrambles, state.fontPt) ? 2 : 1;
  const item = (s: string, i: number) =>
    `<div class="ps-item"><span class="ps-n">${i + 1}.</span><span class="ps-s">${esc(s)}</span></div>`;
  const rows: string[] = [];
  for (let i = 0; i < state.scrambles.length; i += perRow) {
    const pair = state.scrambles.slice(i, i + perRow).map((s, j) => item(s, i + j));
    if (pair.length < perRow) pair.push('<div class="ps-item"></div>');
    rows.push(`<div class="ps-row">${pair.join('')}</div>`);
  }
  const sheet = document.createElement('div');
  sheet.className = 'print-sheet mono';
  sheet.style.setProperty('--print-size', `${state.fontPt}pt`);
  sheet.innerHTML = `<h1>${state.scrambles.length} × ${esc(eventDef(state.event).name)}</h1>${rows.join('')}`;
  document.body.append(sheet);

  const root = document.documentElement;
  root.setAttribute('data-print', 'scrambles');
  const done = () => { root.removeAttribute('data-print'); sheet.remove(); };
  window.addEventListener('afterprint', done, { once: true });
  window.print();
}

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

/** The Timer's scramble (empty until the Timer has shown one this visit). */
function currentScramble(): string | null {
  return timerScramble().trim() || null;
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
  onToolsView = true;
  loadMemoPrefs();
  loadSheetPrefs();
  if (!state.event) state.event = currentSession().event;
  if (!hasScramble(state.event)) state.event = '333';
  paint();
  bind(el);
}

const bound = new WeakSet<HTMLElement>();

/** One set of listeners per container: the Tools view and the pop-out layer. */
function bind(el: HTMLElement): void {
  if (bound.has(el)) return;
  bound.add(el);
  onAction(el, (action, t) => {
    if (action === 'pop') popOut(t.dataset.tool as ToolId, t);
    else if (action === 'pop-in') popIn(t.dataset.tool as ToolId);
    else if (action === 'pop-fold') toggleFold(t.dataset.tool as ToolId);
    else if (action === 'pop-detach') detach(t.dataset.tool as ToolId); else if (action === 'generate') void generate();
    else if (action === 'copy-scrambles') {
      void navigator.clipboard.writeText(state.scrambles.map((s, i) => `${i + 1}. ${s}`).join('\n'))
        .then(() => toast('Scrambles copied.', { kind: 'good' }), () => toast('The clipboard said no.', { kind: 'bad' }));
    } else if (action === 'print-scrambles') {
      printScrambles();
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
    else if (field === 'count') {
      state.count = clampInt(Number(t.value), 1, MAX_COUNT, state.count);
      t.value = String(state.count);
      saveSheetPrefs();
    } else if (field === 'fontPt') {
      state.fontPt = clampInt(Number(t.value), SIZES.min, SIZES.max, state.fontPt);
      saveSheetPrefs();
      paint();
    }
    else if (field === 'accent') { state.accent = Number(t.value); if (metronomeRunning()) { stopMetronome(); toggleMetronome(); } }
    else if (field === 'edgeBuffer' || field === 'cornerBuffer') {
      state[field] = Number(t.value);
      saveMemoPrefs();
      paint();
    }
  });
}

/** Leaving the view silences the metronome, unless it was popped out to come along. */
export function leaveTools(): void {
  onToolsView = false;
  if (!popped.metronome) stopMetronome();
}
