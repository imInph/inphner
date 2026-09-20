/**
 * inphner: the Timer view. The part that must be perfect.
 *
 * Timing rules (inphner-prompt.md §A4):
 * - The start timestamp is performance.now() taken IN the keyup / pointerup
 *   handler; the stop timestamp IN the keydown / pointerdown handler. Never
 *   inside a rAF callback.
 * - The display updates only from requestAnimationFrame; nothing else runs in
 *   the hot path.
 * - Colour changes (armed → ready) are instant: no CSS transition on colour.
 * - Keys are registered through BOTH addEventListener and document.onkeydown /
 *   onkeyup (the owner's Firefox silently drops some listeners); each event is
 *   stamped in a WeakSet so whichever handler runs second is a no-op.
 *
 * The view's DOM is rendered once per visit; the hot path only touches
 * textContent / className of nodes cached for that render.
 */
import { TimerEngine, type SolveResult } from '../timer/engine.ts';
import { formatLive, formatSingle, parseTypedTime, type Penalty } from '../timer/format.ts';
import { inspectionAlert, unlockAudio } from '../timer/sounds.ts';
import { connectStackmat, disconnectStackmat, stackmatState, type StackmatState } from '../timer/stackmat-source.ts';
import { SolveGate, type StackmatPacket } from '../timer/stackmat.ts';
import {
  connectSmartCube, disconnectSmartCube, resetSmartCube, smartCubeSupported, smartDeviceName,
  smartState, type SmartMove, type SmartState,
} from '../timer/smartcube.ts';
import { PhaseTracker } from '../timer/phases.ts';
import { apply, type Cube } from '../tools/cube.ts';
import { inspectionFor, prefs } from '../prefs.ts';
import {
  addSolve, currentSession, currentSolves, restoreSolves, solveById, updateSession, updateSolve, type Session, type Solve,
} from '../store.ts';
import { DNF, effective, statAt, summarize } from '../stats/core.ts';
import { syncStats, takePbs } from '../stats/live.ts';
import type { PbEvent } from '../stats/engine.ts';
import { openAverageModal } from './average-modal.ts';
import { alpha, baseOptions, draw, palette } from './charts.ts';
import { esc, isTyping } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { openModal } from '../ui/modal.ts';
import { toast } from '../ui/toast.ts';
import { advanceScramble, currentScramble, mountScramble, unmountScramble } from './scramble-card.ts';
import { flashSolve, fmtStat, listData, renderSolveList } from './solve-list.ts';
import { deleteWithUndo, openSolveModal } from './solve-modal.ts';
import { fmtSingle } from './solve-list.ts';
import { leaveFmc, renderFmc } from './fmc.ts';
import { multiIsDnf, multiRank } from '../stats/special.ts';
import { eventDef } from '../events.ts';

const root = document.documentElement;
const isFmc = () => currentSession().event === '333fm';
const isMulti = () => currentSession().event === '333mbf';
const isTouchDevice = () => window.matchMedia('(hover: none) and (pointer: coarse)').matches;

/* ------------------------------------------------------------------ engine */

const engine = new TimerEngine(
  () => ({ holdMs: prefs().holdMs, inspection: inspectionFor(prefs(), currentSession().event), phases: prefs().phases }),
  { set: (fn, ms) => window.setTimeout(fn, ms), clear: (id) => window.clearTimeout(id) },
  {
    change: () => paint(),
    start: () => onStart(),
    split: () => paint(),
    stop: (r) => onStop(r),
    alert: (s) => inspectionAlert(s),
  },
);

/** For main.ts: while armed, inspecting or running, no other shortcut may act. */
export function timerBusy(): boolean {
  return active && engine.busy;
}

/* -------------------------------------------------------------- view state */

let active = false;
let container: HTMLElement | null = null;
let els: {
  stage: HTMLElement; time: HTMLElement; label: HTMLElement; post: HTMLElement;
  firstRun: HTMLElement | null; live: HTMLElement; strip: HTMLElement; list: HTMLElement; count: HTMLElement;
  bottom: HTMLElement; typing: HTMLInputElement | null;
} | null = null;
/** The solve the post-solve row acts on; null hides the row. */
let postSolveId: string | null = null;
let frame = 0;
/** What stopped the timer: its release must be consumed (engine.awaitRelease). */
let stopKey: string | null = null;
let activePointer: number | null = null;
let ctrlL = false;
let ctrlR = false;
let ctrlArmed = false;
let wakeLock: WakeLockSentinel | null = null;
/** The scramble on screen when the solve started: stored with the solve. */
let solveScramble = '';

/* ------------------------------------------------------------------ render */

export function renderTimer(el: HTMLElement): void {
  container = el;
  active = true;
  root.dataset.view = 'timer';
  const typing = prefs().input === 'typing';
  const stackmat = prefs().input === 'stackmat';
  const smartCube = prefs().input === 'smartcube';
  const touch = isTouchDevice();
  const firstRun = currentSolves().length === 0 && !typing && !stackmat && !smartCube && !isFmc();

  el.innerHTML = `
    <div class="timer-view">
      <div class="timer-top" data-chrome></div>
      <div class="timer-stage ${typing ? 'is-typing' : ''} ${isFmc() ? 'is-fmc' : ''}" id="timer-stage">
        ${isFmc() ? '<div class="fmc-host" data-no-timer></div>' : ''}
        <div class="time-block">
          <div class="time" id="time" aria-hidden="true">${formatSingle(0, prefs().precision)}</div>
          <div class="time-label" id="time-label"></div>
          ${typing ? `
            <form class="pill-input typing-input" data-no-timer autocomplete="off">
              ${icon('clock')}
              <input id="typing-input" inputmode="decimal" enterkeyhint="done" placeholder="Type a time: 1234, 1:02.34, DNF, 12.34+" aria-label="Type a time and press Enter" spellcheck="false">
            </form>` : ''}
          ${stackmat ? '<div class="stackmat-pill" id="stackmat-pill" data-no-timer data-chrome></div>' : ''}
          ${smartCube ? '<div class="stackmat-pill" id="smart-pill" data-no-timer data-chrome></div>' : ''}
          <div class="post-solve" id="post-solve" data-no-timer data-chrome></div>
        </div>
        ${firstRun ? `
          <section class="card first-run-card" id="first-run" aria-labelledby="first-run-title">
            <div class="keycap-wrap" aria-hidden="true"><div class="keycap">${touch ? 'hold' : 'space'}</div></div>
            <h2 id="first-run-title">Ready when you are</h2>
            ${touch
              ? `<p>Touch and <strong>hold</strong> anywhere, release to start.<br>Touch again to stop.</p>
                 <p class="hint">With a keyboard: hold space, release to start, any key stops.</p>`
              : `<p>Press and hold <strong>space</strong>, release to start.<br>Any key stops.</p>
                 <p class="hint">On a phone, touch and hold anywhere below the scramble.</p>`}
          </section>` : ''}
      </div>
      <div class="timer-bottom" id="timer-bottom" data-chrome>
        <button type="button" class="sheet-grab" data-sheet-toggle aria-label="Show all stats and solves"><span></span></button>
        <div class="stat-strip" id="stat-strip"></div>
        <div class="timer-lower">
          <section class="card solves-card" aria-label="Solves">
            <div class="card-head">
              <span class="badge-ico tint-blue">${icon('stack', 16)}</span><h3>Solves</h3>
              <small class="num" id="solve-count"></small>
            </div>
            <div class="solve-list" id="solve-list"></div>
          </section>
          <section class="card mini-trend" aria-label="Trend, last 100 solves">
            <div class="card-head">
              <span class="badge-ico tint-teal">${icon('chart', 16)}</span><h3>Last 100</h3>
              <span class="legend"><i style="--c:var(--accent)"></i>ao5 <i style="--c:var(--purple)"></i>ao12</span>
            </div>
            <div class="chart-box mini"><canvas id="mini-trend"></canvas></div>
          </section>
        </div>
      </div>
      <div class="sr-only" id="sr-live" aria-live="polite" aria-atomic="true"></div>
    </div>`;

  els = {
    stage: el.querySelector('#timer-stage')!,
    time: el.querySelector('#time')!,
    label: el.querySelector('#time-label')!,
    post: el.querySelector('#post-solve')!,
    firstRun: el.querySelector('#first-run'),
    live: el.querySelector('#sr-live')!,
    strip: el.querySelector('#stat-strip')!,
    list: el.querySelector('#solve-list')!,
    count: el.querySelector('#solve-count')!,
    bottom: el.querySelector('#timer-bottom')!,
    typing: el.querySelector('#typing-input'),
  };
  if (firstRun) els.stage.classList.add('is-first-run');
  if (stackmat) {
    mountStackmat();
    el.addEventListener('click', onStackmatClick);
  }
  if (smartCube) {
    mountSmart();
    el.addEventListener('click', onSmartClick);
  }
  mountScramble(el.querySelector<HTMLElement>('.timer-top')!, currentSession().event);

  wireStage(els.stage);
  if (isFmc()) mountFmc();
  wireSheet(els.bottom);
  sheetOpen = false;
  document.body.classList.remove('sheet-locked');
  const last = currentSolves().at(-1);
  if (last && postSolveId === last.id) showResult(last, false);
  paint();
  renderPostSolve();
  renderBottom();
  if (els.typing && !touch) els.typing.focus({ preventScroll: true });
  void acquireWakeLock();
}

function mountFmc(): void {
  const host = els?.stage.querySelector<HTMLElement>('.fmc-host');
  if (!host) return;
  renderFmc(host, {
    scramble: currentScramble,
    onResult: (solve) => {
      advanceScramble();
      renderBottom();
      if (els) flashSolve(els.list, solve.id);
      toast(solve.penalty === 'DNF' ? 'FMC attempt recorded as DNF.' : `FMC: ${fmtSingle(solve)} moves.`, { kind: solve.penalty === 'DNF' ? 'bad' : 'good' });
    },
  });
}

/** Multi-BLD: after the timer stops, ask how many cubes were solved. */
function recordMulti(timeMs: number, scramble: string): void {
  const attempted = Math.max(2, scramble.split('\n').filter(Boolean).length);
  openModal({
    title: 'How did it go?',
    confirmLabel: 'Save',
    cancelLabel: 'Discard',
    bodyHtml: `
      <p class="text-dim" style="margin-top:0">Time: <strong class="num">${esc(formatSingle(timeMs, 2))}</strong></p>
      <div class="field-row">
        <label><span>Cubes solved</span><input name="solved" type="number" min="0" max="${attempted}" value="${attempted}" inputmode="numeric"></label>
        <label><span>Cubes attempted</span><input name="attempted" type="number" min="2" max="60" value="${attempted}" inputmode="numeric"></label>
      </div>
      <p class="text-dim" data-role="score" style="margin-bottom:0"></p>`,
    onConfirm: async (m) => {
      const solved = Math.max(0, Math.round(Number(m.querySelector<HTMLInputElement>('[name="solved"]')!.value)));
      const att = Math.max(2, Math.round(Number(m.querySelector<HTMLInputElement>('[name="attempted"]')!.value)));
      if (solved > att) return false;
      const solve = await addSolve({
        timeMs, penalty: multiIsDnf(solved, att) ? 'DNF' : 0, scramble, source: 'timer', multi: { solved, attempted: att },
      });
      landSolve(solve);
    },
  });
  const modal = document.querySelector<HTMLElement>('.modal');
  const update = () => {
    if (!modal) return;
    const solved = Number(modal.querySelector<HTMLInputElement>('[name="solved"]')!.value);
    const att = Number(modal.querySelector<HTMLInputElement>('[name="attempted"]')!.value);
    const pts = solved - (att - solved);
    modal.querySelector('[data-role="score"]')!.textContent = solved > att ? 'Solved can’t be more than attempted.'
      : multiIsDnf(solved, att) ? `${pts} points: DNF (needs ≥ 0 points and at least 2 solved).` : `${pts} point${pts === 1 ? '' : 's'}.`;
  };
  modal?.addEventListener('input', update);
  update();
}

/** Called by the router when another view takes over. */
export function leaveTimer(): void {
  if (!active) return;
  if (engine.phase !== 'running') engine.cancel();
  active = false;
  cancelAnimationFrame(frame);
  frame = 0;
  delete root.dataset.view;
  delete root.dataset.running;
  delete root.dataset.focus;
  leaveFmc();
  disconnectStackmat();
  disconnectSmartCube();
  cancelAnimationFrame(smart.frame);
  smart.frame = 0;
  smart.running = false;
  void releaseWakeLock();
  unmountScramble();
  els = null;
}

/* ------------------------------------------------------------------- paint */

let prevPhase: 'idle' | 'inspecting' | 'running' = 'idle';

/** Synchronous repaint of colour + label for the current state (never animated). */
function paint(): void {
  if (!els) return;
  const { time, label } = els;
  const p = prefs();
  const hold = engine.hold;
  const phase = engine.phase;
  // An inspection was cancelled (Esc): put back the last result, or 0.00.
  const cancelled = prevPhase === 'inspecting' && phase === 'idle';
  prevPhase = phase; // before restoring: restoreIdleDisplay() paints again
  if (cancelled) restoreIdleDisplay();

  let cls = 'time';
  if (hold === 'armed') cls += ' is-armed';
  else if (hold === 'ready') cls += ' is-ready';
  else if (phase === 'inspecting') cls += ' is-inspecting';
  if (phase === 'running') cls += ' is-running';
  else if (time.classList.contains('land')) cls += ' land'; // don't cut the landing spring short
  time.className = cls;

  if (phase !== 'idle' || hold !== 'none') {
    els.firstRun?.remove();
    els.firstRun = null;
    els.stage.classList.remove('is-first-run');
  }

  // Label: colour is never the only signal.
  let text = '';
  if (hold === 'armed') text = 'hold…';
  else if (hold === 'ready') text = 'release to start';
  else if (hold === 'tap') text = 'release to inspect';
  else if (phase === 'inspecting') text = isTouchDevice() ? 'inspecting · touch and hold to start' : 'inspecting · hold space to start';
  else if (phase === 'running') text = p.phases > 1 ? `phase ${engine.splits.length + 1} of ${p.phases}` : '';
  else if (!postSolveId) text = externalInput() ? '' : isTouchDevice() ? 'touch and hold to start' : 'hold space to start';
  label.textContent = text;

  // Focus mode and the wallpaper pause.
  if (phase === 'running') {
    root.dataset.running = '';
    if (p.focusMode) root.dataset.focus = '';
  } else {
    delete root.dataset.running;
    delete root.dataset.focus;
  }

  if (phase === 'inspecting' || phase === 'running') startLoop();
  if (phase === 'inspecting') drawInspection(performance.now());
  if (hold !== 'none' || phase !== 'idle') {
    els.post.classList.add('is-hidden');
  }
}

function startLoop(): void {
  if (frame) return;
  const loop = () => {
    frame = 0;
    if (!els) return;
    const now = performance.now();
    if (engine.phase === 'running') drawRunning(now);
    else if (engine.phase === 'inspecting') drawInspection(now);
    else return;
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
}

let lastText = '';
function setTime(text: string): void {
  if (!els || text === lastText) return;
  lastText = text;
  els.time.textContent = text;
}

function drawRunning(now: number): void {
  const p = prefs();
  const ms = now - engine.startedAt;
  setTime(p.live === 'off' ? 'solving' : formatLive(ms, p.live, p.precision));
}

function drawInspection(now: number): void {
  if (!els) return;
  const left = engine.inspectionLeft(now);
  // --text for most of it, --warn for the last 7 s, --bad past 0.
  const zone = left > 7000 ? 'ok' : left > 0 ? 'warn' : 'over';
  if (els.time.dataset.zone !== zone) els.time.dataset.zone = zone;
  setTime(left > 0 ? String(Math.ceil(left / 1000)) : left > -2000 ? '+2' : 'DNF');
}

/* ------------------------------------------------------------- start / stop */

function onStart(): void {
  solveScramble = currentScramble();
  postSolveId = null;
  if (els) delete els.time.dataset.zone;
  lastText = '';
  drawRunning(performance.now()); // show 0.00 at once, not the last inspection digit
  renderPostSolve();
}

function onStop(r: SolveResult): void {
  cancelAnimationFrame(frame);
  frame = 0;
  // Freeze the reading at the exact stop time; the result "lands" once it's stored.
  setTime(formatSingle(r.timeMs, prefs().precision));
  if (isMulti()) {
    advanceScramble();
    recordMulti(r.timeMs, solveScramble);
    return;
  }
  advanceScramble();
  void addSolve({
    timeMs: r.timeMs, penalty: r.penalty, scramble: solveScramble, source: 'timer',
    ...(r.splits ? { splits: r.splits } : {}),
  }).then((solve) => landSolve(solve));
}

/** After the write: show the result, the post-solve row, the list row, announce it. */
function landSolve(solve: Solve): void {
  postSolveId = solve.id;
  showResult(solve, true);
  // The strip + list were already refreshed by the store's 'inphner:solves' event.
  if (els) flashSolve(els.list, solve.id);
  announce(solve);
  celebratePbs(takePbs(solve.sessionId, solve.id), solve.event);
}

/** The big result: "12.34", "12.34 +2" (+2 smaller, --warn), or "DNF". */
function showResult(s: Solve, land: boolean): void {
  if (!els) return;
  const p = prefs();
  lastText = '';
  delete els.time.dataset.zone;
  if (s.multi || eventDef(s.event).moves) {
    els.time.innerHTML = esc(fmtSingle(s));
  } else if (s.penalty === 'DNF') {
    els.time.innerHTML = 'DNF';
  } else {
    els.time.innerHTML = esc(formatSingle(s.timeMs, p.precision)) + (s.penalty === 2000 ? '<span class="time-pen">+2</span>' : '');
  }
  if (land) {
    els.time.classList.remove('land');
    void els.time.offsetWidth; // restart the landing animation
    els.time.classList.add('land');
  }
  renderPostSolve();
  paint();
}

function restoreIdleDisplay(): void {
  if (!els) return;
  delete els.time.dataset.zone;
  const s = postSolveId ? currentSolves().find((x) => x.id === postSolveId) : undefined;
  if (s) {
    showResult(s, false);
  } else {
    lastText = '';
    setTime(formatSingle(0, prefs().precision));
  }
}

/** aria-live: "12.34, ao5 13.01". */
function announce(s: Solve): void {
  if (!els) return;
  const p = prefs();
  const values = currentSolves().map((x) => effective(x, p.precision));
  const ao5 = statAt(values, 5);
  const text = (s.penalty === 'DNF' ? `DNF, ${formatSingle(s.timeMs, p.precision)}`
    : `${formatSingle(s.timeMs, p.precision)}${s.penalty ? ' plus 2' : ''}`)
    + (Number.isNaN(ao5) ? '' : `, ao5 ${ao5 === DNF ? 'DNF' : fmtStat(ao5, s.event)}`);
  els.live.textContent = text;
}

/* -------------------------------------------------------- post-solve row */

function renderPostSolve(): void {
  if (!els) return;
  const s = postSolveId ? currentSolves().find((x) => x.id === postSolveId) : undefined;
  const post = els.post;
  if (!s) {
    post.classList.add('is-hidden');
    post.innerHTML = rowHtml(null);
    return;
  }
  post.innerHTML = rowHtml(s);
  post.classList.toggle('is-hidden', engine.phase !== 'idle' || engine.hold !== 'none');
}

function rowHtml(s: Solve | null): string {
  const pen = s?.penalty;
  const btn = (action: string, label: string, on: boolean, extra = '') =>
    `<button type="button" class="btn btn-glass btn-sm ${on ? 'on' : ''} ${extra}" data-post="${action}" aria-pressed="${on}" ${s ? '' : 'tabindex="-1"'}>${label}</button>`;
  return `
    <div class="post-buttons" role="group" aria-label="This solve">
      ${btn('ok', 'OK', pen === 0)}
      ${btn('plus2', '+2', pen === 2000, 'is-warn')}
      ${btn('dnf', 'DNF', pen === 'DNF', 'is-bad')}
      ${btn('comment', `${s?.comment ? '<span class="dot accent" aria-hidden="true"></span>' : ''}Comment`, false)}
      ${btn('delete', 'Delete', false)}
    </div>
    <div class="post-hint" aria-hidden="true"><kbd>↵</kbd> keep · <kbd>2</kbd> · <kbd>D</kbd> · <kbd>C</kbd> · <kbd>⌫</kbd></div>`;
}

function setPenalty(id: string, penalty: Penalty): void {
  void updateSolve(id, { penalty }).then((s) => {
    if (s && id === postSolveId) showResult(s, false);
  });
}

function togglePenalty(id: string, penalty: Penalty): void {
  const s = currentSolves().find((x) => x.id === id);
  if (!s) return;
  setPenalty(id, s.penalty === penalty ? 0 : penalty);
}

function commentOn(id: string): void {
  const s = currentSolves().find((x) => x.id === id);
  if (!s) return;
  openModal({
    title: 'Comment',
    bodyHtml: `<label><span>A note for this solve</span><textarea name="comment" rows="3" maxlength="500" placeholder="Lockup on the last PLL…">${esc(s.comment ?? '')}</textarea></label>`,
    confirmLabel: 'Save',
    onConfirm: (m) => {
      const value = m.querySelector<HTMLTextAreaElement>('textarea')!.value.trim();
      void updateSolve(id, { comment: value || undefined }).then(() => renderPostSolve());
    },
  });
}

function removeSolve(id: string): void {
  if (postSolveId === id) {
    postSolveId = null;
    if (els) {
      els.time.innerHTML = esc(formatSingle(0, prefs().precision));
      lastText = '';
    }
  }
  renderPostSolve();
  paint();
  deleteWithUndo([id]);
}

/** Alt+Z: undo the latest delete. */
function restore(): void {
  void restoreSolves().then((list) => {
    if (!list.length) return;
    const last = currentSolves().at(-1);
    if (last && list.some((x) => x.id === last.id)) {
      postSolveId = last.id;
      showResult(last, false);
    }
    toast(list.length === 1 ? 'Solve restored.' : `${list.length} solves restored.`, { kind: 'good' });
  });
}

/* ------------------------------------------------------- phone bottom sheet */

/**
 * ≤768px: stats + solves live in a glass bottom sheet. It peeks (strip + a
 * few rows) and opens with a tap on the grabber or an upward swipe.
 */
let sheetOpen = false;

function toggleSheet(force?: boolean): void {
  if (!els) return;
  sheetOpen = force ?? !sheetOpen;
  els.bottom.classList.toggle('sheet-open', sheetOpen);
  els.bottom.style.removeProperty('--drag');
  els.bottom.querySelector('[data-sheet-toggle]')?.setAttribute('aria-label', sheetOpen ? 'Hide stats and solves' : 'Show all stats and solves');
  document.body.classList.toggle('sheet-locked', sheetOpen);
}

function wireSheet(bottom: HTMLElement): void {
  let startY = 0;
  let startT = 0;
  let dragging = false;
  let id: number | null = null;
  const handle = (e: PointerEvent) => (e.target as HTMLElement).closest('.sheet-grab, .stat-strip');
  bottom.addEventListener('pointerdown', (e) => {
    if (!window.matchMedia('(max-width: 768px)').matches || !handle(e)) return;
    id = e.pointerId;
    startY = e.clientY;
    startT = performance.now();
    dragging = false;
  });
  bottom.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const dy = e.clientY - startY;
    if (!dragging && Math.abs(dy) < 6) return;
    if (!dragging) {
      dragging = true;
      try { bottom.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      bottom.classList.add('is-dragging');
    }
    bottom.style.setProperty('--drag', `${dy}px`);
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null;
    bottom.classList.remove('is-dragging');
    if (!dragging) return;
    const dy = e.clientY - startY;
    const v = dy / Math.max(1, performance.now() - startT); // px/ms
    toggleSheet(sheetOpen ? !(dy > 80 || v > 0.5) : dy < -60 || v < -0.5);
    // A drag isn't a tap on the grabber.
    bottom.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true });
  };
  bottom.addEventListener('pointerup', end);
  bottom.addEventListener('pointercancel', end);
}

/* ------------------------------------------------------- stats + solve list */

const STAT_LABEL = (n: number) => (n < 5 ? `mo${n}` : `ao${n}`);

/** The stat strip (current values) and the virtualised solve list. */
function renderBottom(): void {
  if (!els) return;
  const p = prefs();
  const session = currentSession();
  const solves = currentSolves();
  const event = session.event;
  let strip: string[];
  let dnfs = 0;
  if (event === '333mbf') {
    const sum = summarize(solves, { precision: p.precision });
    dnfs = sum.dnfs;
    // Multi-BLD ranks by points, then time: no averages.
    const best = [...solves].filter((x) => x.multi).sort((a, b) =>
      multiRank(a.multi!.solved, a.multi!.attempted, a.timeMs, a.penalty === 'DNF') - multiRank(b.multi!.solved, b.multi!.attempted, b.timeMs, b.penalty === 'DNF'))[0];
    strip = [pill('best', 'best', best && best.penalty !== 'DNF' ? fmtSingle(best) : '–'), pill('n', 'attempts', String(sum.count))];
  } else {
    const { stats } = syncStats(session.id, solves);
    dnfs = stats.dnfs;
    const counts = eventDef(event).moves ? [3, 5, 12] : p.strip;
    strip = counts.map((n) => pill(`ao${n}`, STAT_LABEL(n), fmtStat(stats.current(n), event), `data-stat="${n}"`));
    strip.push(pill('best', 'best', fmtStat(stats.bestSingle?.value ?? NaN, event), stats.bestSingle ? 'data-best' : ''));
    strip.push(pill('mean', 'mean', fmtStat(stats.mean(p.dnfInMean), event), '', 'is-wide-only'));
    strip.push(pill('n', 'n', String(solves.length)));
    const goal = goalPill(session, stats.current.bind(stats), stats.bestSingle?.value ?? NaN);
    if (goal) strip.push(goal);
  }
  els.strip.innerHTML = strip.join('');
  els.count.textContent = solves.length ? `${solves.length}${dnfs ? ` · ${dnfs} DNF` : ''}` : '';
  renderSolveList(els.list, listData(solves, session.id), (id) => {
    const i = currentSolves().findIndex((x) => x.id === id);
    openSolveModal(id, i + 1);
  });
  scheduleMiniTrend();
}

let miniTimer = 0;
/** The mini trend (last 100: dots + ao5/ao12), drawn after the result has landed. */
function scheduleMiniTrend(): void {
  clearTimeout(miniTimer);
  miniTimer = window.setTimeout(() => { void drawMiniTrend(); }, 250);
}

async function drawMiniTrend(): Promise<void> {
  const canvas = els?.bottom.querySelector<HTMLCanvasElement>('#mini-trend');
  if (!canvas || !canvas.offsetParent) return; // hidden (phone sheet) or gone
  const session = currentSession();
  const solves = currentSolves();
  if (session.event === '333mbf') return;
  const { stats } = syncStats(session.id, solves);
  const n = solves.length;
  const start = Math.max(0, n - 100);
  const pick = (arr: number[]) => arr.slice(start).map((v, i) => ({ x: start + i + 1, y: v === DNF || Number.isNaN(v) ? null : v / 1000 }));
  const pal = palette();
  const base = baseOptions(pal);
  const fmt = (v: number) => fmtStat(v * 1000, session.event);
  await draw(canvas, {
    type: 'line',
    data: {
      datasets: [
        { type: 'scatter', data: pick(stats.values).filter((q) => q.y !== null), backgroundColor: alpha(pal.faint, 0.7), pointRadius: 2, pointHoverRadius: 4, label: 'single' },
        { data: pick(stats.rolling(5)), borderColor: pal.accent, backgroundColor: pal.accent, borderWidth: 1.8, pointRadius: 0, tension: 0.3, spanGaps: true, label: 'ao5' },
        { data: pick(stats.rolling(12)), borderColor: pal.purple, backgroundColor: pal.purple, borderWidth: 1.8, pointRadius: 0, tension: 0.3, spanGaps: true, label: 'ao12' },
      ],
    },
    options: {
      ...base,
      animation: false,
      scales: {
        x: { ...base.scales.x, type: 'linear', min: start + 1, max: Math.max(start + 2, n), ticks: { ...base.scales.x.ticks, precision: 0, maxTicksLimit: 5 } },
        y: { ...base.scales.y, ticks: { ...base.scales.y.ticks, maxTicksLimit: 5, callback: (v: string | number) => fmt(Number(v)) } },
      },
      plugins: { ...base.plugins, tooltip: { ...base.plugins.tooltip, callbacks: { title: (items) => `#${items[0]?.parsed.x}`, label: (c) => `${c.dataset.label} ${fmt(c.parsed.y ?? 0)}` } } },
    },
  });
}

/** Previous pill values, for the number roll. */
const shown = new Map<string, string>();

/** A stat pill; changed characters "roll" in (350 ms, tabular figures so nothing jitters). */
function pill(key: string, label: string, value: string, attrs = '', extra = ''): string {
  const prev = shown.get(key);
  shown.set(key, value);
  let html = esc(value);
  if (prev !== undefined && prev !== value && value !== '–') {
    const pad = Math.max(prev.length, value.length);
    const a = prev.padStart(pad);
    const b = value.padStart(pad);
    html = [...b].map((c, i) => (c === a[i] || c === ' ' ? esc(c.trim()) : `<span class="roll">${esc(c)}</span>`)).join('');
  }
  const clickable = attrs.includes('data-');
  return `<${clickable ? 'button type="button"' : 'div'} class="stat-pill glass ${extra} ${clickable ? 'is-link' : ''}" ${attrs}>
    <span class="stat-label">${label}</span><span class="stat-value num">${html}</span></${clickable ? 'button' : 'div'}>`;
}

const GOAL_N: Record<string, number> = { single: 1, ao5: 5, ao12: 12, ao100: 100 };

/** "sub-15 ao12 · 0.83 s to go" with a slim progress bar; marks the goal done once reached. */
function goalPill(session: Session, current: (n: number) => number, bestSingle: number): string {
  if (!session.goalMs || !session.goalStat) return '';
  const n = GOAL_N[session.goalStat]!;
  const now = n === 1 ? bestSingle : current(n);
  const goalText = `sub-${fmtStat(session.goalMs, session.event).replace(/\.00$/, '')} ${session.goalStat}`;
  const reached = !Number.isNaN(now) && now !== DNF && now < session.goalMs;
  if (reached && !session.goalReachedAt) {
    // Mark it on the in-memory session at once so a second render can't celebrate twice.
    session.goalReachedAt = Date.now();
    void updateSession(session.id, { goalReachedAt: session.goalReachedAt });
    celebrate(`Goal reached: ${goalText} (${fmtStat(now, session.event)}).`);
  }
  const done = reached || !!session.goalReachedAt;
  const pct = done ? 100 : Number.isNaN(now) || now === DNF ? 0 : Math.max(0, Math.min(100, (session.goalMs / now) * 100));
  const togo = done ? 'done' : Number.isNaN(now) ? `needs ${n} solves` : now === DNF ? 'current is DNF'
    : `${fmtStat(now - session.goalMs, session.event)} s to go`;
  return `<div class="stat-pill glass goal-pill ${done ? 'is-done' : ''}">
    <span class="stat-label">goal · ${esc(goalText)}</span>
    <span class="goal-line"><span class="progress"><span style="width:${pct.toFixed(1)}%"></span></span><span class="goal-togo num">${esc(togo)}</span></span>
  </div>`;
}

/** PB / goal celebration: the accent glow ring on the time (inphub's flash) + a toast. Classy. */
function celebrate(message: string): void {
  if (els) {
    els.time.classList.remove('flash');
    void els.time.offsetWidth;
    els.time.classList.add('flash');
  }
  toast(message, { kind: 'good' });
}

function celebratePbs(pbs: PbEvent[], event: string): void {
  const real = pbs.filter((x) => !Number.isNaN(x.previous));
  if (!real.length) return;
  const parts = real.map((x) => {
    const name = x.n === 1 ? 'single' : `ao${x.n}`;
    return `${name} ${fmtStat(x.value, event)} (−${fmtStat(x.previous - x.value, event)})`;
  });
  celebrate(`New PB · ${parts.join(' · ')}`);
}

/* ------------------------------------------------------------------ input */

const seen = new WeakSet<Event>();
/** Stamp an event; true when this is the second handler seeing it. */
function dup(e: Event): boolean {
  if (seen.has(e)) return true;
  seen.add(e);
  return false;
}

function isModifierKey(e: KeyboardEvent): boolean {
  return e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta'
    || e.key === 'CapsLock' || e.key === 'Fn' || e.key === 'AltGraph' || e.key === 'OS';
}

function blurFocus(): void {
  const a = document.activeElement as HTMLElement | null;
  if (a && a !== document.body) a.blur();
}

/**
 * Other views that time (the Trainer) receive keys through this delegate, so
 * they get the same double registration + dedupe as the main timer.
 */
export interface KeyDelegate { down(e: KeyboardEvent): void; up(e: KeyboardEvent): void }
let keyDelegate: KeyDelegate | null = null;
export function setKeyDelegate(d: KeyDelegate | null): void {
  keyDelegate = d;
}

function onKeyDown(e: KeyboardEvent): void {
  if (dup(e)) return;
  if (!active || !els) {
    keyDelegate?.down(e);
    return;
  }
  const now = performance.now();

  if (e.code === 'ControlLeft') ctrlL = true;
  if (e.code === 'ControlRight') ctrlR = true;

  // Running: any key stops (modifier-only presses don't, except both Ctrls together).
  if (engine.phase === 'running') {
    const bothCtrl = ctrlL && ctrlR && (e.code === 'ControlLeft' || e.code === 'ControlRight');
    if (isModifierKey(e) && !bothCtrl) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    stopKey = bothCtrl ? 'Ctrl' : e.code;
    engine.press(now);
    return;
  }

  if (document.querySelector('.modal-backdrop')) return;
  if (isTyping(e.target)) return;

  if (e.code === 'Space') {
    if (isFmc()) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (externalInput()) return;
    unlockAudio();
    blurFocus();
    engine.press(now);
    return;
  }
  if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && ctrlL && ctrlR && !e.repeat && !externalInput()) {
    e.preventDefault();
    ctrlArmed = true;
    unlockAudio();
    blurFocus();
    engine.press(now);
    return;
  }
  if (e.key === 'Escape' && engine.busy) {
    e.preventDefault();
    e.stopPropagation();
    engine.cancel();
    return;
  }
  if (engine.busy) {
    // Armed or inspecting: every other shortcut is off.
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  handleSolveKeys(e);
}

function onKeyUp(e: KeyboardEvent): void {
  if (dup(e)) return;
  if (!active || !els) {
    keyDelegate?.up(e);
    return;
  }
  const now = performance.now();
  const wasCtrl = e.code === 'ControlLeft' || e.code === 'ControlRight';
  if (e.code === 'ControlLeft') ctrlL = false;
  if (e.code === 'ControlRight') ctrlR = false;

  if (stopKey && (e.code === stopKey || (stopKey === 'Ctrl' && wasCtrl))) {
    stopKey = null;
    engine.release(now); // consumed by the engine (awaitRelease)
    if (e.code === 'Space') e.preventDefault();
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault(); // a focused button would otherwise "click" on keyup
    if (isTyping(e.target) && engine.hold === 'none') return;
    engine.release(now);
    return;
  }
  if (wasCtrl && ctrlArmed) {
    ctrlArmed = false;
    engine.release(now);
  }
}

/** Post-solve keys (plain while the row shows) and Alt+1/2/3 / Alt+Z (whenever idle). */
function handleSolveKeys(e: KeyboardEvent): void {
  const last = currentSolves().at(-1);
  if (e.altKey && !e.metaKey && !e.ctrlKey) {
    const map: Record<string, Penalty> = { Digit1: 0, Digit2: 2000, Digit3: 'DNF' };
    if (e.code in map && last) {
      e.preventDefault();
      setPenalty(last.id, map[e.code]!);
      return;
    }
    if (e.code === 'KeyZ') {
      e.preventDefault();
      restore();
    }
    return;
  }
  if (e.metaKey || e.ctrlKey || !postSolveId) return;
  const id = postSolveId;
  switch (e.key) {
    case 'Enter':
      e.preventDefault();
      postSolveId = null; // keep the solve as it is
      renderPostSolve();
      paint();
      break;
    case '2':
      e.preventDefault();
      togglePenalty(id, 2000);
      break;
    case 'd':
    case 'D':
      e.preventDefault();
      togglePenalty(id, 'DNF');
      break;
    case 'c':
    case 'C':
      e.preventDefault();
      commentOn(id);
      break;
    case 'Backspace':
    case 'Delete':
      e.preventDefault();
      removeSolve(id);
      break;
    default:
      break;
  }
}

/** Touch/pen/mouse on the stage arms like the spacebar; while running, a press anywhere stops. */
function wireStage(stage: HTMLElement): void {
  stage.addEventListener('pointerdown', (e) => {
    if (!active || engine.phase === 'running') return; // the document handler stops
    if (e.button !== 0 || activePointer !== null) return;
    if ((e.target as HTMLElement).closest('[data-no-timer], button, a, input, textarea, select')) return;
    if (externalInput() || isFmc()) return;
    if (document.querySelector('.modal-backdrop')) return;
    const now = performance.now();
    e.preventDefault();
    activePointer = e.pointerId;
    try { stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    unlockAudio();
    blurFocus();
    engine.press(now);
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== activePointer) return;
    const now = performance.now();
    activePointer = null;
    if (e.type === 'pointercancel') engine.cancelHold();
    else engine.release(now);
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  // No long-press menu / selection on the surface.
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
}

function onDocPointerDown(e: PointerEvent): void {
  if (!active || engine.phase !== 'running') return;
  const now = performance.now();
  e.preventDefault();
  e.stopPropagation();
  stopKey = `pointer:${e.pointerId}`;
  engine.press(now);
  // The click that follows must not also press whatever is under the pointer.
  suppressClickUntil = now + 800;
}

let suppressClickUntil = 0;
function onDocClickCapture(e: MouseEvent): void {
  if (performance.now() > suppressClickUntil) return;
  suppressClickUntil = 0;
  e.preventDefault();
  e.stopPropagation();
}

function onDocPointerUp(e: PointerEvent): void {
  if (stopKey !== `pointer:${e.pointerId}`) return;
  stopKey = null;
  engine.release(performance.now());
}

/* ---------------------------------------------------------------- stackmat */

/** Typing, a Stackmat or a smart cube: the keyboard and the stage stop timing. */
function externalInput(): boolean {
  return prefs().input !== 'keyboard';
}

const STACKMAT_LABEL: Record<StackmatState, string> = {
  off: 'Not connected',
  connecting: 'Asking for the microphone…',
  waiting: 'Listening — no signal yet',
  live: 'Connected',
  error: 'Could not listen',
};

const stackmatGate = new SolveGate();

function paintStackmatPill(state: StackmatState, detail?: string): void {
  const pill = container?.querySelector<HTMLElement>('#stackmat-pill');
  if (!pill) return;
  pill.dataset.state = state;
  pill.innerHTML = `
    <span class="stackmat-dot" aria-hidden="true"></span>
    <span class="grow">${esc(detail ?? STACKMAT_LABEL[state])}</span>
    <span class="badge tint-orange" title="Never tested against a real timer">Experimental</span>
    <button type="button" class="btn btn-sm" data-no-timer data-stackmat="${state === 'off' || state === 'error' ? 'connect' : 'disconnect'}">
      ${state === 'off' || state === 'error' ? 'Connect' : 'Disconnect'}</button>`;
}

function onStackmatPacket(packet: StackmatPacket): void {
  if (!els) return;
  const solveMs = stackmatGate.accept(packet);
  if (packet.status === 'running') {
    els.stage.classList.remove('is-first-run');
    els.time.textContent = formatSingle(packet.ms, prefs().precision);
    els.label.textContent = 'running on the timer';
    return;
  }
  if (packet.status === 'reset') {
    els.time.textContent = formatSingle(0, prefs().precision);
    els.label.textContent = '';
    return;
  }
  if (packet.status === 'ready' || packet.status === 'hands') {
    els.label.textContent = packet.status === 'ready' ? 'ready on the timer' : 'hands on the pads';
    return;
  }
  if (solveMs === null) return;
  const scramble = currentScramble();
  advanceScramble();
  els.time.textContent = formatSingle(solveMs, prefs().precision);
  void addSolve({ timeMs: solveMs, penalty: 0, scramble, source: 'stackmat' }).then((solve) => landSolve(solve));
}

function mountStackmat(): void {
  stackmatGate.reset();
  paintStackmatPill(stackmatState());
  if (stackmatState() === 'off') return;
  void connectStackmat({ onPacket: onStackmatPacket, onState: paintStackmatPill });
}

/** The Connect / Disconnect button in the pill. */
function onStackmatClick(e: Event): void {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-stackmat]');
  if (!btn) return;
  if (btn.dataset.stackmat === 'connect') {
    void connectStackmat({ onPacket: onStackmatPacket, onState: paintStackmatPill });
  } else {
    disconnectStackmat();
  }
}

/* -------------------------------------------------------------- smart cube */

const SMART_LABEL: Record<SmartState, string> = {
  off: 'Not connected',
  connecting: 'Looking for a cube…',
  connected: 'Connected',
  error: 'Could not connect',
};

const smart = {
  cube: null as Cube | null,
  running: false,
  t0: 0,
  moves: [] as string[],
  battery: -1,
  tracker: new PhaseTracker(),
  frame: 0,
};

function paintSmartPill(state: SmartState, detail?: string): void {
  const pill = container?.querySelector<HTMLElement>('#smart-pill');
  if (!pill) return;
  const name = smartDeviceName();
  const battery = smart.battery >= 0 ? ` · ${smart.battery}%` : '';
  pill.dataset.state = state;
  pill.innerHTML = `
    <span class="stackmat-dot" aria-hidden="true"></span>
    <span class="grow">${esc(detail ?? (state === 'connected' && name ? `${name}${battery}` : SMART_LABEL[state]))}</span>
    <span class="badge tint-orange" title="Never tested against a real cube">Experimental</span>
    ${state === 'connected' ? `<button type="button" class="btn btn-sm" data-no-timer data-smart="sync"
      title="Tell the cube it is solved, if its state has drifted">Sync</button>` : ''}
    <button type="button" class="btn btn-sm" data-no-timer data-smart="${state === 'connected' ? 'disconnect' : 'connect'}">
      ${state === 'connected' ? 'Disconnect' : 'Connect'}</button>`;
}

function paintSmartTime(): void {
  smart.frame = 0;
  if (!els || !smart.running) return;
  const p = prefs();
  const ms = performance.now() - smart.t0;
  els.time.textContent = p.live === 'off' ? 'solving' : formatLive(ms, p.live, p.precision);
  smart.frame = requestAnimationFrame(paintSmartTime);
}

function finishSmartSolve(elapsed: number): void {
  smart.running = false;
  cancelAnimationFrame(smart.frame);
  smart.frame = 0;
  if (!els) return;
  root.removeAttribute('data-running');
  const timeMs = Math.round(elapsed);
  els.time.textContent = formatSingle(timeMs, prefs().precision);
  els.label.textContent = '';
  const scramble = currentScramble();
  const splits = smart.tracker.splits.length ? [...smart.tracker.splits] : undefined;
  const solution = smart.moves.join(' ');
  smart.moves = [];
  advanceScramble();
  void addSolve({ timeMs, penalty: 0, scramble, splits, solution, source: 'smartcube' })
    .then((solve) => landSolve(solve));
}

function onSmartMove(move: SmartMove): void {
  if (!els || !smart.cube) return;
  smart.cube = apply(smart.cube, move.move);
  const at = Number.isFinite(move.at) ? move.at : performance.now();
  if (!smart.running) {
    smart.running = true;
    smart.t0 = at;
    smart.moves = [];
    smart.tracker.reset();
    els.stage.classList.remove('is-first-run');
    root.dataset.running = '';
    paintSmartTime();
  }
  smart.moves.push(move.move);
  const elapsed = at - smart.t0;
  const done = smart.tracker.update(smart.cube, elapsed);
  if (done.includes(4)) finishSmartSolve(elapsed);
  else if (els) els.label.textContent = `${smart.moves.length} moves`;
}

/** The cube's own state: trusted while we aren't timing. */
function onSmartState(cube: Cube, isSolved: boolean): void {
  if (smart.running) return;
  smart.cube = cube;
  if (isSolved) smart.tracker.reset();
}

const smartHandlers = {
  onState: paintSmartPill,
  onMove: onSmartMove,
  onState3: onSmartState,
  onBattery: (level: number) => { smart.battery = level; paintSmartPill(smartState()); },
};

/** Chrome on macOS won't give up the cube's MAC, and the key is derived from it. */
function askForMac(deviceName: string): Promise<string | null> {
  return new Promise((resolve) => {
    let answered = false;
    openModal({
      title: 'The cube\'s MAC address',
      confirmLabel: 'Connect',
      bodyHtml: `
        <p>This browser won't tell inphner the Bluetooth address of <strong>${esc(deviceName)}</strong>,
        and the cube's encryption key is made from it. You'll find it in the GAN app, or on the
        sticker in the battery compartment. inphner remembers it for next time.</p>
        <label><span>MAC address</span><input name="mac" placeholder="AB:CD:EF:12:34:56" autocomplete="off" spellcheck="false"></label>`,
      onConfirm: (m) => {
        answered = true;
        resolve(m.querySelector<HTMLInputElement>('[name="mac"]')!.value.trim() || null);
      },
      onClose: () => { if (!answered) resolve(null); },
    });
  });
}

function mountSmart(): void {
  smart.tracker.reset();
  paintSmartPill(smartState());
  if (!smartCubeSupported()) paintSmartPill('error', 'This browser has no Web Bluetooth.');
}

function onSmartClick(e: Event): void {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-smart]');
  if (!btn) return;
  if (btn.dataset.smart === 'connect') void connectSmartCube(smartHandlers, askForMac);
  else if (btn.dataset.smart === 'sync') {
    void resetSmartCube().then(() => toast('The cube now calls this state solved.', { kind: 'good' }));
  } else disconnectSmartCube();
}

/* ------------------------------------------------------------- typing mode */

function onTypingSubmit(e: SubmitEvent): void {
  const form = (e.target as HTMLElement).closest('.typing-input');
  if (!form || !els?.typing) return;
  e.preventDefault();
  const parsed = parseTypedTime(els.typing.value);
  if (!parsed) {
    toast('That doesn\'t look like a time. Try 1234, 12.34, 1:02.34, 12.34+ or DNF.', { kind: 'bad' });
    return;
  }
  const scramble = currentScramble();
  advanceScramble();
  els.typing.value = '';
  els.stage.classList.remove('is-first-run');
  void addSolve({ timeMs: parsed.timeMs, penalty: parsed.penalty, scramble, source: 'typing' }).then((solve) => landSolve(solve));
}

/* --------------------------------------------------------------- wake lock */

async function acquireWakeLock(): Promise<void> {
  if (!active || document.visibilityState !== 'visible' || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock?.request('screen') ?? null;
    wakeLock?.addEventListener('release', () => { wakeLock = null; });
  } catch {
    wakeLock = null; // not supported / denied (e.g. battery saver)
  }
}

async function releaseWakeLock(): Promise<void> {
  const lock = wakeLock;
  wakeLock = null;
  try { await lock?.release(); } catch { /* already released */ }
}

/* -------------------------------------------------------------------- init */

let inited = false;

/** Global listeners, registered once. */
export function initTimer(): void {
  if (inited) return;
  inited = true;
  // Both registrations on purpose (see the header); dup() makes the second a no-op.
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  document.onkeydown = onKeyDown;
  document.onkeyup = onKeyUp;
  document.addEventListener('pointerdown', onDocPointerDown, true);
  document.addEventListener('pointerup', onDocPointerUp, true);
  document.addEventListener('click', onDocClickCapture, true);
  document.addEventListener('submit', onTypingSubmit);

  document.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-post]');
    if (!b || !active || !postSolveId) return;
    const id = postSolveId;
    const action = b.dataset.post;
    if (action === 'ok') setPenalty(id, 0);
    else if (action === 'plus2') togglePenalty(id, 2000);
    else if (action === 'dnf') togglePenalty(id, 'DNF');
    else if (action === 'comment') commentOn(id);
    else if (action === 'delete') removeSolve(id);
  });

  window.addEventListener('blur', () => {
    if (engine.phase === 'running') return; // a running solve keeps running
    ctrlL = ctrlR = ctrlArmed = false;
    stopKey = null;
    engine.interrupt();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void acquireWakeLock();
    else void releaseWakeLock();
  });
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const stat = t.closest<HTMLElement>('.stat-pill[data-stat]');
    if (stat && active) openAverageModal(Number(stat.dataset.stat));
    if (t.closest('.stat-pill[data-best]') && active) {
      const { stats } = syncStats(currentSession().id, currentSolves());
      const i = stats.bestSingle?.index;
      if (i !== undefined) openSolveModal(currentSolves()[i]!.id, i + 1);
    }
  });
  window.addEventListener('inphner:theme', () => { if (active) scheduleMiniTrend(); });
  window.addEventListener('inphner:scramble', () => {
    if (active && isFmc()) mountFmc();
  });
  window.addEventListener('inphner:solves', (e) => {
    const sid = (e as CustomEvent<{ sessionId: string }>).detail?.sessionId;
    if (!active || (sid && sid !== currentSession().id)) return;
    // The post-solve row follows the solve it points at (deleted elsewhere → hide).
    if (postSolveId && !solveById(postSolveId)) postSolveId = null;
    renderBottom();
    renderPostSolve();
  });
  let lastSessionId = '';
  window.addEventListener('inphner:sessions', () => {
    const id = currentSession().id;
    if (id === lastSessionId) return;
    lastSessionId = id;
    postSolveId = null;
    if (active && container && engine.phase === 'idle' && engine.hold === 'none') renderTimer(container);
  });
  // Phone: the stats + solves bottom sheet.
  document.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-sheet-toggle]')) toggleSheet();
  });
  window.addEventListener('inphner:prefs', () => {
    if (active && container && engine.phase === 'idle' && engine.hold === 'none') renderTimer(container);
  });
}
