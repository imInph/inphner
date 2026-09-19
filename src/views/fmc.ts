/**
 * inphner: Fewest Moves (inphner-prompt.md §A3). Replaces the timer stage for
 * 333fm: a 60-minute countdown, a solution field with a live move count, and
 * Submit, which checks with cubing.js that the solution really solves the
 * scramble. The result is the move count (stored as moves × 1000 ms so the
 * stats engine works unchanged; displayed as a plain number).
 *
 * The attempt (start time + draft) survives a reload (localStorage).
 */
import { FMC_LIMIT_MS, parseFmc } from '../stats/special.ts';
import { addSolve, type Solve } from '../store.ts';
import { esc } from '../ui/dom.ts';
import { openModal } from '../ui/modal.ts';

const KEY = 'inphner.fmc';

interface Attempt { scramble: string; startedAt: number; draft: string }

function load(): Attempt | null {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Attempt | null;
    return a && typeof a.startedAt === 'number' && typeof a.scramble === 'string' ? a : null;
  } catch {
    return null;
  }
}
function save(a: Attempt | null): void {
  try {
    if (a) localStorage.setItem(KEY, JSON.stringify(a));
    else localStorage.removeItem(KEY);
  } catch { /* storage blocked */ }
}

let timer = 0;

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Does `solution` solve `scramble`? (cubing.js, rotations and centre orientation ignored.) */
async function solves(scramble: string, solution: string): Promise<boolean> {
  const { cube3x3x3 } = await import('cubing/puzzles');
  const kp = await cube3x3x3.kpuzzle();
  try {
    return kp.defaultPattern().applyAlg(scramble).applyAlg(solution)
      .experimentalIsSolved({ ignorePuzzleOrientation: true, ignoreCenterOrientation: true });
  } catch {
    return false;
  }
}

export interface FmcHooks {
  scramble: () => string;
  onResult: (solve: Solve) => void;
}

export function renderFmc(stage: HTMLElement, hooks: FmcHooks): void {
  clearInterval(timer);
  const a = load();
  const scramble = hooks.scramble();
  // An attempt belongs to its scramble; a new scramble means a fresh attempt.
  const attempt = a && a.scramble === scramble ? a : null;
  stage.innerHTML = `
    <div class="fmc-panel" data-no-timer>
      <div class="time fmc-clock num" data-role="clock">${clock(attempt ? FMC_LIMIT_MS - (Date.now() - attempt.startedAt) : FMC_LIMIT_MS)}</div>
      <div class="time-label" data-role="label">${attempt ? 'Write your solution below.' : '60 minutes, pen and paper, one cube. Start when ready.'}</div>
      <textarea class="mono fmc-input" data-role="input" rows="3" spellcheck="false" autocomplete="off"
        placeholder="R U R' … (face turns, Rw…, x y z; slice moves aren't allowed)" ${attempt ? '' : 'disabled'}>${esc(attempt?.draft ?? '')}</textarea>
      <div class="fmc-row">
        <span class="chip num" data-role="count">0 moves</span>
        <span class="grow"></span>
        ${attempt ? `<button type="button" class="btn btn-ghost btn-sm" data-fmc="dnf">Give up (DNF)</button>
          <button type="button" class="btn btn-primary" data-fmc="submit">Submit</button>`
          : `<button type="button" class="btn btn-primary" data-fmc="start">Start 60:00</button>`}
      </div>
      <div class="error-block" data-role="error" hidden></div>
    </div>`;

  const q = <T extends HTMLElement>(r: string) => stage.querySelector<T>(`[data-role="${r}"]`)!;
  const input = q<HTMLTextAreaElement>('input');
  const count = () => {
    const p = parseFmc(input.value);
    q('count').textContent = `${p.moves} move${p.moves === 1 ? '' : 's'}`;
  };
  count();

  const tick = () => {
    const cur = load();
    if (!cur) return;
    const left = FMC_LIMIT_MS - (Date.now() - cur.startedAt);
    q('clock').textContent = clock(left);
    q('clock').dataset.zone = left <= 5 * 60e3 ? (left <= 0 ? 'over' : 'warn') : '';
    if (left <= 0) {
      clearInterval(timer);
      input.disabled = true;
      q('label').textContent = 'Time. Submitting what you wrote.';
      void submit(true);
    }
  };
  if (attempt) {
    tick();
    timer = window.setInterval(tick, 1000);
    input.focus();
  }

  input.addEventListener('input', () => {
    count();
    const cur = load();
    if (cur) save({ ...cur, draft: input.value });
  });

  const finish = (solve: Solve) => {
    save(null);
    clearInterval(timer);
    hooks.onResult(solve);
  };

  const submit = async (timeUp = false): Promise<void> => {
    const err = q('error');
    const parsed = parseFmc(input.value);
    const valid = !parsed.error && await solves(scramble, input.value);
    if (valid) {
      finish(await addSolve({ timeMs: parsed.moves * 1000, penalty: 0, scramble, solution: input.value.trim(), source: 'typing' }));
      return;
    }
    const reason = parsed.error ?? 'This solution doesn\'t solve the scramble.';
    if (timeUp) {
      finish(await addSolve({ timeMs: parsed.moves * 1000, penalty: 'DNF', scramble, solution: input.value.trim(), source: 'typing' }));
      return;
    }
    err.hidden = false;
    err.textContent = reason;
  };

  stage.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-fmc]');
    if (!b) return;
    const act = b.dataset.fmc;
    if (act === 'start') {
      save({ scramble, startedAt: Date.now(), draft: '' });
      renderFmc(stage, hooks);
    } else if (act === 'submit') {
      void submit();
    } else if (act === 'dnf') {
      openModal({
        title: 'Give up this attempt?',
        danger: true,
        confirmLabel: 'Record DNF',
        bodyHtml: '<p>The attempt is saved as a DNF with whatever you wrote.</p>',
        onConfirm: async () => {
          finish(await addSolve({ timeMs: parseFmc(input.value).moves * 1000, penalty: 'DNF', scramble, solution: input.value.trim(), source: 'typing' }));
        },
      });
    }
  };
}

export function leaveFmc(): void {
  clearInterval(timer);
}
