/**
 * inphner: the full-fidelity backup format (inphner JSON). Pure, unit-tested.
 * Every record keeps its UUID and updatedAt, so importing a backup merges:
 * newer updatedAt wins, nothing is duplicated.
 */
import { isEvent } from '../events.ts';
import type { Session, Solve } from '../types.ts';

export const BACKUP_FORMAT = 'inphner';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  sessions: Session[];
  solves: Solve[];
}

export function buildBackup(sessions: readonly Session[], solves: readonly Solve[], now = Date.now()): string {
  const b: Backup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, sessions: [...sessions], solves: [...solves] };
  return JSON.stringify(b);
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 200;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Validate a backup; drops malformed records and reports how many. */
export function parseBackup(text: string): { sessions: Session[]; solves: Solve[]; dropped: number } | null {
  let data: Partial<Backup>;
  try {
    data = JSON.parse(text) as Partial<Backup>;
  } catch {
    return null;
  }
  if (!data || data.format !== BACKUP_FORMAT || !Array.isArray(data.sessions) || !Array.isArray(data.solves)) return null;
  let dropped = 0;
  const sessions = data.sessions.filter((s): s is Session => {
    const ok = !!s && isStr(s.id) && typeof s.name === 'string' && isStr(s.event) && isEvent(s.event) && isNum(s.createdAt) && isNum(s.updatedAt);
    if (!ok) dropped++;
    return ok;
  });
  const ids = new Set(sessions.map((s) => s.id));
  const solves = data.solves.filter((s): s is Solve => {
    const ok = !!s && isStr(s.id) && ids.has(s.sessionId) && isNum(s.timeMs) && s.timeMs >= 0
      && (s.penalty === 0 || s.penalty === 2000 || s.penalty === 'DNF') && typeof s.scramble === 'string'
      && isNum(s.createdAt) && isNum(s.updatedAt);
    if (!ok) dropped++;
    return ok;
  });
  return { sessions, solves, dropped };
}

/** Merge incoming records over existing ones by id: the newer updatedAt wins. */
export function mergeById<T extends { id: string; updatedAt: number }>(existing: readonly T[], incoming: readonly T[]): { put: T[]; added: number; updated: number } {
  const byId = new Map(existing.map((x) => [x.id, x]));
  const put: T[] = [];
  let added = 0;
  let updated = 0;
  for (const x of incoming) {
    const cur = byId.get(x.id);
    if (!cur) { put.push(x); added++; }
    else if (x.updatedAt > cur.updatedAt) { put.push(x); updated++; }
  }
  return { put, added, updated };
}
