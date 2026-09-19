/**
 * inphner: the statistics maths (inphner-prompt.md §A7). Pure, unit-tested.
 *
 * - Everything is "with penalties applied": +2 adds 2000 ms; DNF is Infinity
 *   (the worst result, sorts last).
 * - Singles are quantised like WCA Regulation 9f1 before any maths: truncated
 *   to 0.01 s (10 ms), or to 1 ms at 0.001 precision. Averages/means are then
 *   rounded half-up by formatAverage() when displayed (9f2).
 * - mo3 (and any mean of N < 5): plain mean, any DNF → DNF.
 * - aoN (N ≥ 5): drop ceil(N × 5%) from each end, mean of the rest;
 *   more DNFs than the top trim → DNF. (ao5/ao12 drop 1, ao25 2, ao50 3,
 *   ao100 5, ao1000 50.)
 */
import type { Penalty } from '../timer/format.ts';

export const DNF = Infinity;

export interface Result {
  timeMs: number;
  penalty: Penalty;
}

/** Truncate a raw time to the display precision (WCA 9f1). */
export function quantize(ms: number, precision: 2 | 3 = 2): number {
  const unit = precision === 3 ? 1 : 10;
  return Math.floor(ms / unit + 1e-9) * unit;
}

/** Effective result in ms: penalty applied, DNF = Infinity. */
export function effective(r: Result, precision: 2 | 3 = 2): number {
  if (r.penalty === 'DNF') return DNF;
  return quantize(r.timeMs, precision) + r.penalty;
}

/** How many results aoN drops from each end. */
export function trimCount(n: number): number {
  return n < 5 ? 0 : Math.ceil(n * 0.05);
}

/** Positions a window trims: the ceil(5%) best and worst (first occurrence wins ties). */
export function trimmedIndices(values: number[]): Set<number> {
  const n = values.length;
  const t = trimCount(n);
  const out = new Set<number>();
  if (!t) return out;
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (let k = 0; k < t; k++) out.add(order[k]![1]);
  for (let k = 0; k < t; k++) out.add(order[n - 1 - k]![1]);
  return out;
}

/** Mean of N (N < 5): plain mean, any DNF → DNF. */
export function meanOf(values: number[]): number {
  if (!values.length) return NaN;
  let sum = 0;
  for (const v of values) {
    if (v === DNF) return DNF;
    sum += v;
  }
  return sum / values.length;
}

/**
 * Average of N over already-effective values (N = values.length ≥ 5):
 * the WCA/csTimer trimmed mean. Returns DNF (Infinity) when too many DNFs.
 */
export function averageOf(values: number[]): number {
  const n = values.length;
  if (n < 5) return meanOf(values);
  const trim = trimCount(n);
  let dnfs = 0;
  for (const v of values) if (v === DNF) dnfs++;
  if (dnfs > trim) return DNF;
  const sorted = [...values].sort((a, b) => a - b);
  let sum = 0;
  for (let i = trim; i < n - trim; i++) sum += sorted[i]!;
  return sum / (n - 2 * trim);
}

/** The statistic for the last `n` values ending at `end` (exclusive); NaN when there aren't enough. */
export function statAt(values: number[], n: number, end = values.length): number {
  if (end < n) return NaN;
  const window = values.slice(end - n, end);
  return n < 5 ? meanOf(window) : averageOf(window);
}

/** aoN / moN ending at each index (NaN until N results exist). O(len · N log N): fine for lists; step 5 adds the incremental engine. */
export function rolling(values: number[], n: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = n; i <= values.length; i++) out[i - 1] = statAt(values, n, i);
  return out;
}

export interface Best {
  value: number;
  /** Inclusive start / exclusive end index of the window it came from. */
  start: number;
  end: number;
}

/** Best (lowest) rolling statistic and where it came from; null if never reached or all DNF. */
export function bestRolling(values: number[], n: number): Best | null {
  let best: Best | null = null;
  const r = rolling(values, n);
  r.forEach((v, i) => {
    if (Number.isNaN(v) || v === DNF) return;
    if (!best || v < best.value) best = { value: v, start: i + 1 - n, end: i + 1 };
  });
  return best;
}

export interface Summary {
  count: number;
  dnfs: number;
  /** Best / worst single (worst is DNF if any DNF exists). */
  best: number;
  worst: number;
  /** Mean of the non-DNF results (or DNF-inclusive → DNF, when asked). */
  mean: number;
  /** Population standard deviation of the non-DNF results. */
  sd: number;
  /** Sum of the raw times, penalties included, DNFs' raw time included. */
  totalMs: number;
}

export function summarize(results: readonly Result[], opts: { dnfInMean?: boolean; precision?: 2 | 3 } = {}): Summary {
  const precision = opts.precision ?? 2;
  let dnfs = 0;
  let best = DNF;
  let worst = -Infinity;
  let sum = 0;
  let sumSq = 0;
  let ok = 0;
  let totalMs = 0;
  for (const r of results) {
    const v = effective(r, precision);
    totalMs += r.timeMs + (r.penalty === 2000 ? 2000 : 0);
    if (v === DNF) {
      dnfs++;
      worst = DNF;
      continue;
    }
    ok++;
    sum += v;
    sumSq += v * v;
    if (v < best) best = v;
    if (v > worst) worst = v;
  }
  const mean = ok ? sum / ok : NaN;
  return {
    count: results.length,
    dnfs,
    best: results.length ? best : NaN,
    worst: results.length ? worst : NaN,
    mean: opts.dnfInMean && dnfs ? DNF : mean,
    sd: ok ? Math.sqrt(Math.max(0, sumSq / ok - mean * mean)) : NaN,
    totalMs,
  };
}
