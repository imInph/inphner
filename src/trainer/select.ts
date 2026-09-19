/**
 * inphner: choosing the next trainer case. Pure, unit-tested.
 *
 * Weighted mode (a simple spaced-repetition score per case): slow cases
 * (exponential moving average of time vs the set's average), failures,
 * time since last seen and "learning" status all raise the weight; a case
 * never seen gets a high weight so new cases come up early. The case just
 * shown is never picked twice in a row (when there's a choice).
 *
 * Deck mode: every selected case once per round, shuffled.
 */
import type { Rng } from '../scramble/moves.ts';

export type LearnStatus = 'new' | 'learning' | 'learned';

export interface CaseStats {
  status: LearnStatus;
  count: number;
  fails: number;
  /** Exponential moving average of the time (ms), 0 before the first time. */
  ema: number;
  best: number;
  sum: number;
  last: number[];
  lastSeen: number;
  recogCount: number;
  recogSum: number;
  recogFails: number;
}

export function emptyStats(): CaseStats {
  return { status: 'new', count: 0, fails: 0, ema: 0, best: 0, sum: 0, last: [], lastSeen: 0, recogCount: 0, recogSum: 0, recogFails: 0 };
}

export const EMA_ALPHA = 0.3;

/** Record a timed attempt (a "Mistake" is recorded as a failure, not a time). */
export function recordTime(s: CaseStats, ms: number, now = Date.now()): CaseStats {
  const ema = s.ema ? s.ema + EMA_ALPHA * (ms - s.ema) : ms;
  return {
    ...s, count: s.count + 1, ema, sum: s.sum + ms, best: s.best ? Math.min(s.best, ms) : ms,
    last: [...s.last, ms].slice(-5), lastSeen: now,
  };
}

export function recordFail(s: CaseStats, now = Date.now()): CaseStats {
  return { ...s, fails: s.fails + 1, lastSeen: now };
}

export function weight(s: CaseStats, setAverage: number, now = Date.now()): number {
  if (!s.count && !s.fails) return 3;
  const slowness = s.ema && setAverage ? Math.min(3, s.ema / setAverage) : 1;
  const failRate = s.fails / Math.max(1, s.count + s.fails);
  const days = s.lastSeen ? (now - s.lastSeen) / 86400000 : 7;
  const staleness = Math.min(1, days / 7);
  const learning = s.status === 'learning' ? 0.6 : s.status === 'learned' ? -0.2 : 0;
  return Math.max(0.05, 0.4 + slowness + 2 * failRate + staleness + learning);
}

export function pickWeighted(ids: string[], stats: (id: string) => CaseStats, previous: string | null, rng: Rng = Math.random, now = Date.now()): string {
  const pool = ids.length > 1 && previous ? ids.filter((x) => x !== previous) : ids;
  const emas = ids.map((id) => stats(id).ema).filter((x) => x > 0);
  const avg = emas.length ? emas.reduce((a, b) => a + b, 0) / emas.length : 0;
  const w = pool.map((id) => weight(stats(id), avg, now));
  const total = w.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= w[i]!;
    if (r <= 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}

/** A shuffled round of all ids; the first card never repeats the previous one. */
export function newDeck(ids: string[], previous: string | null, rng: Rng = Math.random): string[] {
  const d = [...ids];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j]!, d[i]!];
  }
  if (d.length > 1 && d[0] === previous) [d[0], d[1]] = [d[1]!, d[0]!];
  return d;
}

export function cycleStatus(s: LearnStatus): LearnStatus {
  return s === 'new' ? 'learning' : s === 'learning' ? 'learned' : 'new';
}
