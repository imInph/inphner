/**
 * inphner: csTimer export (.txt JSON) import + a csTimer-compatible export.
 * Pure, unit-tested.
 *
 * csTimer's format:
 *   { "session1": [ [[penalty, time, ...splits], "scramble", "comment", unixSeconds], ... ],
 *     "session2": [...], …,
 *     "properties": { "sessionData": "<JSON string>" | {…}, … } }
 *   penalty: 0, 2000 (ms) or -1 for DNF; time: raw ms (penalty not applied).
 *   sessionData: { "1": { "name": "…", "opt": { "scrType": "444wca" }, "rank": 1 }, … }
 *   Multi-phase entries carry extra numbers after the total: the times at
 *   which the earlier phases ended, latest first ([0, 10000, 7000, 3000] →
 *   phases end at 3.00 / 7.00 / 10.00).
 */
import { isEvent } from '../events.ts';
import type { Penalty } from '../timer/format.ts';

/** csTimer scramble type → inphner event id. */
const SCR_TO_EVENT: Record<string, string> = {
  '333': '333', '222so': '222', '444wca': '444', '555wca': '555', '666wca': '666', '777wca': '777',
  '333ni': '333bf', '444bld': '444bf', '555bld': '555bf', 'r3ni': '333mbf', '333fm': '333fm',
  'clkwca': 'clock', 'mgmp': 'minx', 'pyrso': 'pyram', 'skbso': 'skewb', 'sqrs': 'sq1',
  'lsemu': 'lse', 'lse': 'lse', '2gen': '2gen', '2genl': '2gen', 'll': 'll', 'zbll': 'll', 'f2l': 'f2l',
  'input': 'none', 'r3': '333',
};
const EVENT_TO_SCR: Record<string, string> = {
  '333': '333', '222': '222so', '444': '444wca', '555': '555wca', '666': '666wca', '777': '777wca',
  '333oh': '333', '333bf': '333ni', '444bf': '444bld', '555bf': '555bld', '333mbf': 'r3ni', '333fm': '333fm',
  'clock': 'clkwca', 'minx': 'mgmp', 'pyram': 'pyrso', 'skewb': 'skbso', 'sq1': 'sqrs', 'lse': 'lsemu',
  '2gen': '2gen', 'll': 'll', 'f2l': 'f2l', 'none': 'input',
};

/** Best guess for an event: the scramble type first, then the session name ("3x3 OH", "BLD"…). */
export function eventForCsTimer(scrType: string | undefined, name: string): string {
  const byType = scrType ? SCR_TO_EVENT[scrType] : undefined;
  const n = name.toLowerCase();
  if ((byType === '333' || !byType) && /\boh\b|one.?hand/.test(n)) return '333oh';
  if ((byType === '333' || !byType) && /\bbld\b|blind/.test(n)) return '333bf';
  if ((byType === '333' || !byType) && /\bfm(c)?\b|fewest/.test(n)) return '333fm';
  if (byType) return byType;
  const m = /([2-7])x\1/.exec(n);
  if (m) return `${m[1]}${m[1]}${m[1]}`;
  if (/pyra/.test(n)) return 'pyram';
  if (/skewb/.test(n)) return 'skewb';
  if (/mega|minx/.test(n)) return 'minx';
  if (/sq(uare)?-?1/.test(n)) return 'sq1';
  if (/clock/.test(n)) return 'clock';
  return '333';
}

export interface ImportedSolve {
  timeMs: number;
  penalty: Penalty;
  scramble: string;
  comment: string;
  createdAt: number;
  splits?: number[];
  solution?: string;
}

export interface ImportedSession {
  key: string;
  name: string;
  event: string;
  rank: number;
  solves: ImportedSolve[];
}

export interface CsTimerImport {
  sessions: ImportedSession[];
  skipped: number;
}

function parseEntry(e: unknown): ImportedSolve | null {
  if (!Array.isArray(e) || !Array.isArray(e[0])) return null;
  const t = e[0] as unknown[];
  const pen = Number(t[0]);
  const time = Number(t[1]);
  if (!Number.isFinite(time) || time < 0) return null;
  const penalty: Penalty = pen === -1 ? 'DNF' : pen === 2000 ? 2000 : 0;
  const extra = t.slice(2).map(Number).filter((x) => Number.isFinite(x) && x > 0 && x < time);
  const solve: ImportedSolve = {
    timeMs: Math.round(time),
    penalty,
    scramble: typeof e[1] === 'string' ? e[1] : '',
    comment: typeof e[2] === 'string' ? e[2] : '',
    createdAt: Number.isFinite(Number(e[3])) && Number(e[3]) > 0 ? Math.round(Number(e[3]) * 1000) : 0,
  };
  if (extra.length) solve.splits = [...extra].reverse().concat(Math.round(time));
  if (typeof e[4] === 'string' && e[4]) solve.solution = e[4];
  return solve;
}

/** Parse a csTimer export. Throws with a readable message when it isn't one. */
export function parseCsTimer(text: string): CsTimerImport {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('This file isn\'t valid JSON, so it isn\'t a csTimer export.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('This isn\'t a csTimer export.');
  const props = (data.properties ?? {}) as Record<string, unknown>;
  let meta: Record<string, { name?: unknown; opt?: { scrType?: unknown }; rank?: unknown }> = {};
  const raw = props.sessionData;
  try {
    meta = (typeof raw === 'string' ? JSON.parse(raw) : raw ?? {}) as typeof meta;
  } catch {
    meta = {};
  }
  const keys = Object.keys(data).filter((k) => /^session\d+$/.test(k));
  if (!keys.length) throw new Error('No sessions found. Export from csTimer with "Export to file".');
  let skipped = 0;
  const sessions = keys.map((key) => {
    const idx = key.slice('session'.length);
    const m = meta[idx] ?? {};
    const name = typeof m.name === 'string' || typeof m.name === 'number' ? String(m.name) : `Session ${idx}`;
    const scrType = typeof m.opt?.scrType === 'string' ? m.opt.scrType : undefined;
    const entries = Array.isArray(data[key]) ? (data[key] as unknown[]) : [];
    const solves: ImportedSolve[] = [];
    for (const e of entries) {
      const s = parseEntry(e);
      if (s) solves.push(s);
      else skipped++;
    }
    const event = eventForCsTimer(scrType, name);
    return { key, name, event: isEvent(event) ? event : '333', rank: Number(m.rank) || Number(idx), solves };
  }).sort((a, b) => a.rank - b.rank);
  return { sessions, skipped };
}

export interface ExportSession {
  name: string;
  event: string;
  solves: { timeMs: number; penalty: Penalty; scramble: string; comment?: string; createdAt: number; splits?: number[]; solution?: string }[];
}

/** Build a csTimer-importable JSON string. */
export function buildCsTimer(sessions: ExportSession[]): string {
  const out: Record<string, unknown> = {};
  const sessionData: Record<string, unknown> = {};
  sessions.forEach((s, i) => {
    const n = i + 1;
    out[`session${n}`] = s.solves.map((x) => {
      const pen = x.penalty === 'DNF' ? -1 : x.penalty;
      const times: number[] = [pen, x.timeMs];
      if (x.splits && x.splits.length > 1) times.push(...x.splits.slice(0, -1).reverse());
      const entry: unknown[] = [times, x.scramble, x.comment ?? '', Math.floor(x.createdAt / 1000)];
      if (x.solution) entry.push(x.solution);
      return entry;
    });
    sessionData[String(n)] = { name: s.name, opt: EVENT_TO_SCR[s.event] && EVENT_TO_SCR[s.event] !== '333' ? { scrType: EVENT_TO_SCR[s.event] } : {}, rank: n };
  });
  out.properties = { sessionData: JSON.stringify(sessionData), sessionN: sessions.length };
  return JSON.stringify(out);
}
