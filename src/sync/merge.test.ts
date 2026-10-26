import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSyncDoc, fingerprint, mergeStates, parseSyncDoc, RECOVERED_PREFIX, type SyncState } from './merge.ts';
import type { Session, Solve } from '../types.ts';

const ses = (id: string, t = 1, extra: Partial<Session> = {}): Session =>
  ({ id, name: id, event: '333', createdAt: 1, updatedAt: t, order: 0, ...extra });
const sol = (id: string, sessionId: string, t = 1, extra: Partial<Solve> = {}): Solve =>
  ({ id, sessionId, timeMs: 10000, penalty: 0, scramble: 'R U', event: '333', createdAt: t, updatedAt: t, ...extra });
const st = (sessions: Session[], solves: Solve[], deleted: Record<string, number> = {}): SyncState => ({ sessions, solves, deleted });

/** A state in a form that ignores array order. */
const norm = (s: SyncState) => ({
  sessions: [...s.sessions].sort((a, b) => (a.id < b.id ? -1 : 1)),
  solves: [...s.solves].sort((a, b) => (a.id < b.id ? -1 : 1)),
  deleted: Object.fromEntries(Object.entries(s.deleted).sort()),
});

test('sync: two devices adding solves both keep everything', () => {
  const a = st([ses('m')], [sol('a1', 'm'), sol('a2', 'm')]);
  const b = st([ses('m')], [sol('b1', 'm')]);
  const r = mergeStates(a, [b]);
  assert.deepEqual(r.state.solves.map((s) => s.id).sort(), ['a1', 'a2', 'b1']);
  assert.deepEqual(r.putSolves.map((s) => s.id), ['b1']);
  assert.ok(r.changed);
});

test('sync: the newer edit wins either way round', () => {
  const a = st([ses('m')], [sol('x', 'm', 5, { penalty: 2000 })]);
  const b = st([ses('m')], [sol('x', 'm', 9, { penalty: 'DNF' })]);
  assert.equal(mergeStates(a, [b]).state.solves[0]!.penalty, 'DNF');
  assert.equal(mergeStates(b, [a]).state.solves[0]!.penalty, 'DNF');
});

test('sync: a delete is not undone by an older copy elsewhere', () => {
  const a = st([ses('m')], [], { x: 10 });
  const b = st([ses('m')], [sol('x', 'm', 5)]);
  const r = mergeStates(a, [b]);
  assert.equal(r.state.solves.length, 0);
  const back = mergeStates(b, [a]);
  assert.deepEqual(back.delSolves, ['x']);
});

test('sync: a restore (fresh updatedAt) outlives its tombstone', () => {
  const restored = st([ses('m')], [sol('x', 'm', 20)]);
  const stale = st([ses('m')], [], { x: 10 });
  assert.equal(mergeStates(stale, [restored]).state.solves.length, 1);
  assert.equal(mergeStates(restored, [stale]).state.solves.length, 1);
});

test('sync: a solve added to a session deleted elsewhere goes to Recovered', () => {
  const a = st([ses('m'), ses('k')], [sol('k1', 'k', 3)], { gone: 10 });
  const b = st([ses('m'), ses('gone')], [sol('late', 'gone', 30)]);
  const r1 = mergeStates(a, [b]);
  const r2 = mergeStates(b, [a]);
  const rec = r1.state.sessions.find((s) => s.id === RECOVERED_PREFIX + 'gone');
  assert.ok(rec);
  assert.equal(rec.name, 'Recovered');
  assert.equal(r1.state.solves.find((s) => s.id === 'late')!.sessionId, rec.id);
  // Both devices recover into the same session.
  assert.deepEqual(norm(r1.state), norm(r2.state));
});

test('sync: merging is order-independent and idempotent', () => {
  const a = st([ses('m', 2), ses('a', 4)], [sol('1', 'm', 1), sol('2', 'a', 6)], { old: 3 });
  const b = st([ses('m', 7, { name: 'Main!' })], [sol('1', 'm', 8, { comment: 'pop' }), sol('3', 'm', 2)], { '2': 5 });
  const c = st([ses('m', 1)], [sol('4', 'm', 9)], { '3': 1 });
  const abc = mergeStates(a, [b, c]).state;
  const cba = mergeStates(c, [b, a]).state;
  const bac = mergeStates(b, [a, c]).state;
  assert.deepEqual(norm(abc), norm(cba));
  assert.deepEqual(norm(abc), norm(bac));
  const again = mergeStates(abc, [a, b, c]);
  assert.equal(again.changed, false);
  assert.equal(again.putSolves.length + again.putSessions.length + again.delSolves.length, 0);
});

test('sync: equal timestamps still converge', () => {
  const a = st([ses('m')], [sol('x', 'm', 5, { comment: 'a' })]);
  const b = st([ses('m')], [sol('x', 'm', 5, { comment: 'b' })]);
  assert.deepEqual(mergeStates(a, [b]).state.solves, mergeStates(b, [a]).state.solves);
});

test("sync: a new browser's empty Main doesn't pile up", () => {
  const fresh = st([ses('newmain', 100)], []);
  const remote = st([ses('m')], [sol('1', 'm')]);
  const r = mergeStates(fresh, [remote], true);
  assert.deepEqual(r.state.sessions.map((s) => s.id), ['m']);
  assert.deepEqual(r.delSessions, ['newmain']);
  assert.ok('newmain' in r.state.deleted);
  // Not on later syncs, and not when it holds solves.
  assert.equal(mergeStates(fresh, [remote]).state.sessions.length, 2);
  assert.equal(mergeStates(st([ses('n')], [sol('9', 'n')]), [remote], true).state.sessions.length, 2);
});

test('sync: files round-trip and bad ones are refused', () => {
  const s = st([ses('m')], [sol('1', 'm')], { z: 4 });
  const doc = parseSyncDoc(JSON.stringify(buildSyncDoc(s, 'dev', 7)));
  assert.ok(doc);
  assert.deepEqual(norm(doc), norm(s));
  assert.equal(doc.deviceId, 'dev');
  assert.equal(parseSyncDoc('{oops'), null);
  assert.equal(parseSyncDoc(JSON.stringify({ ...buildSyncDoc(s, 'd'), version: 99 })), null);
  assert.equal(parseSyncDoc(JSON.stringify({ format: 'inphner', sessions: [], solves: [] })), null);
  const bad = parseSyncDoc(JSON.stringify(buildSyncDoc(st([ses('m')], [sol('1', 'm'), { id: 'x' } as Solve]), 'd')));
  assert.equal(bad!.solves.length, 1);
});

test('sync: the fingerprint moves on every kind of change', () => {
  const base = st([ses('m')], [sol('1', 'm', 5)]);
  const f = fingerprint(base);
  assert.equal(fingerprint(st([ses('m')], [sol('1', 'm', 5)])), f);
  assert.notEqual(fingerprint(st([ses('m')], [sol('1', 'm', 6)])), f);
  assert.notEqual(fingerprint(st([ses('m')], [sol('1', 'm', 5), sol('2', 'm', 1)])), f);
  assert.notEqual(fingerprint(st([ses('m')], [sol('1', 'm', 5)], { q: 1 })), f);
});
