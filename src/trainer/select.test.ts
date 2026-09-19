import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cycleStatus, emptyStats, newDeck, pickWeighted, recordFail, recordTime, weight } from './select.ts';

test('recordTime keeps count, best, EMA and the last 5', () => {
  let s = emptyStats();
  for (const t of [3000, 2000, 4000, 2500, 2600, 2700]) s = recordTime(s, t, 1000);
  assert.equal(s.count, 6);
  assert.equal(s.best, 2000);
  assert.deepEqual(s.last, [2000, 4000, 2500, 2600, 2700]);
  assert.ok(s.ema > 2000 && s.ema < 4000);
  assert.equal(recordFail(s).fails, 1);
});

test('weights favour unseen, slow, failed and stale cases', () => {
  const now = 10 * 86400000;
  const fresh = { ...emptyStats(), count: 5, ema: 2000, lastSeen: now };
  assert.ok(weight(emptyStats(), 2000, now) > weight(fresh, 2000, now), 'unseen first');
  assert.ok(weight({ ...fresh, ema: 4000 }, 2000, now) > weight(fresh, 2000, now), 'slow');
  assert.ok(weight({ ...fresh, fails: 3 }, 2000, now) > weight(fresh, 2000, now), 'failed');
  assert.ok(weight({ ...fresh, lastSeen: now - 6 * 86400000 }, 2000, now) > weight(fresh, 2000, now), 'stale');
  assert.ok(weight({ ...fresh, status: 'learning' }, 2000, now) > weight({ ...fresh, status: 'learned' }, 2000, now));
});

test('weighted picks follow the weights and never repeat the previous case', () => {
  const stats = (id: string) => (id === 'slow' ? { ...emptyStats(), count: 3, ema: 6000, lastSeen: Date.now() } : { ...emptyStats(), count: 3, ema: 2000, lastSeen: Date.now() });
  const counts: Record<string, number> = { slow: 0, a: 0, b: 0 };
  let seed = 5;
  const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 3000; i++) counts[pickWeighted(['slow', 'a', 'b'], stats, null, rng)]!++;
  assert.ok(counts.slow! > counts.a! && counts.slow! > counts.b!);
  for (let i = 0; i < 200; i++) assert.notEqual(pickWeighted(['x', 'y'], stats, 'x', rng), 'x');
  assert.equal(pickWeighted(['only'], stats, 'only', rng), 'only');
});

test('deck: each case once per round, no immediate repeat across rounds', () => {
  const d = newDeck(['a', 'b', 'c', 'd'], 'a', () => 0);
  assert.deepEqual([...d].sort(), ['a', 'b', 'c', 'd']);
  assert.notEqual(d[0], 'a');
  assert.equal(cycleStatus('new'), 'learning');
  assert.equal(cycleStatus('learning'), 'learned');
  assert.equal(cycleStatus('learned'), 'new');
});
