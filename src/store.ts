/**
 * inphner: sessions and solves, backed by IndexedDB (db/idb.ts).
 *
 * - Sessions are all loaded at boot (there are few). Solves are loaded per
 *   session on first use and cached in memory, sorted by createdAt.
 * - NEVER LOSE A SOLVE: addSolve() writes to IndexedDB before it resolves, so
 *   the timer shows a result only once it's stored. If the write fails the
 *   solve stays in memory (marked unsaved), a persistent toast says so, and
 *   every later write retries it.
 * - Deletes, moves, merges and session deletes return enough to undo them
 *   while the toast is showing.
 *
 * Emits 'inphner:solves' (detail: { sessionId }) and 'inphner:sessions'.
 */
import { eventDef, isEvent } from './events.ts';
import { clearAll, countByIndex, getAll, getAllByRange, lastByRange, persist, write } from './db/idb.ts';
import { mergeById } from './io/backup.ts';
import type { Session, Solve } from './types.ts';
import { toast } from './ui/toast.ts';

export type { Session, Solve };

const CURRENT_KEY = 'inphner.session';

let sessions: Session[] = [];
let currentId = '';
const cache = new Map<string, Solve[]>();
const unsaved = new Map<string, Solve>();
let dismissUnsaved: (() => void) | null = null;

export function uuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Per-session revision + the last operation, so incremental consumers
 * (stats/live.ts) can tell "one solve appended" from "something else changed"
 * in O(1) instead of diffing the whole session.
 */
export type SolveOp = { rev: number; op: 'append' | 'update-last' | 'pop-last' | 'other' };
const revs = new Map<string, SolveOp>();

export function sessionRev(sessionId: string): SolveOp {
  return revs.get(sessionId) ?? { rev: 0, op: 'other' };
}

function bump(sessionId: string, op: SolveOp['op']): void {
  revs.set(sessionId, { rev: (revs.get(sessionId)?.rev ?? 0) + 1, op });
}

function emitSolves(sessionId: string): void {
  window.dispatchEvent(new CustomEvent('inphner:solves', { detail: { sessionId } }));
}
function emitSessions(): void {
  window.dispatchEvent(new Event('inphner:sessions'));
}

function sortSolves(list: Solve[]): Solve[] {
  return list.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
}

/* -------------------------------------------------------------------- boot */

let ready: Promise<void> | null = null;

/** Load sessions (creating "Main" on first run) and the current session's solves. */
export function initStore(): Promise<void> {
  ready ??= (async () => {
    sessions = await getAll<Session>('sessions');
    if (!sessions.length) {
      let event = '333';
      try {
        const e = localStorage.getItem('inphner.event');
        if (e && isEvent(e)) event = e;
      } catch { /* storage blocked */ }
      await createSession({ name: 'Main', event }, false);
    }
    let saved = '';
    try { saved = localStorage.getItem(CURRENT_KEY) ?? ''; } catch { /* blocked */ }
    const live = orderedSessions();
    currentId = live.find((s) => s.id === saved)?.id ?? live[0]?.id ?? sessions[0]!.id;
    await loadSolves(currentId);
    void persist();
  })();
  return ready;
}

/* ---------------------------------------------------------------- sessions */

export function allSessions(): readonly Session[] {
  return sessions;
}

/** Sessions in their user order (archived ones only when asked). */
export function orderedSessions(includeArchived = false): Session[] {
  return sessions.filter((s) => includeArchived || !s.archived).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export function currentSession(): Session {
  return sessions.find((s) => s.id === currentId) ?? sessions[0]!;
}

export function sessionById(id: string): Session | undefined {
  return sessions.find((s) => s.id === id);
}

export async function setCurrentSession(id: string): Promise<void> {
  if (!sessionById(id) || id === currentId) return;
  await loadSolves(id);
  currentId = id;
  try { localStorage.setItem(CURRENT_KEY, id); } catch { /* blocked */ }
  emitSessions();
  emitSolves(id);
}

export async function createSession(init: { name: string; event: string }, select = true): Promise<Session> {
  const now = Date.now();
  const s: Session = {
    id: uuid(), name: init.name.trim() || 'Session', event: isEvent(init.event) ? init.event : '333',
    createdAt: now, updatedAt: now, order: sessions.reduce((m, x) => Math.max(m, x.order), -1) + 1,
  };
  await write([{ store: 'sessions', put: [s] }]);
  sessions.push(s);
  cache.set(s.id, []);
  if (select) await setCurrentSession(s.id);
  emitSessions();
  return s;
}

export async function updateSession(id: string, patch: Partial<Omit<Session, 'id' | 'createdAt'>>): Promise<void> {
  const s = sessionById(id);
  if (!s) return;
  const next = { ...s, ...patch, updatedAt: Date.now() };
  await write([{ store: 'sessions', put: [next] }]);
  Object.assign(s, next);
  if (patch.archived && id === currentId) {
    const other = orderedSessions().find((x) => x.id !== id);
    if (other) await setCurrentSession(other.id);
  }
  emitSessions();
}

export async function reorderSessions(ids: string[]): Promise<void> {
  const now = Date.now();
  const changed: Session[] = [];
  ids.forEach((id, i) => {
    const s = sessionById(id);
    if (s && s.order !== i) {
      s.order = i;
      s.updatedAt = now;
      changed.push(s);
    }
  });
  if (changed.length) await write([{ store: 'sessions', put: changed }]);
  emitSessions();
}

export interface DeletedSession { session: Session; solves: Solve[] }

/** Delete a session and its solves; returns them for Undo. Never deletes the last session. */
export async function deleteSession(id: string): Promise<DeletedSession | null> {
  const s = sessionById(id);
  if (!s || sessions.length <= 1) return null;
  const solves = [...await loadSolves(id)];
  await write([
    { store: 'solves', del: solves.map((x) => x.id) },
    { store: 'sessions', del: [id] },
  ]);
  sessions = sessions.filter((x) => x.id !== id);
  cache.delete(id);
  if (currentId === id) {
    const next = orderedSessions()[0] ?? sessions[0]!;
    await setCurrentSession(next.id);
  }
  emitSessions();
  return { session: s, solves };
}

export async function restoreSession(d: DeletedSession): Promise<void> {
  await write([{ store: 'sessions', put: [d.session] }, { store: 'solves', put: d.solves }]);
  sessions.push(d.session);
  cache.set(d.session.id, sortSolves([...d.solves]));
  bump(d.session.id, 'other');
  emitSessions();
  emitSolves(d.session.id);
}

/** Move every solve of `fromId` into `intoId`, then remove `fromId`. Returns what Undo needs. */
export async function mergeSessions(fromId: string, intoId: string): Promise<{ from: Session; moved: string[] } | null> {
  const from = sessionById(fromId);
  const into = sessionById(intoId);
  if (!from || !into || fromId === intoId) return null;
  const moved = await moveSolves((await loadSolves(fromId)).map((s) => s.id), intoId);
  await write([{ store: 'sessions', del: [fromId] }]);
  sessions = sessions.filter((x) => x.id !== fromId);
  cache.delete(fromId);
  if (currentId === fromId) await setCurrentSession(intoId);
  emitSessions();
  return { from, moved };
}

export async function unmerge(m: { from: Session; moved: string[] }): Promise<void> {
  await write([{ store: 'sessions', put: [m.from] }]);
  sessions.push(m.from);
  cache.set(m.from.id, []);
  await moveSolves(m.moved, m.from.id);
  emitSessions();
}

/* ------------------------------------------------------------------ solves */

export async function loadSolves(sessionId: string): Promise<Solve[]> {
  const hit = cache.get(sessionId);
  if (hit) return hit;
  const list = await getAllByRange<Solve>('solves', 'sessionTime',
    IDBKeyRange.bound([sessionId, -Infinity], [sessionId, Infinity]));
  const sorted = sortSolves(list);
  cache.set(sessionId, sorted);
  return sorted;
}

/** The current session's solves (loaded at boot and on every switch). */
export function currentSolves(): readonly Solve[] {
  return cache.get(currentId) ?? [];
}

export function solveById(id: string): Solve | undefined {
  for (const list of cache.values()) {
    const s = list.find((x) => x.id === id);
    if (s) return s;
  }
  return undefined;
}

/** Retry every unsaved solve; true when all are stored now. */
async function flushUnsaved(): Promise<boolean> {
  if (!unsaved.size) return true;
  try {
    await write([{ store: 'solves', put: [...unsaved.values()] }]);
    unsaved.clear();
    dismissUnsaved?.();
    dismissUnsaved = null;
    toast('All solves are saved now.', { kind: 'good' });
    return true;
  } catch {
    return false;
  }
}

function reportUnsaved(): void {
  dismissUnsaved?.();
  dismissUnsaved = toast(`${unsaved.size} solve${unsaved.size === 1 ? ' is' : 's are'} not saved yet (storage error). They're kept on this page.`, {
    kind: 'bad',
    persistent: true,
    action: { label: 'Retry', run: () => { void flushUnsaved().then((ok) => { if (!ok) reportUnsaved(); }); } },
  });
}

/**
 * Add a solve to the current session. Resolves once it's in IndexedDB (or,
 * if storage failed, once it's safely kept in memory with an error toast).
 */
export async function addSolve(init: Omit<Solve, 'id' | 'createdAt' | 'updatedAt' | 'sessionId' | 'event'>): Promise<Solve> {
  const now = Date.now();
  const session = currentSession();
  const solve: Solve = { id: uuid(), sessionId: session.id, event: session.event, createdAt: now, updatedAt: now, ...init };
  try {
    await flushUnsaved();
    await write([{ store: 'solves', put: [solve] }]);
  } catch {
    unsaved.set(solve.id, solve);
    reportUnsaved();
  }
  const list = cache.get(session.id) ?? [];
  list.push(solve);
  cache.set(session.id, list);
  bump(session.id, 'append');
  emitSolves(session.id);
  return solve;
}

export async function updateSolve(id: string, patch: Partial<Pick<Solve, 'penalty' | 'comment' | 'timeMs'>>): Promise<Solve | undefined> {
  const s = solveById(id);
  if (!s) return undefined;
  const before = { ...s };
  Object.assign(s, patch, { updatedAt: Date.now() });
  if ('comment' in patch && !patch.comment) delete s.comment;
  try {
    if (unsaved.has(id)) unsaved.set(id, s);
    await write([{ store: 'solves', put: [s] }]);
    unsaved.delete(id);
  } catch {
    if (!unsaved.has(id)) {
      Object.assign(s, before);
      if (!before.comment) delete s.comment;
      toast('Could not save that change (storage error).', { kind: 'bad' });
    }
  }
  const list = cache.get(s.sessionId);
  bump(s.sessionId, list && list[list.length - 1]?.id === s.id ? 'update-last' : 'other');
  emitSolves(s.sessionId);
  return s;
}

/** Solves deleted most recently, for Alt+Z. */
const deleteStack: Solve[][] = [];

export async function deleteSolves(ids: string[]): Promise<Solve[]> {
  const wanted = new Set(ids);
  const removed: Solve[] = [];
  const touched = new Set<string>();
  const ops = new Map<string, SolveOp['op']>();
  for (const [sid, list] of cache) {
    const lastId = list[list.length - 1]?.id;
    let count = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      if (wanted.has(list[i]!.id)) {
        removed.push(list[i]!);
        list.splice(i, 1);
        touched.add(sid);
        count++;
      }
    }
    if (count) ops.set(sid, count === 1 && lastId && wanted.has(lastId) ? 'pop-last' : 'other');
  }
  if (!removed.length) return [];
  try {
    await write([{ store: 'solves', del: removed.map((s) => s.id) }]);
  } catch {
    for (const s of removed) cache.get(s.sessionId)?.push(s);
    touched.forEach((sid) => sortSolves(cache.get(sid)!));
    toast('Could not delete (storage error).', { kind: 'bad' });
    touched.forEach(emitSolves);
    return [];
  }
  removed.forEach((s) => unsaved.delete(s.id));
  ops.forEach((op, sid) => bump(sid, op));
  deleteStack.push(removed);
  if (deleteStack.length > 20) deleteStack.shift();
  touched.forEach(emitSolves);
  return removed;
}

/** Put deleted solves back (a toast's Undo, or Alt+Z for the latest delete). */
export async function restoreSolves(solves?: Solve[]): Promise<Solve[]> {
  let list = solves;
  if (list) {
    const i = deleteStack.indexOf(list);
    if (i >= 0) deleteStack.splice(i, 1);
  } else {
    list = deleteStack.pop();
  }
  if (!list?.length) return [];
  await write([{ store: 'solves', put: list }]);
  const touched = new Set<string>();
  for (const s of list) {
    const target = cache.get(s.sessionId);
    if (target && !target.some((x) => x.id === s.id)) target.push(s);
    touched.add(s.sessionId);
  }
  touched.forEach((sid) => { const c = cache.get(sid); if (c) sortSolves(c); bump(sid, 'other'); emitSolves(sid); });
  return list;
}

/** Move solves to another session (their event changes with it). Returns the moved ids. */
export async function moveSolves(ids: string[], sessionId: string): Promise<string[]> {
  const target = sessionById(sessionId);
  if (!target) return [];
  await loadSolves(sessionId);
  const wanted = new Set(ids);
  const moving: Solve[] = [];
  const touched = new Set<string>([sessionId]);
  for (const [sid, list] of cache) {
    if (sid === sessionId) continue;
    for (let i = list.length - 1; i >= 0; i--) {
      if (wanted.has(list[i]!.id)) {
        moving.push(list[i]!);
        list.splice(i, 1);
        touched.add(sid);
      }
    }
  }
  const now = Date.now();
  for (const s of moving) {
    s.sessionId = sessionId;
    s.event = target.event;
    s.updatedAt = now;
  }
  if (moving.length) await write([{ store: 'solves', put: moving }]);
  cache.get(sessionId)!.push(...moving);
  sortSolves(cache.get(sessionId)!);
  touched.forEach((sid) => { bump(sid, 'other'); emitSolves(sid); });
  return moving.map((s) => s.id);
}

/** Add many solves at once (import): one transaction. */
export async function bulkAdd(solves: Solve[]): Promise<void> {
  await write([{ store: 'solves', put: solves }]);
  const touched = new Set<string>();
  for (const s of solves) {
    const list = cache.get(s.sessionId);
    if (list) list.push(s);
    touched.add(s.sessionId);
  }
  touched.forEach((sid) => { const c = cache.get(sid); if (c) sortSolves(c); bump(sid, 'other'); emitSolves(sid); });
}

/* ---------------------------------------------------------- picker summary */

export interface SessionSummary { session: Session; count: number; last: Solve[] }

/** Count + last 12 solves for every live session (from the cache when loaded, else two cheap IDB reads). */
export async function sessionSummaries(): Promise<SessionSummary[]> {
  return Promise.all(orderedSessions().map(async (session) => {
    const cached = cache.get(session.id);
    if (cached) return { session, count: cached.length, last: cached.slice(-12) };
    const range = IDBKeyRange.bound([session.id, -Infinity], [session.id, Infinity]);
    const [count, last] = await Promise.all([
      countByIndex('solves', 'session', session.id),
      lastByRange<Solve>('solves', 'sessionTime', range, 12),
    ]);
    return { session, count, last: last.reverse() };
  }));
}

export function sessionLabel(s: Session): string {
  return `${eventDef(s.event).short} · ${s.name}`;
}

/* ------------------------------------------------------------ import / export */

export interface NewSessionImport {
  name: string;
  event: string;
  solves: Omit<Solve, 'id' | 'sessionId' | 'event' | 'updatedAt'>[];
}

/** Create sessions with their solves in one transaction; returns the new session ids (for Undo). */
export async function importSessions(list: NewSessionImport[]): Promise<string[]> {
  const now = Date.now();
  let order = sessions.reduce((m, x) => Math.max(m, x.order), -1);
  const newSessions: Session[] = [];
  const newSolves: Solve[] = [];
  for (const item of list) {
    const session: Session = {
      id: uuid(), name: item.name.trim() || 'Imported', event: isEvent(item.event) ? item.event : '333',
      createdAt: now, updatedAt: now, order: ++order,
    };
    newSessions.push(session);
    item.solves.forEach((x, i) => {
      // Keep the original order even when timestamps are missing or equal.
      const createdAt = x.createdAt > 0 ? x.createdAt : now - (item.solves.length - i) * 1000;
      newSolves.push({ ...x, id: uuid(), sessionId: session.id, event: session.event, createdAt, updatedAt: now, source: 'import' });
    });
  }
  await write([{ store: 'sessions', put: newSessions }, { store: 'solves', put: newSolves }]);
  for (const x of newSessions) {
    sessions.push(x);
    cache.set(x.id, sortSolves(newSolves.filter((y) => y.sessionId === x.id)));
    bump(x.id, 'other');
  }
  emitSessions();
  return newSessions.map((x) => x.id);
}

/** Append solves to an existing session (CSV into a session). Returns their ids. */
export async function importIntoSession(sessionId: string, solves: NewSessionImport['solves']): Promise<string[]> {
  const session = sessionById(sessionId);
  if (!session) return [];
  await loadSolves(sessionId);
  const now = Date.now();
  const list: Solve[] = solves.map((x, i) => ({
    ...x, id: uuid(), sessionId, event: session.event, updatedAt: now, source: 'import',
    createdAt: x.createdAt > 0 ? x.createdAt : now - (solves.length - i) * 1000,
  }));
  await bulkAdd(list);
  return list.map((x) => x.id);
}

/** Remove whole sessions (Undo of an import). */
export async function removeSessions(ids: string[]): Promise<void> {
  const solveIds: string[] = [];
  for (const id of ids) (await loadSolves(id)).forEach((x) => solveIds.push(x.id));
  await write([{ store: 'solves', del: solveIds }, { store: 'sessions', del: ids }]);
  sessions = sessions.filter((x) => !ids.includes(x.id));
  ids.forEach((id) => cache.delete(id));
  if (!sessions.length) await createSession({ name: 'Main', event: '333' }, false);
  if (!sessionById(currentId)) await setCurrentSession(orderedSessions()[0]!.id);
  emitSessions();
}

/** Every session with all its solves (for export / backup). */
export async function everything(): Promise<{ sessions: Session[]; solves: Solve[] }> {
  const all = orderedSessions(true);
  const solves: Solve[] = [];
  for (const x of all) solves.push(...await loadSolves(x.id));
  return { sessions: all, solves };
}

/** Merge a backup: records are matched by id, the newer updatedAt wins. */
export async function mergeBackup(b: { sessions: Session[]; solves: Solve[] }): Promise<{ sessions: number; solves: number }> {
  const cur = await everything();
  const ms = mergeById(cur.sessions, b.sessions);
  const mv = mergeById(cur.solves, b.solves);
  await write([{ store: 'sessions', put: ms.put }, { store: 'solves', put: mv.put }]);
  // Reload from the database: simplest way to get every cache consistent.
  sessions = await getAll<Session>('sessions');
  cache.clear();
  for (const x of sessions) bump(x.id, 'other');
  await loadSolves(currentSession().id);
  emitSessions();
  emitSolves(currentSession().id);
  return { sessions: ms.put.length, solves: mv.put.length };
}

/** Erase every session and solve, then start fresh with an empty "Main". */
export async function eraseEverything(): Promise<void> {
  await clearAll();
  sessions = [];
  cache.clear();
  unsaved.clear();
  await createSession({ name: 'Main', event: '333' }, false);
  currentId = sessions[0]!.id;
  try { localStorage.setItem(CURRENT_KEY, currentId); } catch { /* blocked */ }
  bump(currentId, 'other');
  emitSessions();
  emitSolves(currentId);
}
