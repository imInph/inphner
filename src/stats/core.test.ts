import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DNF, averageOf, trimmedIndices, bestRolling, effective, meanOf, quantize, rolling, statAt, summarize, trimCount, type Result,
} from './core.ts';
import { formatAverage } from '../timer/format.ts';

const s = (sec: number): number => Math.round(sec * 1000);
const r = (timeMs: number, penalty: Result['penalty'] = 0): Result => ({ timeMs, penalty });

test('trim counts follow ceil(N × 5%)', () => {
  assert.deepEqual([3, 5, 12, 25, 50, 100, 200, 500, 1000].map(trimCount), [0, 1, 1, 2, 3, 5, 10, 25, 50]);
});

test('penalties: +2 adds 2 s, DNF is infinite; singles truncate to 0.01', () => {
  assert.equal(effective(r(12345)), 12340);
  assert.equal(effective(r(12345), 3), 12345);
  assert.equal(effective(r(12340, 2000)), 14340);
  assert.equal(effective(r(12340, 'DNF')), DNF);
  assert.equal(quantize(9999), 9990);
});

test('mo3: plain mean; any DNF → DNF', () => {
  assert.equal(meanOf([s(10), s(11), s(12)]), s(11));
  assert.equal(meanOf([s(10), DNF, s(12)]), DNF);
  assert.equal(statAt([s(10), s(11), s(12)], 3), s(11));
});

test('ao5 with 0, 1 and 2 DNFs', () => {
  // 10 11 12 13 14 → drop 10 and 14 → mean(11,12,13) = 12
  assert.equal(averageOf([s(10), s(11), s(12), s(13), s(14)]), s(12));
  // one DNF is the dropped worst
  assert.equal(averageOf([s(10), DNF, s(12), s(13), s(14)]), s(13));
  // two DNFs → DNF
  assert.equal(averageOf([s(10), DNF, s(12), DNF, s(14)]), DNF);
});

test('ao12 with 0, 1 and 2 DNFs', () => {
  const base = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 30].map(s);
  // drop 8 and 30 → mean(9..18) = 13.5
  assert.equal(averageOf(base), s(13.5));
  const one = [...base];
  one[3] = DNF; // 11 → DNF: drop 8 and the DNF → mean(9,10,12..18,30) = 154 / 10
  assert.equal(averageOf(one), s(15.4));
  const two = [...one];
  two[5] = DNF;
  assert.equal(averageOf(two), DNF);
});

test('ao100 with 5 and 6 DNFs (trim 5)', () => {
  const vals = Array.from({ length: 100 }, (_, i) => s(10 + i / 10));
  for (let i = 0; i < 5; i++) vals[i * 20] = DNF;
  assert.notEqual(averageOf(vals), DNF);
  vals[99] = DNF;
  assert.equal(averageOf(vals), DNF);
  // exact value with no DNFs: 10.0..19.9 → drop 10.0..10.4 and 19.5..19.9 → mean of 10.5..19.4 = 14.95
  const clean = Array.from({ length: 100 }, (_, i) => s(10 + i / 10));
  assert.ok(Math.abs(averageOf(clean) - s(14.95)) < 1e-6);
});

test('averages round half-up to 0.01 for display (WCA 9f2)', () => {
  // 10.00 10.01 10.02 → mean 10.01; ao5 whose mean is x.xx5
  assert.equal(formatAverage(averageOf([s(10), s(10.01), s(10.02), s(10.03), s(20)])), '10.02');
  assert.equal(formatAverage(meanOf([s(10.01), s(10.02)])), '10.02'); // 10.015 → 10.02
  assert.equal(formatAverage(meanOf([s(10.01), s(10.01), s(10.02)])), '10.01'); // 10.01333
});

test('rolling + best rolling with its window', () => {
  const vals = [12, 11, 10, 13, 14, 9, 30, 8].map(s);
  const ao5 = rolling(vals, 5);
  assert.ok(Number.isNaN(ao5[3]!));
  assert.equal(ao5[4], s(12)); // 12 11 10 13 14 → 12
  assert.ok(Math.abs(ao5[5]! - 34000 / 3) < 1e-6); // 11 10 13 14 9 → drop 9 & 14 → mean(10, 11, 13)
  const best = bestRolling(vals, 5)!;
  assert.ok(best.value <= Math.min(...ao5.filter((v) => !Number.isNaN(v))));
  assert.deepEqual([best.end - best.start], [5]);
});

test('summary: mean excludes DNFs unless asked, σ, worst is DNF', () => {
  const sum = summarize([r(10000), r(12000), r(14000, 'DNF'), r(11000, 2000)]);
  assert.equal(sum.count, 4);
  assert.equal(sum.dnfs, 1);
  assert.equal(sum.best, 10000);
  assert.equal(sum.worst, DNF);
  assert.equal(sum.mean, (10000 + 12000 + 13000) / 3);
  assert.ok(Math.abs(sum.sd - Math.sqrt(((10000 - sum.mean) ** 2 + (12000 - sum.mean) ** 2 + (13000 - sum.mean) ** 2) / 3)) < 1e-6);
  assert.equal(sum.totalMs, 10000 + 12000 + 14000 + 13000);
  assert.equal(summarize([r(10000), r(1, 'DNF')], { dnfInMean: true }).mean, DNF);
  assert.ok(Number.isNaN(summarize([]).best));
});

test('trimmedIndices marks the best and worst (DNF counts as worst)', () => {
  assert.deepEqual([...trimmedIndices([s(12), s(10), s(14), DNF, s(11)])].sort(), [1, 3]);
  assert.deepEqual([...trimmedIndices([s(10), s(10), s(12), s(13), s(13)])].sort(), [0, 4]);
  assert.equal(trimmedIndices([s(1), s(2), s(3)]).size, 0);
});
