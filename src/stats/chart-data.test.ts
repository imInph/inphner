import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketWidth, byHourAndWeekday, downsample, heatmap, histogram, localDay, pbSteps, phaseAverages, phaseDurations } from './chart-data.ts';
import { DNF } from './core.ts';

test('bucket width: 0.5 s for a typical 3x3 spread, nice numbers otherwise', () => {
  const threeByThree = Array.from({ length: 500 }, (_, i) => 10000 + (i % 100) * 80); // 10–18 s
  assert.equal(bucketWidth(threeByThree), 500);
  const fast = Array.from({ length: 200 }, (_, i) => 2000 + (i % 50) * 30); // 2–3.5 s
  assert.equal(bucketWidth(fast), 100);
  assert.equal(bucketWidth([DNF, DNF]), 1000);
});

test('histogram counts every non-DNF result once', () => {
  const v = [10000, 10100, 10600, 11200, DNF, 12000];
  const h = histogram(v, 500);
  assert.equal(h.start, 10000);
  assert.equal(h.counts.reduce((a, b) => a + b, 0), 5);
  assert.equal(h.counts[0], 2);
});

test('heatmap uses local days and starts on a Monday', () => {
  const today = new Date(2026, 8, 19, 20, 0).getTime(); // Sat 19 Sep 2026, local
  const at = (d: number, h: number) => new Date(2026, 8, d, h, 30).getTime();
  const days = heatmap([at(19, 23), at(19, 1), at(18, 12)], today, 2);
  assert.equal(new Date(days[0]!.day + 'T12:00').getDay(), 1, 'first column starts on Monday');
  const sat = days.find((d) => d.day === '2026-09-19')!;
  assert.equal(sat.count, 2);
  assert.equal(sat.level, 3);
  assert.equal(days.find((d) => d.day === '2026-09-18')!.level, 2);
  assert.equal(days[days.length - 1]!.day, '2026-09-19');
  assert.equal(localDay(new Date(2026, 0, 1, 0, 5).getTime()), '2026-01-01');
});

test('hour and weekday averages skip DNFs', () => {
  const mon9 = new Date(2026, 8, 14, 9).getTime();
  const r = byHourAndWeekday([{ value: 10000, createdAt: mon9 }, { value: 12000, createdAt: mon9 }, { value: DNF, createdAt: mon9 }]);
  assert.equal(r.hour.average[9], 11000);
  assert.equal(r.hour.count[9], 2);
  assert.equal(r.weekday.average[0], 11000);
  assert.ok(Number.isNaN(r.hour.average[10]!));
});

test('PB steps and phase splits', () => {
  assert.deepEqual(pbSteps([NaN, 12, 13, 11, DNF, 11, 10]), [{ index: 1, value: 12 }, { index: 3, value: 11 }, { index: 6, value: 10 }]);
  const d = phaseDurations([[2000, 7000, 9000], undefined, [1000, 6000]], 3);
  assert.deepEqual(d, [[2000, 5000, 2000]]);
  assert.deepEqual(phaseAverages([[2000, 5000], [4000, 3000]]), [3000, 4000]);
});

test('downsample keeps extremes and caps the count', () => {
  const pts = Array.from({ length: 10000 }, (_, i) => ({ x: i, y: i === 5000 ? 99999 : i % 7 }));
  const out = downsample(pts, 400);
  assert.ok(out.length <= 402);
  assert.ok(out.some((p) => p.y === 99999));
  for (let i = 1; i < out.length; i++) assert.ok(out[i]!.x >= out[i - 1]!.x);
});
