/**
 * inphner: incremental statistics for one session (inphner-prompt.md §A7).
 * Pure; unit-tested against the naive maths in core.ts.
 *
 * For every tracked N it keeps the current window SORTED, so a new solve
 * costs one binary-search insert + one removal (a memmove) and one pass over
 * the window: O(N) per N, about 2 000 simple operations for all of
 * mo3 / ao5 … ao1000. That's far under a millisecond, independent of how many
 * solves the session has. A full rebuild (on load, or when an old solve
 * changes) slides the same windows across the whole session once.
 *
 * Also tracks the best rolling value per N (with the window it came from),
 * the best single, and which solves set a PB when they happened.
 */
import { DNF, meanOf, trimCount } from './core.ts';

export const TRACKED = [3, 5, 12, 25, 50, 100, 200, 500, 1000] as const;
/** Averages whose PBs are celebrated (plus the single). */
export const PB_TRACKED = [5, 12, 50, 100] as const;

export interface BestWindow { value: number; start: number; end: number }

export interface PbEvent {
  /** 1 for single, else N. */
  n: number;
  value: number;
  /** Previous best (NaN when this is the first). */
  previous: number;
}

class Window {
  readonly n: number;
  readonly trim: number;
  sorted: number[] = [];
  rolling: number[] = [];
  best: BestWindow | null = null;
  constructor(n: number) {
    this.n = n;
    this.trim = trimCount(n);
  }
}

function insertSorted(a: number[], v: number): void {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  a.splice(lo, 0, v);
}

function removeSorted(a: number[], v: number): void {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  if (a[lo] === v) a.splice(lo, 1);
}

/** The statistic of a full, sorted window. */
function statOf(w: Window): number {
  const s = w.sorted;
  if (w.n < 5) return meanOf(s);
  const t = w.trim;
  if (s[s.length - 1 - t] === DNF) return DNF; // more DNFs than the top trim
  let sum = 0;
  for (let i = t; i < s.length - t; i++) sum += s[i]!;
  return sum / (s.length - 2 * t);
}

export class SessionStats {
  values: number[] = [];
  private windows = new Map<number, Window>();
  bestSingle: { value: number; index: number } | null = null;
  /** Indices of solves that set a PB (single or a PB_TRACKED average) when they happened. */
  pbIndices = new Set<number>();
  /** Running totals of the non-DNF results (mean and σ without a pass over the session). */
  dnfs = 0;
  private sum = 0;
  private sumSq = 0;

  constructor(values: readonly number[] = []) {
    for (const n of TRACKED) this.windows.set(n, new Window(n));
    this.rebuild(values);
  }

  get length(): number {
    return this.values.length;
  }

  rebuild(values: readonly number[]): void {
    this.values = [];
    this.bestSingle = null;
    this.pbIndices = new Set();
    this.dnfs = 0;
    this.sum = 0;
    this.sumSq = 0;
    for (const w of this.windows.values()) {
      w.sorted = [];
      w.rolling = [];
      w.best = null;
    }
    for (const v of values) this.push(v);
  }

  /** Append a result; returns the PBs it set. */
  push(v: number): PbEvent[] {
    const index = this.values.length;
    this.values.push(v);
    const pbs: PbEvent[] = [];
    if (v === DNF) this.dnfs++;
    else {
      this.sum += v;
      this.sumSq += v * v;
    }

    if (v !== DNF && (!this.bestSingle || v < this.bestSingle.value)) {
      pbs.push({ n: 1, value: v, previous: this.bestSingle?.value ?? NaN });
      this.bestSingle = { value: v, index };
    }

    for (const w of this.windows.values()) {
      insertSorted(w.sorted, v);
      if (w.sorted.length > w.n) removeSorted(w.sorted, this.values[index - w.n]!);
      if (w.sorted.length < w.n) {
        w.rolling.push(NaN);
        continue;
      }
      const stat = statOf(w);
      w.rolling.push(stat);
      if (stat !== DNF && (!w.best || stat < w.best.value)) {
        if ((PB_TRACKED as readonly number[]).includes(w.n)) pbs.push({ n: w.n, value: stat, previous: w.best?.value ?? NaN });
        w.best = { value: stat, start: index + 1 - w.n, end: index + 1 };
      }
    }
    if (pbs.length) this.pbIndices.add(index);
    return pbs;
  }

  /** Replace the last result (e.g. a penalty change on the solve just done). */
  setLast(v: number): PbEvent[] {
    this.popLast();
    return this.push(v);
  }

  /** Remove the last result (delete of the newest solve). */
  popLast(): void {
    const index = this.values.length - 1;
    if (index < 0) return;
    const v = this.values.pop()!;
    this.pbIndices.delete(index);
    if (v === DNF) this.dnfs--;
    else {
      this.sum -= v;
      this.sumSq -= v * v;
    }
    for (const w of this.windows.values()) {
      w.rolling.pop();
      removeSorted(w.sorted, v);
      const back = index - w.n;
      if (back >= 0) insertSorted(w.sorted, this.values[back]!);
      if (w.best && w.best.end > index) {
        // The best window included the removed solve: rescan the rolling values.
        w.best = null;
        w.rolling.forEach((r, i) => {
          if (Number.isNaN(r) || r === DNF) return;
          if (!w.best || r < w.best.value) w.best = { value: r, start: i + 1 - w.n, end: i + 1 };
        });
      }
    }
    if (this.bestSingle && this.bestSingle.index === index) {
      this.bestSingle = null;
      this.values.forEach((x, i) => {
        if (x !== DNF && (!this.bestSingle || x < this.bestSingle.value)) this.bestSingle = { value: x, index: i };
      });
    }
  }

  /** Mean of the non-DNF results (DNF when `dnfInMean` and any DNF exists). */
  mean(dnfInMean = false): number {
    const ok = this.values.length - this.dnfs;
    if (dnfInMean && this.dnfs) return DNF;
    return ok ? this.sum / ok : NaN;
  }

  /** Population standard deviation of the non-DNF results. */
  sd(): number {
    const ok = this.values.length - this.dnfs;
    if (!ok) return NaN;
    const m = this.sum / ok;
    return Math.sqrt(Math.max(0, this.sumSq / ok - m * m));
  }

  /** Current aoN / moN (NaN until N results exist). */
  current(n: number): number {
    const w = this.windows.get(n);
    if (!w) return NaN;
    return w.rolling[w.rolling.length - 1] ?? NaN;
  }

  best(n: number): BestWindow | null {
    return this.windows.get(n)?.best ?? null;
  }

  rolling(n: number): number[] {
    return this.windows.get(n)?.rolling ?? [];
  }
}
