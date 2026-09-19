import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStats, TRACKED } from './engine.ts';
import { DNF, bestRolling, rolling, summarize } from './core.ts';

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomValues(n: number, seed: number, dnfRate = 0.04): number[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => (r() < dnfRate ? DNF : Math.round(8000 + r() * 9000) * 1));
}

const close = (a: number, b: number) => (Number.isNaN(a) && Number.isNaN(b)) || a === b || Math.abs(a - b) < 1e-6;

test('incremental rolling values match the naive maths for every tracked N', () => {
  const values = randomValues(1300, 7, 0.05);
  const s = new SessionStats(values);
  for (const n of TRACKED) {
    const naive = rolling(values, n);
    const inc = s.rolling(n);
    assert.equal(inc.length, values.length);
    for (let i = 0; i < values.length; i++) assert.ok(close(inc[i]!, naive[i]!), `ao${n} at ${i}: ${inc[i]} vs ${naive[i]}`);
    const b = bestRolling(values, n);
    const eb = s.best(n);
    if (!b) assert.equal(eb, null);
    else assert.ok(close(eb!.value, b.value) && eb!.end - eb!.start === n, `best ao${n}`);
  }
});

test('heavy DNF sessions: averages go DNF exactly when the naive maths says so', () => {
  const values = randomValues(400, 3, 0.3);
  const s = new SessionStats(values);
  for (const n of [5, 12, 50, 100]) {
    const naive = rolling(values, n);
    s.rolling(n).forEach((v, i) => assert.ok(close(v, naive[i]!), `ao${n} at ${i}`));
  }
});

test('popLast and setLast leave the same state as a rebuild', () => {
  const values = randomValues(300, 11);
  const s = new SessionStats(values);
  s.popLast();
  const ref = new SessionStats(values.slice(0, -1));
  for (const n of TRACKED) {
    assert.deepEqual(s.rolling(n).map(String), ref.rolling(n).map(String));
    assert.deepEqual(s.best(n), ref.best(n));
  }
  assert.deepEqual(s.bestSingle, ref.bestSingle);
  s.push(values[values.length - 1]!);
  s.setLast(DNF);
  const ref2 = new SessionStats([...values.slice(0, -1), DNF]);
  for (const n of TRACKED) assert.deepEqual(s.rolling(n).map(String), ref2.rolling(n).map(String));
});

test('PB events: single and ao5, with the previous best', () => {
  const s = new SessionStats([10000, 11000, 12000, 13000, 14000]); // ao5 = 12.00
  let pbs = s.push(9000); // window 11 12 13 14 9 → ao5 12.00: equal, not a PB
  assert.deepEqual(pbs, [{ n: 1, value: 9000, previous: 10000 }]);
  pbs = s.push(8000); // 12 13 14 9 8 → drop 8, 14 → 11.33
  assert.deepEqual(pbs.map((p) => p.n), [1, 5]);
  assert.equal(pbs[1]!.previous, 12000);
  pbs = s.push(20000);
  assert.deepEqual(pbs, []);
  assert.ok(s.pbIndices.has(5) && s.pbIndices.has(6));
  assert.ok(!s.pbIndices.has(7));
});

test('performance: 50 000 solves build once; a new solve updates every stat in < 16 ms', () => {
  const values = randomValues(50000, 99);
  const t0 = performance.now();
  const s = new SessionStats(values);
  const build = performance.now() - t0;
  const times: number[] = [];
  for (let i = 0; i < 50; i++) {
    const t = performance.now();
    s.push(10000 + i);
    times.push(performance.now() - t);
  }
  const worst = Math.max(...times);
  assert.ok(worst < 16, `push took ${worst.toFixed(2)} ms`);
  assert.ok(build < 5000, `build took ${build.toFixed(0)} ms`);
  console.log(`  50k build ${build.toFixed(0)} ms, push worst ${worst.toFixed(3)} ms`);
});

test('running totals match summarize(): mean, σ, DNF count, after pops too', () => {
  // Whole hundredths, like real (already truncated) results.
  const values = randomValues(500, 5, 0.1).map((v) => (v === DNF ? DNF : Math.floor(v / 10) * 10));
  const s = new SessionStats(values);
  const results = values.map((v) => (v === DNF ? { timeMs: 1, penalty: 'DNF' as const } : { timeMs: v, penalty: 0 as const }));
  const sum = summarize(results);
  assert.ok(close(s.mean(), sum.mean));
  assert.ok(Math.abs(s.sd() - sum.sd) < 1e-6);
  assert.equal(s.dnfs, sum.dnfs);
  s.popLast();
  const sum2 = summarize(results.slice(0, -1));
  assert.ok(close(s.mean(), sum2.mean));
  assert.equal(s.mean(true), sum2.dnfs ? DNF : sum2.mean);
});
