import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFmc, multiIsDnf, multiPoints, multiRank } from './special.ts';

test('FMC: face and wide turns count 1, rotations 0', () => {
  assert.equal(parseFmc("R U R' U'").moves, 4);
  assert.equal(parseFmc("R U2 Rw' x y2 F2' D").moves, 5);
  assert.equal(parseFmc("x y z").error, undefined);
  assert.equal(parseFmc("x y z").moves, 0);
  assert.equal(parseFmc("R U // premoves\nF").moves, 3);
});

test('FMC: slice moves and junk are rejected', () => {
  assert.match(parseFmc('R M U').error!, /Slice/);
  assert.match(parseFmc('R Q U').error!, /isn't valid/);
  assert.match(parseFmc('r U').error!, /isn't valid/);
  assert.match(parseFmc('').error!, /Write a solution/);
  assert.match(parseFmc(Array(81).fill('R').join(' ')).error!, /at most 80/);
});

test('Multi-BLD scoring (9f12)', () => {
  assert.equal(multiPoints(5, 6), 4);
  assert.equal(multiIsDnf(5, 6), false);
  assert.equal(multiIsDnf(2, 4), false); // 0 points, 2 solved: valid
  assert.equal(multiIsDnf(1, 2), true); // only 1 solved
  assert.equal(multiIsDnf(2, 5), true); // −1 points
  // 5/6 in 50:00 beats 4/4 in 30:00 (4 points each → less time wins… equal points: 5/6 = 4, 4/4 = 4)
  assert.ok(multiRank(4, 4, 30 * 60e3, false) < multiRank(5, 6, 50 * 60e3, false));
  assert.ok(multiRank(6, 6, 59 * 60e3, false) < multiRank(5, 6, 20 * 60e3, false));
  assert.equal(multiRank(1, 2, 1000, false), Infinity);
});
