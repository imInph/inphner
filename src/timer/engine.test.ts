import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimerEngine, inspectionPenalty, type TimerConfig, type SolveResult, type Scheduler } from './engine.ts';

/** A fake clock + scheduler: advance(ms) fires due callbacks in order. */
function harness(cfg: Partial<TimerConfig> = {}) {
  let now = 0;
  let nextId = 1;
  const jobs = new Map<number, { at: number; fn: () => void }>();
  const scheduler: Scheduler = {
    set(fn, ms) { const id = nextId++; jobs.set(id, { at: now + ms, fn }); return id; },
    clear(id) { jobs.delete(id); },
  };
  const results: SolveResult[] = [];
  const alerts: number[] = [];
  const config: TimerConfig = { holdMs: 300, inspection: false, phases: 1, ...cfg };
  const engine = new TimerEngine(() => config, scheduler, {
    stop: (r) => results.push(r),
    alert: (s) => alerts.push(s),
  });
  const advance = (ms: number) => {
    const target = now + ms;
    for (;;) {
      const due = [...jobs.entries()].filter(([, j]) => j.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      jobs.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = target;
  };
  return { engine, results, alerts, config, advance, get now() { return now; } };
}

test('hold past the threshold turns ready; release starts; any press stops', () => {
  const h = harness();
  h.engine.press(h.now);
  assert.equal(h.engine.hold, 'armed');
  h.advance(299);
  assert.equal(h.engine.hold, 'armed');
  h.advance(1);
  assert.equal(h.engine.hold, 'ready');
  h.engine.release(h.now);
  assert.equal(h.engine.phase, 'running');
  h.advance(12345);
  h.engine.press(h.now);
  assert.equal(h.engine.phase, 'idle');
  assert.deepEqual(h.results, [{ timeMs: 12345, penalty: 0 }]);
});

test('releasing while amber cancels', () => {
  const h = harness();
  h.engine.press(h.now);
  h.advance(150);
  h.engine.release(h.now);
  assert.equal(h.engine.phase, 'idle');
  assert.equal(h.engine.hold, 'none');
  h.advance(1000);
  assert.equal(h.engine.hold, 'none', 'the hold timer was cleared');
});

test('threshold 0 is ready immediately', () => {
  const h = harness({ holdMs: 0 });
  h.engine.press(h.now);
  assert.equal(h.engine.hold, 'ready');
});

test('the stopping press must be released before anything arms again', () => {
  const h = harness();
  h.engine.press(0); h.advance(300); h.engine.release(h.now);
  h.advance(5000);
  h.engine.press(h.now); // stop (space down)
  h.engine.press(h.now + 50); // key repeat / second touch: ignored
  assert.equal(h.engine.hold, 'none');
  h.engine.release(h.now + 400); // the stopping key comes up: consumed
  assert.equal(h.engine.phase, 'idle');
  assert.equal(h.engine.hold, 'none');
  assert.equal(h.results.length, 1);
  h.engine.press(h.now + 500);
  assert.equal(h.engine.hold, 'armed', 'a fresh press arms again');
});

test('inspection: a tap starts it, then a normal hold starts the solve', () => {
  const h = harness({ inspection: true });
  h.engine.press(0);
  assert.equal(h.engine.hold, 'tap');
  assert.equal(h.engine.phase, 'idle');
  h.engine.release(10);
  assert.equal(h.engine.phase, 'inspecting');
  h.advance(5000);
  h.engine.press(h.now);
  assert.equal(h.engine.hold, 'armed');
  h.advance(300);
  h.engine.release(h.now);
  assert.equal(h.engine.phase, 'running');
  h.advance(10000);
  h.engine.press(h.now);
  assert.equal(h.results[0]!.penalty, 0);
  assert.equal(h.results[0]!.timeMs, 10000);
  assert.equal(h.results[0]!.inspectionMs, 5290); // tap released at 10 ms, solve started at 5300 ms
});

test('inspection: releasing amber keeps inspecting', () => {
  const h = harness({ inspection: true });
  h.engine.press(0); h.engine.release(0);
  h.advance(1000); h.engine.press(h.now); h.advance(100); h.engine.release(h.now);
  assert.equal(h.engine.phase, 'inspecting');
});

test('inspection penalties: +2 between 15 and 17 s, DNF past 17 s', () => {
  assert.equal(inspectionPenalty(14999), 0);
  assert.equal(inspectionPenalty(15000), 0);
  assert.equal(inspectionPenalty(15001), 2000);
  assert.equal(inspectionPenalty(17000), 2000);
  assert.equal(inspectionPenalty(17001), 'DNF');

  for (const [startAt, expected] of [[16000, 2000], [17500, 'DNF']] as const) {
    const h = harness({ inspection: true });
    h.engine.press(0); h.engine.release(0);
    h.advance(startAt - 300);
    h.engine.press(h.now); h.advance(300); h.engine.release(h.now);
    h.advance(9000);
    h.engine.press(h.now);
    assert.equal(h.results[0]!.penalty, expected);
  }
});

test('inspection alerts fire at 8 and 12 s, and stop once the solve starts', () => {
  const h = harness({ inspection: true });
  h.engine.press(0); h.engine.release(0);
  h.advance(8000);
  assert.deepEqual(h.alerts, [8]);
  h.engine.press(h.now); h.advance(300); h.engine.release(h.now);
  h.advance(10000);
  assert.deepEqual(h.alerts, [8], 'no 12 s alert after the start');
});

test('Esc cancels an inspection but never a running solve', () => {
  const h = harness({ inspection: true });
  h.engine.press(0); h.engine.release(0);
  h.engine.cancel();
  assert.equal(h.engine.phase, 'idle');
  h.advance(20000);
  assert.deepEqual(h.alerts, []);

  const r = harness();
  r.engine.press(0); r.advance(300); r.engine.release(r.now);
  r.engine.cancel();
  assert.equal(r.engine.phase, 'running');
});

test('multi-phase: each press records a split, the last one stops', () => {
  const h = harness({ phases: 3 });
  h.engine.press(0); h.advance(300); h.engine.release(h.now);
  h.advance(2000); h.engine.press(h.now); h.engine.release(h.now);
  assert.equal(h.engine.phase, 'running');
  h.advance(3000); h.engine.press(h.now); h.engine.release(h.now);
  h.advance(4000); h.engine.press(h.now);
  assert.deepEqual(h.results, [{ timeMs: 9000, penalty: 0, splits: [2000, 5000, 9000] }]);
});

test('busy while armed, inspecting or running; not when idle', () => {
  const h = harness({ inspection: true });
  assert.equal(h.engine.busy, false);
  h.engine.press(0);
  assert.equal(h.engine.busy, true);
  h.engine.release(0);
  assert.equal(h.engine.busy, true);
  h.engine.cancel();
  assert.equal(h.engine.busy, false);
});
