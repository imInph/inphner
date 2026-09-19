/**
 * inphner: the algorithm case trainer (inphner-prompt.md §A8).
 *
 * Case grid: glass tiles (diagram, name, best / average, learning-status dot)
 * in collapsible groups; tap a tile to (de)select it, tap the dot to cycle
 * not learned → learning → learned; select a whole group; presets All /
 * Learning / Not learned; sort by slowest first.
 *
 * Training (Timer mode): a scramble that sets up the case (random AUF and a
 * random rest-of-cube, so it can't be read off the scramble), then the same
 * hold-to-start timer as the Timer view. After the solve: the case, its
 * diagram, the time and per-case stats, with Mistake · Show alg · Next.
 * Recognition mode: the diagram shows for 1 s, then multiple choice (1–4) or
 * type-the-name; recognition time is tracked separately.
 * Case order: weighted (spaced repetition) or each case once per round.
 */
import { TimerEngine } from '../timer/engine.ts';
import { formatLive, formatSingle } from '../timer/format.ts';
import { prefs } from '../prefs.ts';
import { getSet, SHELLS, type SetId, type TrainerCase, type TrainerSet } from '../trainer/cases.ts';
import { f2lDiagram, llDiagram } from '../trainer/diagram.ts';
import { f2lState } from '../trainer/f2l.ts';
import { randomLL, caseScramble } from '../trainer/scramble.ts';
import { cycleStatus, newDeck, pickWeighted, recordFail, recordTime, type CaseStats } from '../trainer/select.ts';
import {
  caseStats, customCases, loadTrainer, setCaseStats, setTrainerPrefs, trainerPrefs, userAlg,
} from '../trainer/store.ts';
import { esc, isTyping, onAction } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { toast } from '../ui/toast.ts';
import { setKeyDelegate } from './timer.ts';

const SETS: { id: SetId; label: string }[] = [
  { id: 'pll', label: 'PLL' }, { id: 'oll', label: 'OLL' }, { id: 'f2l', label: 'F2L' }, { id: 'custom', label: 'Custom' },
];

let host: HTMLElement | null = null;
let set: TrainerSet | null = null;
let sortSlow = false;
const collapsed = new Set<string>();
const wired = new WeakSet<HTMLElement>();

/* ---------------------------------------------------------------- session */

type Phase = 'idle' | 'loading' | 'ready' | 'result' | 'recog-show' | 'recog-ask' | 'recog-answer';

const run = {
  on: false,
  phase: 'idle' as Phase,
  current: null as TrainerCase | null,
  previous: null as string | null,
  deck: [] as string[],
  scramble: '',
  next: null as Promise<{ c: TrainerCase; scramble: string }> | null,
  timeMs: 0,
  showAlg: false,
  recogStart: 0,
  recogOptions: [] as TrainerCase[],
  recogPick: null as TrainerCase | null,
  recogMs: 0,
  recogDiagram: '',
  recogTimer: 0,
  frame: 0,
  stopKey: null as string | null,
};

const engine = new TimerEngine(
  () => ({ holdMs: prefs().holdMs, inspection: false, phases: 1 }),
  { set: (fn, ms) => window.setTimeout(fn, ms), clear: (id) => window.clearTimeout(id) },
  { change: () => paintTime(), start: () => startLoop(), stop: (r) => onStop(r.timeMs) },
);

/** For main.ts: while the trainer's timer is armed or running, other shortcuts are off. */
export function trainerBusy(): boolean {
  return run.on && engine.busy;
}

function selectedCases(): TrainerCase[] {
  if (!set) return [];
  const sel = new Set(trainerPrefs().selected[set.id] ?? set.cases.map((c) => c.key));
  return set.cases.filter((c) => sel.has(c.key));
}

function pickNext(): TrainerCase | null {
  const pool = selectedCases();
  if (!pool.length) return null;
  const keys = pool.map((c) => c.key);
  let key: string;
  if (trainerPrefs().order === 'deck') {
    run.deck = run.deck.filter((k) => keys.includes(k));
    if (!run.deck.length) run.deck = newDeck(keys, run.previous);
    key = run.deck.shift()!;
  } else {
    key = pickWeighted(keys, caseStats, run.previous);
  }
  run.previous = key;
  return pool.find((c) => c.key === key)!;
}

function prefetch(): void {
  const c = pickNext();
  run.next = c ? caseScramble(c).then((scramble) => ({ c, scramble })) : null;
  run.next?.catch(() => { run.next = null; });
}

async function nextCase(): Promise<void> {
  if (!run.on) return;
  if (trainerPrefs().mode === 'recog') return nextRecog();
  run.phase = 'loading';
  run.showAlg = false;
  paintPanel();
  if (!run.next) prefetch();
  const n = run.next;
  run.next = null;
  if (!n) {
    stopSession();
    toast('Select at least one case first.');
    return;
  }
  try {
    const { c, scramble } = await n;
    run.current = c;
    run.scramble = scramble;
    run.phase = 'ready';
    paintPanel();
    prefetch();
  } catch {
    toast('Could not build a scramble for that case.', { kind: 'bad' });
    stopSession();
  }
}

function startSession(): void {
  if (!selectedCases().length) {
    toast('Select at least one case first.');
    return;
  }
  run.on = true;
  run.deck = [];
  run.previous = null;
  run.next = null;
  void nextCase();
  paintAll();
}

function stopSession(): void {
  run.on = false;
  run.phase = 'idle';
  engine.cancel();
  clearTimeout(run.recogTimer);
  cancelAnimationFrame(run.frame);
  paintAll();
}

function onStop(timeMs: number): void {
  cancelAnimationFrame(run.frame);
  run.frame = 0;
  const c = run.current;
  if (!c) return;
  run.timeMs = timeMs;
  setCaseStats(c.key, recordTime(caseStats(c.key), timeMs));
  run.phase = 'result';
  paintPanel();
  paintTiles();
}

function mistake(): void {
  const c = run.current;
  if (!c || run.phase !== 'result') return;
  // Undo the time just recorded and log a failure instead.
  const s = caseStats(c.key);
  const without: CaseStats = s.count ? { ...s, count: s.count - 1, sum: s.sum - run.timeMs, last: s.last.slice(0, -1) } : s;
  setCaseStats(c.key, recordFail(without));
  toast(`${c.name}: logged as a mistake.`);
  void nextCase();
}

/* ------------------------------------------------------------ recognition */

function diagramFor(c: TrainerCase, randomise: boolean): string {
  if (c.kind === 'll' && c.ll) return llDiagram(randomise ? randomLL(c) : c.ll, c.style ?? 'pll', c.name);
  if (c.kind === 'f2l' && c.f2l) return f2lDiagram(f2lState(c.f2l, Math.random, randomise ? undefined : 0), c.name);
  return `<div class="case-diagram no-diagram">${icon('cube', 28)}</div>`;
}

function nextRecog(): void {
  const c = pickNext();
  if (!c) {
    stopSession();
    toast('Select at least one case first.');
    return;
  }
  run.current = c;
  run.recogPick = null;
  run.recogDiagram = diagramFor(c, true);
  run.phase = 'recog-show';
  run.recogStart = performance.now();
  paintPanel();
  clearTimeout(run.recogTimer);
  run.recogTimer = window.setTimeout(() => {
    const pool = (set?.cases ?? []).filter((x) => x.key !== c.key);
    const others = pool.sort(() => Math.random() - 0.5).slice(0, 3);
    run.recogOptions = [...others, c].sort(() => Math.random() - 0.5);
    run.phase = 'recog-ask';
    paintPanel();
    host?.querySelector<HTMLInputElement>('[name="recog-name"]')?.focus();
  }, 1000);
}

function answerRecog(pick: TrainerCase | null, typed?: string): void {
  const c = run.current;
  if (!c || run.phase !== 'recog-ask') return;
  const ms = performance.now() - run.recogStart;
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ok = pick ? pick.key === c.key : !!typed && (norm(typed) === norm(c.id) || norm(typed) === norm(c.name) || norm(`${typed}perm`) === norm(c.name));
  run.recogPick = pick;
  run.recogMs = ms;
  const s = caseStats(c.key);
  setCaseStats(c.key, ok
    ? { ...s, recogCount: s.recogCount + 1, recogSum: s.recogSum + ms, lastSeen: Date.now() }
    : { ...s, recogFails: s.recogFails + 1, lastSeen: Date.now() });
  run.phase = 'recog-answer';
  (run as { recogOk?: boolean }).recogOk = ok;
  paintPanel();
}

/* ------------------------------------------------------------------ input */

function panelTiming(): boolean {
  return run.on && (run.phase === 'ready' || run.phase === 'result') && !!host && !host.hidden;
}

function onKeyDown(e: KeyboardEvent): void {
  if (!host || host.hidden || !run.on) return;
  const now = performance.now();
  if (engine.phase === 'running') {
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    run.stopKey = e.code;
    engine.press(now);
    return;
  }
  if (document.querySelector('.modal-backdrop') || isTyping(e.target)) return;
  if (e.code === 'Space' && panelTiming()) {
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (run.phase === 'result') run.phase = 'ready';
    engine.press(now);
    return;
  }
  if (e.key === 'Escape' && engine.busy) {
    e.preventDefault();
    engine.cancel();
    return;
  }
  if (engine.busy) return;
  if (run.phase === 'result') {
    if (e.key === 'Enter' || e.key === 'n' || e.key === 'N') { e.preventDefault(); void nextCase(); }
    else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); mistake(); }
    else if (e.key === 's' || e.key === 'S') { e.preventDefault(); run.showAlg = !run.showAlg; paintPanel(); }
  } else if (run.phase === 'recog-ask' && /^[1-4]$/.test(e.key)) {
    e.preventDefault();
    const o = run.recogOptions[Number(e.key) - 1];
    if (o) answerRecog(o);
  } else if (run.phase === 'recog-answer' && (e.key === 'Enter' || e.key === 'n' || e.key === 'N')) {
    e.preventDefault();
    nextRecog();
  }
}

function onKeyUp(e: KeyboardEvent): void {
  if (!host || host.hidden) return;
  const now = performance.now();
  if (run.stopKey && e.code === run.stopKey) {
    run.stopKey = null;
    engine.release(now);
    return;
  }
  if (e.code === 'Space' && run.on) {
    e.preventDefault();
    engine.release(now);
  }
}

/* ------------------------------------------------------------------ paint */

function startLoop(): void {
  const loop = () => {
    run.frame = 0;
    if (engine.phase !== 'running') return;
    const el = host?.querySelector<HTMLElement>('[data-role="t-time"]');
    const live = prefs().live;
    if (el) el.textContent = live === 'off' ? 'solving' : formatLive(performance.now() - engine.startedAt, live, prefs().precision);
    run.frame = requestAnimationFrame(loop);
  };
  run.frame = requestAnimationFrame(loop);
  const label = host?.querySelector<HTMLElement>('[data-role="t-label"]');
  if (label) label.textContent = '';
}

function paintTime(): void {
  const el = host?.querySelector<HTMLElement>('[data-role="t-time"]');
  const label = host?.querySelector<HTMLElement>('[data-role="t-label"]');
  if (!el || !label) return;
  el.className = `time trainer-time${engine.hold === 'armed' ? ' is-armed' : engine.hold === 'ready' ? ' is-ready' : ''}${engine.phase === 'running' ? ' is-running' : ''}`;
  if (engine.hold === 'armed') label.textContent = 'hold…';
  else if (engine.hold === 'ready') label.textContent = 'release to start';
  if (engine.hold !== 'none' && run.phase === 'result') {
    run.phase = 'ready';
    paintPanel();
  }
}

function fmt(ms: number): string {
  return ms ? formatSingle(ms, prefs().precision) : '–';
}

function statsLine(c: TrainerCase): string {
  const s = caseStats(c.key);
  const avg = s.count ? s.sum / s.count : 0;
  const fail = s.count + s.fails ? Math.round((s.fails / (s.count + s.fails)) * 100) : 0;
  return `${s.count} solve${s.count === 1 ? '' : 's'} · mean ${fmt(avg)} · best ${fmt(s.best)}${s.last.length ? ` · last ${s.last.map(fmt).join(', ')}` : ''} · ${fail}% mistakes${s.recogCount ? ` · recognition ${fmt(s.recogSum / s.recogCount)}` : ''}`;
}

function algOf(c: TrainerCase): string {
  return userAlg(c.key).alg ?? c.alg;
}

function paintPanel(): void {
  const panel = host?.querySelector<HTMLElement>('[data-role="panel"]');
  if (!panel) return;
  panel.hidden = !run.on;
  if (!run.on) return;
  const c = run.current;
  let body = '';
  if (run.phase === 'loading') {
    body = `<div class="scramble-skeleton"><span></span><span></span></div><p class="text-dim">Setting up the next case…</p>`;
  } else if (run.phase === 'ready' || run.phase === 'result') {
    const alg = c ? algOf(c) : '';
    body = `
      <div class="trainer-scramble mono" aria-label="Setup scramble">${esc(run.scramble)}</div>
      <div class="trainer-stage" data-role="t-stage">
        <div class="time trainer-time" data-role="t-time">${run.phase === 'result' ? esc(formatSingle(run.timeMs, prefs().precision)) : formatSingle(0, prefs().precision)}</div>
        <div class="time-label" data-role="t-label">${run.phase === 'ready' ? 'hold space (or touch) to start' : ''}</div>
      </div>
      ${run.phase === 'result' && c ? `
      <div class="trainer-result">
        <div class="trainer-diagram">${diagramFor(c, false)}</div>
        <div class="trainer-result-text">
          <strong>${esc(c.name)}</strong>
          <div class="text-dim trainer-stats num">${esc(statsLine(c))}</div>
          ${run.showAlg ? `<div class="mono trainer-alg">${alg ? esc(alg) : '<span class="text-dim">No alg yet: add yours in Algorithms.</span>'}</div>` : ''}
          <div class="trainer-actions">
            <button type="button" class="btn btn-sm" data-action="mistake">Mistake <kbd>M</kbd></button>
            <button type="button" class="btn btn-sm" data-action="show-alg">${run.showAlg ? 'Hide alg' : 'Show alg'} <kbd>S</kbd></button>
            <button type="button" class="btn btn-primary btn-sm" data-action="next">Next <kbd>↵</kbd></button>
          </div>
        </div>
      </div>` : ''}`;
  } else if (run.phase === 'recog-show' || run.phase === 'recog-ask' || run.phase === 'recog-answer') {
    const ok = (run as { recogOk?: boolean }).recogOk;
    const input = trainerPrefs().recog === 'type';
    body = `
      <div class="recog">
        <div class="recog-diagram ${run.phase === 'recog-show' || run.phase === 'recog-answer' ? '' : 'is-hidden'}">${run.recogDiagram}</div>
        ${run.phase === 'recog-show' ? '<p class="text-dim">Recognise it…</p>' : ''}
        ${run.phase === 'recog-ask' ? (input
          ? `<form class="recog-type" data-no-timer><input name="recog-name" placeholder="Case name (e.g. T, Ga, OLL 27)" autocomplete="off" spellcheck="false"><button class="btn btn-primary" type="submit">Answer</button></form>`
          : `<div class="recog-options">${run.recogOptions.map((o, i) => `<button type="button" class="btn" data-action="recog" data-key="${esc(o.key)}"><kbd>${i + 1}</kbd>${esc(o.name)}</button>`).join('')}</div>`) : ''}
        ${run.phase === 'recog-answer' && c ? `
          <p class="recog-verdict ${ok ? 'text-good' : 'text-bad'}">${ok ? 'Right' : 'Not quite'}: <strong>${esc(c.name)}</strong> · <span class="num">${esc(fmt(run.recogMs))}</span></p>
          <div class="text-dim trainer-stats num">${esc(statsLine(c))}</div>
          <div class="trainer-actions"><button type="button" class="btn btn-primary btn-sm" data-action="next-recog">Next <kbd>↵</kbd></button></div>` : ''}
      </div>`;
  }
  panel.innerHTML = `
    <div class="card-head"><span class="badge-ico tint-orange">${icon('target', 16)}</span><h3>Training ${esc(set?.name ?? '')}</h3>
      <small class="num">${selectedCases().length} cases · ${trainerPrefs().order === 'deck' ? 'each once per round' : 'weighted'}</small>
      <button type="button" class="btn btn-ghost btn-sm" data-action="stop">Stop</button></div>
    ${body}`;
  wireStage();
}

function wireStage(): void {
  const stage = host?.querySelector<HTMLElement>('[data-role="t-stage"]');
  if (!stage) return;
  stage.onpointerdown = (e) => {
    if (engine.phase === 'running' || e.button !== 0) return;
    e.preventDefault();
    if (run.phase === 'result') run.phase = 'ready';
    stage.setPointerCapture(e.pointerId);
    engine.press(performance.now());
  };
  stage.onpointerup = () => engine.release(performance.now());
  stage.onpointercancel = () => engine.cancelHold();
}

function tileHtml(c: TrainerCase): string {
  const s = caseStats(c.key);
  const sel = (trainerPrefs().selected[set!.id] ?? set!.cases.map((x) => x.key)).includes(c.key);
  const avg = s.count ? s.sum / s.count : 0;
  const statusText = { new: 'Not learned', learning: 'Learning', learned: 'Learned' }[s.status];
  return `
    <div class="case-tile ${sel ? 'is-selected' : ''}" data-key="${esc(c.key)}">
      <button type="button" class="case-main" data-action="toggle" data-key="${esc(c.key)}" aria-pressed="${sel}" title="${esc(c.name)}${c.unnamed ? ' (not named yet)' : ''}">
        ${diagramFor(c, false)}
        <span class="case-name ${c.unnamed ? 'is-unnamed' : ''}">${esc(c.name)}</span>
        <span class="case-times num">${s.count ? `${fmt(s.best)} · ${fmt(avg)}` : '&nbsp;'}</span>
      </button>
      <button type="button" class="status-dot s-${s.status}" data-action="status" data-key="${esc(c.key)}" aria-label="${statusText}: tap to change" title="${statusText}: tap to change"></button>
    </div>`;
}

function paintTiles(): void {
  const groupsEl = host?.querySelector<HTMLElement>('[data-role="groups"]');
  if (!groupsEl || !set) return;
  const cur = set;
  const sel = new Set(trainerPrefs().selected[cur.id] ?? cur.cases.map((c) => c.key));
  const sortCases = (list: TrainerCase[]) => (sortSlow
    ? [...list].sort((a, b) => (caseStats(b.key).ema || -1) - (caseStats(a.key).ema || -1))
    : list);
  if (!cur.cases.length) {
    groupsEl.innerHTML = cur.id === 'custom'
      ? `<div class="empty">No custom cases yet. Add them in <a href="#algorithms?set=custom">Algorithms</a>: a name and an alg.</div>`
      : '<div class="empty">No cases.</div>';
    return;
  }
  const body = sortSlow
    ? `<div class="case-grid">${sortCases(cur.cases).map(tileHtml).join('')}</div>`
    : cur.groups.map((g) => {
      const cases = cur.cases.filter((c) => c.group === g.id);
      if (!cases.length) return '';
      const all = cases.every((c) => sel.has(c.key));
      const open = !collapsed.has(`${cur.id}:${g.id}`);
      return `
        <section class="case-group">
          <div class="case-group-head">
            <button type="button" class="group-toggle" data-action="collapse" data-group="${esc(g.id)}" aria-expanded="${open}">
              ${icon(open ? 'down' : 'right', 16)}<span>${esc(g.name)}</span><small class="num">${cases.filter((c) => sel.has(c.key)).length}/${cases.length}</small>
            </button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="group-select" data-group="${esc(g.id)}">${all ? 'Deselect all' : 'Select all'}</button>
          </div>
          ${open ? `<div class="case-grid">${cases.map(tileHtml).join('')}</div>` : ''}
        </section>`;
    }).join('');
  groupsEl.innerHTML = body;
}

function paintAll(): void {
  if (!host) return;
  const p = trainerPrefs();
  const seg = (group: string, value: string, label: string, on: boolean) =>
    `<button type="button" data-action="${group}" data-value="${value}" class="${on ? 'on' : ''}" aria-pressed="${on}">${label}</button>`;
  host.innerHTML = `
    <div class="trainer">
      <div class="stats-toolbar">
        <div class="segmented" role="group" aria-label="Set">${SETS.map((s) => seg('set', s.id, s.label, p.set === s.id)).join('')}</div>
        <div class="segmented" role="group" aria-label="Mode">${seg('mode', 'timer', 'Timer', p.mode === 'timer')}${seg('mode', 'recog', 'Recognition', p.mode === 'recog')}</div>
        ${p.mode === 'recog' ? `<div class="segmented segmented-sm" role="group" aria-label="Answer by">${seg('recog-kind', 'choice', 'Choice', p.recog === 'choice')}${seg('recog-kind', 'type', 'Type', p.recog === 'type')}</div>` : ''}
        <span class="grow"></span>
        ${run.on ? '' : `<button type="button" class="btn btn-primary" data-action="start">${icon('target', 16)}Train ${selectedCases().length} case${selectedCases().length === 1 ? '' : 's'}</button>`}
      </div>
      <section class="card trainer-panel" data-role="panel" ${run.on ? '' : 'hidden'}></section>
      <div class="trainer-controls">
        <span class="micro-label">Select</span>
        <button type="button" class="chip-btn" data-action="preset" data-value="all">All</button>
        <button type="button" class="chip-btn" data-action="preset" data-value="learning">Learning</button>
        <button type="button" class="chip-btn" data-action="preset" data-value="new">Not learned</button>
        <button type="button" class="chip-btn" data-action="preset" data-value="none">None</button>
        <span class="grow"></span>
        <div class="segmented segmented-sm" role="group" aria-label="Order">${seg('order', 'weighted', 'Weighted', p.order === 'weighted')}${seg('order', 'deck', 'Once per round', p.order === 'deck')}</div>
        <div class="segmented segmented-sm" role="group" aria-label="Sort">${seg('sort', 'default', 'Groups', !sortSlow)}${seg('sort', 'slow', 'Slowest first', sortSlow)}</div>
      </div>
      <div data-role="groups"></div>
      <section class="card shells">
        <div class="card-head"><span class="badge-ico tint-graphite">${icon('book', 16)}</span><h3>More sets</h3><small>Need their case data before they can be trained.</small></div>
        <div class="shell-list">${SHELLS.map((s) => `<span class="chip" title="${esc(s.note)} Groups: ${esc(s.groups.join(', '))}">${esc(s.name)} · ${esc(s.count)}</span>`).join('')}</div>
      </section>
    </div>`;
  paintPanel();
  paintTiles();
}

/* ------------------------------------------------------------------- view */

export async function renderTrainer(el: HTMLElement): Promise<void> {
  host = el;
  el.innerHTML = '<div class="skeleton"></div>';
  await loadTrainer();
  if (host !== el || el.hidden) return;
  set = getSet(trainerPrefs().set, customCases());
  setKeyDelegate({ down: onKeyDown, up: onKeyUp });
  paintAll();
  onAction(el, (action, t) => act(action, t));
  if (!wired.has(el)) {
    wired.add(el);
    el.addEventListener('submit', (e) => {
      const form = (e.target as HTMLElement).closest('.recog-type');
      if (!form) return;
      e.preventDefault();
      answerRecog(null, form.querySelector<HTMLInputElement>('input')!.value);
    });
    document.addEventListener('pointerdown', (e) => {
      if (!host || host.hidden || engine.phase !== 'running') return;
      e.preventDefault();
      e.stopPropagation(); // or the stage would re-arm right after this stop
      engine.press(performance.now());
      run.stopKey = `pointer`;
      const up = () => { run.stopKey = null; engine.release(performance.now()); document.removeEventListener('pointerup', up, true); };
      document.addEventListener('pointerup', up, true);
    }, true);
  }
}

export function leaveTrainer(): void {
  if (run.on) stopSession();
  setKeyDelegate(null);
}

function act(action: string, t: HTMLElement): void {
  if (!set) return;
  const p = trainerPrefs();
  const all = set.cases.map((c) => c.key);
  const current = new Set(p.selected[set.id] ?? all);
  const saveSel = (next: Set<string>) => setTrainerPrefs({ selected: { ...p.selected, [set!.id]: [...next] } });
  switch (action) {
    case 'set':
      if (run.on) stopSession();
      setTrainerPrefs({ set: t.dataset.value as SetId });
      set = getSet(t.dataset.value as SetId, customCases());
      paintAll();
      break;
    case 'mode':
      if (run.on) stopSession();
      setTrainerPrefs({ mode: t.dataset.value as 'timer' | 'recog' });
      paintAll();
      break;
    case 'recog-kind':
      setTrainerPrefs({ recog: t.dataset.value as 'choice' | 'type' });
      paintAll();
      break;
    case 'order':
      setTrainerPrefs({ order: t.dataset.value as 'weighted' | 'deck' });
      run.deck = [];
      paintAll();
      break;
    case 'sort':
      sortSlow = t.dataset.value === 'slow';
      paintAll();
      break;
    case 'start': startSession(); break;
    case 'stop': stopSession(); break;
    case 'next': void nextCase(); break;
    case 'mistake': mistake(); break;
    case 'show-alg': run.showAlg = !run.showAlg; paintPanel(); break;
    case 'recog': answerRecog(set.cases.find((c) => c.key === t.dataset.key) ?? null); break;
    case 'next-recog': nextRecog(); break;
    case 'toggle': {
      const k = t.dataset.key!;
      if (current.has(k)) current.delete(k); else current.add(k);
      saveSel(current);
      paintAll();
      break;
    }
    case 'status': {
      const k = t.dataset.key!;
      const s = caseStats(k);
      setCaseStats(k, { ...s, status: cycleStatus(s.status) });
      paintTiles();
      break;
    }
    case 'group-select': {
      const keys = set.cases.filter((c) => c.group === t.dataset.group).map((c) => c.key);
      const allOn = keys.every((k) => current.has(k));
      keys.forEach((k) => (allOn ? current.delete(k) : current.add(k)));
      saveSel(current);
      paintAll();
      break;
    }
    case 'collapse': {
      const k = `${set.id}:${t.dataset.group}`;
      if (collapsed.has(k)) collapsed.delete(k); else collapsed.add(k);
      paintTiles();
      break;
    }
    case 'preset': {
      const v = t.dataset.value;
      const next = new Set(v === 'all' ? all : v === 'none' ? [] : all.filter((k) => caseStats(k).status === (v === 'learning' ? 'learning' : 'new')));
      saveSel(next);
      paintAll();
      break;
    }
    default: break;
  }
}
