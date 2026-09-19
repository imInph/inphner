import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrefs, DEFAULT_PREFS, inspectionFor, inspectionDefault } from './prefs.ts';

test('parsePrefs: defaults for null / garbage', () => {
  assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs('nope'), DEFAULT_PREFS);
});

test('parsePrefs: clamps and validates each field', () => {
  const p = parsePrefs(JSON.stringify({
    holdMs: 5000, precision: 4, live: 'tenths', input: 'telepathy', phases: 0,
    inspection: { '333': false, 'bad key!': true, pyram: 'yes' }, volume: 3, strip: [12, 5, 7, 5],
  }));
  assert.equal(p.holdMs, 1000);
  assert.equal(p.precision, 2);
  assert.equal(p.live, 'tenths');
  assert.equal(p.input, 'keyboard');
  assert.equal(p.phases, 1);
  assert.deepEqual(p.inspection, { '333': false });
  assert.equal(p.volume, 1);
  assert.deepEqual(p.strip, [5, 12]);
});

test('inspection: on by default except BLD, FMC and "none"; overrides win', () => {
  assert.equal(inspectionDefault('333'), true);
  assert.equal(inspectionDefault('333bf'), false);
  assert.equal(inspectionDefault('333fm'), false);
  assert.equal(inspectionDefault('333mbf'), false);
  const p = parsePrefs(JSON.stringify({ inspection: { '333': false, '333bf': true } }));
  assert.equal(inspectionFor(p, '333'), false);
  assert.equal(inspectionFor(p, '333bf'), true);
  assert.equal(inspectionFor(p, '222'), true);
});
