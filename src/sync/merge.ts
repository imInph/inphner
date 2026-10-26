/**
 * inphner: the Drive sync format and how copies merge. PURE, unit-tested.
 *
 * Every device writes ONE file of its own (device-<id>.json.gz in the Drive
 * app folder) holding everything it knows, and reads everyone else's. One
 * writer per file means two devices can never overwrite each other's work;
 * the merge below is what makes the copies agree.
 *
 * Rules, per record id:
 * - the newer updatedAt wins;
 * - a delete leaves a tombstone (id → deletedAt), and a tombstone beats any
 *   copy that isn't newer than it. Restoring something (Undo) gives it a fresh
 *   updatedAt, which is how it outlives its own tombstone;
 * - a solve whose session was deleted elsewhere is never dropped: it lands in
 *   a "Recovered" session with an id derived from the lost one, so two devices
 *   recovering the same solves agree on the same session.
 */
import type { Session, Solve } from '../types.ts';

export const SYNC_FORMAT = 'inphner-sync';
export const SYNC_VERSION = 1;

export type Tombstones = Record<string, number>;

export interface SyncState {
  sessions: Session[];
  solves: Solve[];
  deleted: Tombstones;
}

export interface SyncDoc extends SyncState {
  format: typeof SYNC_FORMAT;
  version: number;
  deviceId: string;
  writtenAt: number;
}

export function buildSyncDoc(state: SyncState, deviceId: string, now = Date.now()): SyncDoc {
  return { format: SYNC_FORMAT, version: SYNC_VERSION, deviceId, writtenAt: now, ...state };
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 200;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Validate a downloaded file. Malformed records are dropped; a foreign or newer format is refused whole. */
export function parseSyncDoc(text: string): SyncDoc | null {
  let d: Partial<SyncDoc>;
  try {
    d = JSON.parse(text) as Partial<SyncDoc>;
  } catch {
    return null;
  }
  if (!d || d.format !== SYNC_FORMAT || !isNum(d.version) || d.version > SYNC_VERSION) return null;
  if (!Array.isArray(d.sessions) || !Array.isArray(d.solves) || !d.deleted || typeof d.deleted !== 'object') return null;
  const deleted: Tombstones = {};
  for (const [k, v] of Object.entries(d.deleted)) if (isStr(k) && isNum(v)) deleted[k] = v;
  return {
    format: SYNC_FORMAT, version: d.version, deviceId: isStr(d.deviceId) ? d.deviceId : '',
    writtenAt: isNum(d.writtenAt) ? d.writtenAt : 0,
    sessions: d.sessions.filter((s): s is Session => !!s && isStr(s.id) && typeof s.name === 'string'
      && isStr(s.event) && isNum(s.createdAt) && isNum(s.updatedAt) && isNum(s.order)),
    solves: d.solves.filter((s): s is Solve => !!s && isStr(s.id) && isStr(s.sessionId) && isNum(s.timeMs)
      && (s.penalty === 0 || s.penalty === 2000 || s.penalty === 'DNF') && typeof s.scramble === 'string'
      && isStr(s.event) && isNum(s.createdAt) && isNum(s.updatedAt)),
    deleted,
  };
}

export const RECOVERED_PREFIX = 'recovered-';

export interface MergeResult {
  /** The state every device converges on. */
  state: SyncState;
  /** What the local database has to do to get there. */
  putSessions: Session[];
  putSolves: Solve[];
  delSessions: string[];
  delSolves: string[];
  /** Whether the merged state differs from the local one at all. */
  changed: boolean;
}

function lww<T extends { id: string; updatedAt: number }>(into: Map<string, T>, list: readonly T[]): void {
  for (const x of list) {
    const cur = into.get(x.id);
    // Equal times are rare but must still pick the same winner everywhere.
    if (!cur || x.updatedAt > cur.updatedAt || (x.updatedAt === cur.updatedAt && x !== cur && JSON.stringify(x) > JSON.stringify(cur))) into.set(x.id, x);
  }
}

/**
 * Merge remote copies into the local one. Order-independent and idempotent:
 * merging A into B gives the same state as B into A, and merging twice
 * changes nothing the second time.
 *
 * `firstSync`: this device has never synced. A brand-new browser always
 * makes an empty "Main" session; if that's all it has and the remote holds
 * sessions, the empty one is dropped instead of piling up one per device.
 */
export function mergeStates(local: SyncState, remotes: readonly SyncState[], firstSync = false): MergeResult {
  const deleted: Tombstones = { ...local.deleted };
  for (const r of remotes) {
    for (const [id, t] of Object.entries(r.deleted)) if (!(id in deleted) || t > deleted[id]!) deleted[id] = t;
  }

  const sessions = new Map<string, Session>();
  const solves = new Map<string, Solve>();
  lww(sessions, local.sessions);
  lww(solves, local.solves);
  for (const r of remotes) {
    lww(sessions, r.sessions);
    lww(solves, r.solves);
  }

  if (firstSync && local.sessions.length === 1 && !local.solves.length) {
    const only = local.sessions[0]!;
    const remoteHasOthers = remotes.some((r) => r.sessions.some((s) => s.id !== only.id && !(s.updatedAt <= (deleted[s.id] ?? -1))));
    if (remoteHasOthers && !remotes.some((r) => r.sessions.some((s) => s.id === only.id))) {
      sessions.delete(only.id);
      deleted[only.id] = only.updatedAt;
    }
  }

  // A tombstone wins unless the record was touched after it.
  for (const [id, s] of sessions) if (id in deleted && s.updatedAt <= deleted[id]!) sessions.delete(id);
  for (const [id, s] of solves) if (id in deleted && s.updatedAt <= deleted[id]!) solves.delete(id);

  // Orphans: a live solve whose session is gone (deleted or merged away on another device).
  let order = 0;
  for (const s of sessions.values()) order = Math.max(order, s.order + 1);
  for (const [id, s] of solves) {
    if (sessions.has(s.sessionId)) continue;
    const rid = s.sessionId.startsWith(RECOVERED_PREFIX) ? s.sessionId : RECOVERED_PREFIX + s.sessionId;
    let home = sessions.get(rid);
    if (!home) {
      home = { id: rid, name: 'Recovered', event: s.event, createdAt: s.createdAt, updatedAt: s.updatedAt, order: order++ };
      sessions.set(rid, home);
    }
    if (rid !== s.sessionId) solves.set(id, { ...s, sessionId: rid, event: home.event });
  }

  const localSessions = new Map(local.sessions.map((s) => [s.id, s]));
  const localSolves = new Map(local.solves.map((s) => [s.id, s]));
  const putSessions = [...sessions.values()].filter((s) => localSessions.get(s.id) !== s);
  const putSolves = [...solves.values()].filter((s) => localSolves.get(s.id) !== s);
  const delSessions = local.sessions.filter((s) => !sessions.has(s.id)).map((s) => s.id);
  const delSolves = local.solves.filter((s) => !solves.has(s.id)).map((s) => s.id);
  const changed = putSessions.length + putSolves.length + delSessions.length + delSolves.length > 0
    || Object.keys(deleted).length !== Object.keys(local.deleted).length
    || Object.entries(deleted).some(([k, v]) => local.deleted[k] !== v);

  return {
    state: { sessions: [...sessions.values()], solves: [...solves.values()], deleted },
    putSessions, putSolves, delSessions, delSolves, changed,
  };
}

/**
 * A cheap summary of a state: if it's unchanged since the last upload there's
 * nothing new to write. Every edit moves updatedAt forward and every delete
 * adds or moves a tombstone, so any change shows up here.
 */
export function fingerprint(state: SyncState): string {
  let max = 0;
  let sum = 0;
  for (const s of state.sessions) { max = Math.max(max, s.updatedAt); sum = (sum + s.updatedAt) % 1e15; }
  for (const s of state.solves) { max = Math.max(max, s.updatedAt); sum = (sum + s.updatedAt) % 1e15; }
  let tmax = 0;
  const tomb = Object.values(state.deleted);
  for (const t of tomb) tmax = Math.max(tmax, t);
  return `${state.sessions.length}.${state.solves.length}.${tomb.length}.${max}.${tmax}.${sum}`;
}
