/**
 * inphner: one incremental SessionStats per session, kept in sync with the
 * store's solve list via its per-session revision (store.sessionRev). O(1) to
 * decide, then the cheapest update:
 *   one solve appended        → push (reports PBs)
 *   last solve changed        → setLast (penalty toggle on the solve just done)
 *   last solve removed        → popLast
 *   anything else             → rebuild
 */
import { effective } from './core.ts';
import { SessionStats, type PbEvent } from './engine.ts';
import { prefs } from '../prefs.ts';
import type { Solve } from '../types.ts';
import { sessionRev } from '../store.ts';

interface Entry { stats: SessionStats; precision: 2 | 3; rev: number; lastPush: { id: string; pbs: PbEvent[] } | null }

const cache = new Map<string, Entry>();

export interface Synced { stats: SessionStats; pbs: PbEvent[] }

export function syncStats(sessionId: string, solves: readonly Solve[]): Synced {
  const precision = prefs().precision;
  const { rev, op } = sessionRev(sessionId);
  let e = cache.get(sessionId);
  const full = () => solves.map((s) => effective(s, precision));
  if (!e || e.precision !== precision) {
    e = { stats: new SessionStats(full()), precision, rev, lastPush: null };
    cache.set(sessionId, e);
    return { stats: e.stats, pbs: [] };
  }
  if (rev === e.rev) return { stats: e.stats, pbs: [] };
  const n = solves.length;
  const old = e.stats.length;
  // Exactly one change since we last looked, and it's one we can apply in O(N).
  if (rev === e.rev + 1) {
    e.rev = rev;
    if (op === 'append' && n === old + 1) {
      const pbs = e.stats.push(effective(solves[n - 1]!, precision));
      e.lastPush = { id: solves[n - 1]!.id, pbs };
      return { stats: e.stats, pbs };
    }
    if (op === 'update-last' && n === old && n > 0) {
      return { stats: e.stats, pbs: e.stats.setLast(effective(solves[n - 1]!, precision)) };
    }
    if (op === 'pop-last' && n === old - 1) {
      e.stats.popLast();
      return { stats: e.stats, pbs: [] };
    }
  }
  e.rev = rev;
  e.stats.rebuild(full());
  return { stats: e.stats, pbs: [] };
}

/** PBs set by the solve `solveId` when it was appended (once; later calls get []). */
export function takePbs(sessionId: string, solveId: string): PbEvent[] {
  const e = cache.get(sessionId);
  if (!e?.lastPush || e.lastPush.id !== solveId) return [];
  const { pbs } = e.lastPush;
  e.lastPush = null;
  return pbs;
}

export function dropStats(sessionId: string): void {
  cache.delete(sessionId);
}
