/**
 * inphner: data preparation for the Stats view's charts. Pure, unit-tested.
 * Values are effective ms (DNF = Infinity); dates are LOCAL (never derived
 * from toISOString()).
 */
import { DNF } from './core.ts';

/* ---------------------------------------------------------------- histogram */

const NICE = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 15000, 30000, 60000, 120000, 300000];

/**
 * Bucket width for a distribution: aims at ~20 bars across the central 96% of
 * results, snapped to a "nice" width (0.5 s for a typical 3x3 session).
 */
export function bucketWidth(values: number[]): number {
  const ok = values.filter((v) => v !== DNF).sort((a, b) => a - b);
  if (ok.length < 2) return 1000;
  const lo = ok[Math.floor(ok.length * 0.02)]!;
  const hi = ok[Math.min(ok.length - 1, Math.ceil(ok.length * 0.98) - 1)]!;
  const target = Math.max(1, hi - lo) / 20;
  return NICE.find((w) => w >= target) ?? NICE[NICE.length - 1]!;
}

export interface Histogram { width: number; start: number; counts: number[] }

/** Counts per bucket over the central range (outliers clamp into the end buckets). */
export function histogram(values: number[], width = bucketWidth(values)): Histogram {
  const ok = values.filter((v) => v !== DNF).sort((a, b) => a - b);
  if (!ok.length) return { width, start: 0, counts: [] };
  const lo = ok[Math.floor(ok.length * 0.01)]!;
  const hi = ok[Math.min(ok.length - 1, Math.ceil(ok.length * 0.99) - 1)]!;
  const start = Math.floor(lo / width) * width;
  const buckets = Math.max(1, Math.floor((hi - start) / width) + 1);
  const counts = new Array<number>(buckets).fill(0);
  for (const v of ok) {
    const i = Math.min(buckets - 1, Math.max(0, Math.floor((v - start) / width)));
    counts[i]!++;
  }
  return { width, start, counts };
}

/* --------------------------------------------------------------- calendar */

/** Local YYYY-MM-DD for a timestamp. */
export function localDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface HeatDay { day: string; count: number; level: 0 | 1 | 2 | 3 }

/**
 * Solves per day for the `weeks` weeks up to and including `today` (local),
 * starting on a Monday so columns are weeks. Levels: 0 none, 1–3 by thirds of
 * the busiest day.
 */
export function heatmap(createdAts: number[], today = Date.now(), weeks = 53): HeatDay[] {
  const counts = new Map<string, number>();
  for (const t of createdAts) {
    const k = localDay(t);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const end = new Date(today);
  end.setHours(12, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7 - 1));
  // Back up to Monday.
  const dow = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow);
  const days: HeatDay[] = [];
  let max = 0;
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = localDay(d.getTime());
    const c = counts.get(k) ?? 0;
    max = Math.max(max, c);
    days.push({ day: k, count: c, level: 0 });
  }
  for (const d of days) {
    d.level = d.count === 0 ? 0 : d.count <= max / 3 ? 1 : d.count <= (2 * max) / 3 ? 2 : 3;
  }
  return days;
}

/* ------------------------------------------------------------ time of day */

export interface Bucketed { average: number[]; count: number[] }

/** Average (non-DNF) result per hour of day (0–23) and per weekday (0 = Monday). */
export function byHourAndWeekday(results: { value: number; createdAt: number }[]): { hour: Bucketed; weekday: Bucketed } {
  const hs = new Array<number>(24).fill(0);
  const hc = new Array<number>(24).fill(0);
  const ws = new Array<number>(7).fill(0);
  const wc = new Array<number>(7).fill(0);
  for (const r of results) {
    if (r.value === DNF) continue;
    const d = new Date(r.createdAt);
    const h = d.getHours();
    const w = (d.getDay() + 6) % 7;
    hs[h]! += r.value; hc[h]!++;
    ws[w]! += r.value; wc[w]!++;
  }
  return {
    hour: { average: hs.map((s, i) => (hc[i] ? s / hc[i]! : NaN)), count: hc },
    weekday: { average: ws.map((s, i) => (wc[i] ? s / wc[i]! : NaN)), count: wc },
  };
}

/* --------------------------------------------------------- PB progression */

export interface Step { index: number; value: number }

/** Each time the rolling value (NaN/DNF skipped) sets a new best: the steps of a PB chart. */
export function pbSteps(rolling: number[]): Step[] {
  const steps: Step[] = [];
  let best = Infinity;
  rolling.forEach((v, i) => {
    if (Number.isNaN(v) || v === DNF) return;
    if (v < best) {
      best = v;
      steps.push({ index: i, value: v });
    }
  });
  return steps;
}

/* ------------------------------------------------------------------ splits */

/** Per-phase durations (from cumulative splits) of every solve that has `phases` splits. */
export function phaseDurations(splits: (number[] | undefined)[], phases: number): number[][] {
  const out: number[][] = [];
  for (const s of splits) {
    if (!s || s.length !== phases) continue;
    out.push(s.map((ms, i) => ms - (i ? s[i - 1]! : 0)));
  }
  return out;
}

export function phaseAverages(durations: number[][]): number[] {
  if (!durations.length) return [];
  const n = durations[0]!.length;
  return Array.from({ length: n }, (_, i) => durations.reduce((a, d) => a + d[i]!, 0) / durations.length);
}

/* ------------------------------------------------------------------- trend */

/** Downsample a series to at most `max` points, keeping each bucket's min and max (shape-preserving). */
export function downsample(points: { x: number; y: number }[], max: number): { x: number; y: number }[] {
  if (points.length <= max) return points;
  const bucket = Math.ceil(points.length / (max / 2));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length; i += bucket) {
    let lo = points[i]!;
    let hi = points[i]!;
    for (let j = i; j < Math.min(points.length, i + bucket); j++) {
      const p = points[j]!;
      if (p.y < lo.y) lo = p;
      if (p.y > hi.y) hi = p;
    }
    if (lo.x <= hi.x) out.push(lo, hi); else out.push(hi, lo);
  }
  return out;
}
