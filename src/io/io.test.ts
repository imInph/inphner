import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCsTimer, eventForCsTimer, parseCsTimer } from './cstimer.ts';
import { buildCsv, csvRows, detectDelimiter, parseCsv } from './csv.ts';
import { buildBackup, mergeById, parseBackup } from './backup.ts';

const CSTIMER = JSON.stringify({
  session1: [
    [[0, 12340], "R U R' U'", '', 1758290000],
    [[2000, 11000], 'F2 D', 'lockup', 1758290060],
    [[-1, 9870], 'B L', '', 1758290120],
    [[0, 10000, 7000, 3000], 'U', '', 1758290180],
    'garbage',
  ],
  session2: [[[0, 25000], 'Rw U', '', 1758290200]],
  session3: [],
  properties: {
    sessionData: JSON.stringify({
      1: { name: 'Main', opt: {}, rank: 1 },
      2: { name: '4x4', opt: { scrType: '444wca' }, rank: 2 },
      3: { name: 'OH practice', opt: {}, rank: 3 },
    }),
  },
});

test('csTimer: sessions, names, events, penalties, splits, timestamps', () => {
  const r = parseCsTimer(CSTIMER);
  assert.equal(r.sessions.length, 3);
  assert.equal(r.skipped, 1);
  const [main, four, oh] = r.sessions;
  assert.deepEqual([main!.name, main!.event], ['Main', '333']);
  assert.deepEqual([four!.name, four!.event], ['4x4', '444']);
  assert.deepEqual([oh!.name, oh!.event], ['OH practice', '333oh']);
  assert.equal(main!.solves.length, 4);
  assert.deepEqual(main!.solves[0], { timeMs: 12340, penalty: 0, scramble: "R U R' U'", comment: '', createdAt: 1758290000000 });
  assert.equal(main!.solves[1]!.penalty, 2000);
  assert.equal(main!.solves[1]!.timeMs, 11000, 'raw time, penalty not applied');
  assert.equal(main!.solves[1]!.comment, 'lockup');
  assert.equal(main!.solves[2]!.penalty, 'DNF');
  assert.deepEqual(main!.solves[3]!.splits, [3000, 7000, 10000]);
});

test('csTimer: sessionData as an object, missing metadata, bad files', () => {
  const r = parseCsTimer(JSON.stringify({ session1: [[[0, 5000], 'U', '', 1]], properties: { sessionData: { 1: { name: 'Pyra', opt: { scrType: 'pyrso' } } } } }));
  assert.equal(r.sessions[0]!.event, 'pyram');
  const bare = parseCsTimer(JSON.stringify({ session7: [[[0, 5000], 'U', '', 1]] }));
  assert.equal(bare.sessions[0]!.name, 'Session 7');
  assert.throws(() => parseCsTimer('not json'), /valid JSON/);
  assert.throws(() => parseCsTimer('{"foo":1}'), /No sessions/);
});

test('csTimer event mapping falls back to the session name', () => {
  assert.equal(eventForCsTimer('333ni', 'x'), '333bf');
  assert.equal(eventForCsTimer(undefined, '3x3 BLD'), '333bf');
  assert.equal(eventForCsTimer(undefined, '5x5 practice'), '555');
  assert.equal(eventForCsTimer(undefined, 'Megaminx'), 'minx');
  assert.equal(eventForCsTimer('unknownType', 'whatever'), '333');
});

test('csTimer export round-trips through the importer', () => {
  const text = buildCsTimer([
    { name: 'Main', event: '333', solves: [{ timeMs: 12340, penalty: 2000, scramble: 'R U', comment: 'x', createdAt: 1758290000000, splits: [3000, 7000, 12340] }] },
    { name: 'Clock', event: 'clock', solves: [{ timeMs: 8000, penalty: 'DNF', scramble: 'UR5+', createdAt: 1758290001000 }] },
  ]);
  const back = parseCsTimer(text);
  assert.equal(back.sessions[0]!.solves[0]!.penalty, 2000);
  assert.deepEqual(back.sessions[0]!.solves[0]!.splits, [3000, 7000, 12340]);
  assert.equal(back.sessions[1]!.event, 'clock');
  assert.equal(back.sessions[1]!.solves[0]!.penalty, 'DNF');
});

test('CSV: delimiter detection and quoted cells', () => {
  assert.equal(detectDelimiter('a;b;c\n1;2;3'), ';');
  assert.equal(detectDelimiter('a,b\n1,2'), ',');
  assert.deepEqual(csvRows('a,"b,c","d ""q"""\n1,2,3', ','), [['a', 'b,c', 'd "q"'], ['1', '2', '3']]);
});

test('CSV: csTimer\'s own CSV export', () => {
  const r = parseCsv('No.;Time;Comment;Scramble;Date;P.1\n1;12.34;;R U;2026-09-19 14:03:22;12.34\n2;DNF(11.00);oops;F2;2026-09-19 14:04:00;11.00\n3;13.02+;;D;2026-09-19 14:05:00;13.02\n');
  assert.equal(r.solves.length, 3);
  assert.deepEqual(r.solves[0], { timeMs: 12340, penalty: 0, scramble: 'R U', comment: '', createdAt: new Date(2026, 8, 19, 14, 3, 22).getTime() });
  assert.equal(r.solves[1]!.penalty, 'DNF');
  assert.equal(r.solves[1]!.comment, 'oops');
  assert.equal(r.solves[2]!.penalty, 2000);
  assert.equal(r.solves[2]!.timeMs, 11020, '"13.02+" is the displayed total: raw 11.02');
});

test('CSV: headerless and our own export round-trip', () => {
  const r = parseCsv('12.34\n1:02.50,R U\nnope\n');
  assert.equal(r.solves.length, 2);
  assert.equal(r.skipped, 1);
  assert.equal(r.solves[1]!.timeMs, 62500);
  const ours = buildCsv([{ session: 'Main', event: '333', timeMs: 12340, penalty: 2000, scramble: "R U, R'", createdAt: new Date(2026, 8, 19, 9, 5).getTime() }]);
  const back = parseCsv(ours);
  assert.equal(back.solves[0]!.timeMs, 12340);
  assert.equal(back.solves[0]!.penalty, 2000);
  assert.equal(back.solves[0]!.scramble, "R U, R'");
  assert.equal(back.solves[0]!.createdAt, new Date(2026, 8, 19, 9, 5).getTime());
});

test('backup: build, validate, merge by id + updatedAt', () => {
  const session = { id: 's1', name: 'Main', event: '333', createdAt: 1, updatedAt: 1, order: 0 };
  const solve = { id: 'a', sessionId: 's1', timeMs: 10000, penalty: 0 as const, scramble: 'R', event: '333', createdAt: 2, updatedAt: 2 };
  const text = buildBackup([session], [solve, { ...solve, id: 'bad', sessionId: 'nope' }]);
  const b = parseBackup(text)!;
  assert.equal(b.sessions.length, 1);
  assert.equal(b.solves.length, 1);
  assert.equal(b.dropped, 1);
  assert.equal(parseBackup('{"format":"other"}'), null);
  const m = mergeById([{ id: 'a', updatedAt: 5 }, { id: 'b', updatedAt: 5 }], [{ id: 'a', updatedAt: 9 }, { id: 'b', updatedAt: 3 }, { id: 'c', updatedAt: 1 }]);
  assert.deepEqual(m.put.map((x) => x.id), ['a', 'c']);
  assert.equal(m.added, 1);
  assert.equal(m.updated, 1);
});
