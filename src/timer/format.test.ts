import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatSingle, formatAverage, formatResult, formatLive, parseTypedTime, effectiveMs } from './format.ts';

test('singles are truncated (WCA 9f1), never rounded', () => {
  assert.equal(formatSingle(12349), '12.34');
  assert.equal(formatSingle(12340), '12.34');
  assert.equal(formatSingle(12999), '12.99');
  assert.equal(formatSingle(9), '0.00');
  assert.equal(formatSingle(12349, 3), '12.349');
});

test('averages are rounded half-up (WCA 9f2)', () => {
  assert.equal(formatAverage(12345), '12.35');
  assert.equal(formatAverage(12344.9), '12.34');
  assert.equal(formatAverage(12346.667), '12.35');
  assert.equal(formatAverage(12333.333), '12.33');
  assert.equal(formatAverage(12994.5), '12.99');
  assert.equal(formatAverage(12995), '13.00');
  assert.equal(formatAverage(59995), '1:00.00');
});

test('minutes and hours', () => {
  assert.equal(formatSingle(62340), '1:02.34');
  assert.equal(formatSingle(600000), '10:00.00');
  assert.equal(formatSingle(3723450), '1:02:03.45');
  assert.equal(formatSingle(59999), '59.99');
});

test('formatResult applies the penalty, csTimer style', () => {
  assert.equal(formatResult(12340, 0), '12.34');
  assert.equal(formatResult(12340, 2000), '14.34+');
  assert.equal(formatResult(12340, 'DNF'), 'DNF');
  assert.equal(effectiveMs(12340, 2000), 14340);
  assert.equal(effectiveMs(12340, 'DNF'), Infinity);
});

test('formatLive modes', () => {
  assert.equal(formatLive(12345, 'full', 2), '12.34');
  assert.equal(formatLive(12399, 'tenths', 2), '12.3');
  assert.equal(formatLive(62399, 'tenths', 2), '1:02.3');
  assert.equal(formatLive(12999, 'seconds', 2), '12');
  assert.equal(formatLive(62999, 'seconds', 2), '1:02');
});

test('typing mode: digits only (…MMSScc)', () => {
  assert.deepEqual(parseTypedTime('1234'), { timeMs: 12340, penalty: 0 });
  assert.deepEqual(parseTypedTime('12345'), { timeMs: 83450, penalty: 0 });
  assert.deepEqual(parseTypedTime('5'), { timeMs: 50, penalty: 0 });
  assert.deepEqual(parseTypedTime('10203'), { timeMs: 62030, penalty: 0 });
  assert.equal(parseTypedTime('0'), null);
  assert.equal(parseTypedTime('17000'), null); // 1:70.00 is not a time
});

test('typing mode: clock notation', () => {
  assert.deepEqual(parseTypedTime('12.34'), { timeMs: 12340, penalty: 0 });
  assert.deepEqual(parseTypedTime('12.3'), { timeMs: 12300, penalty: 0 });
  assert.deepEqual(parseTypedTime('12.345'), { timeMs: 12345, penalty: 0 });
  assert.deepEqual(parseTypedTime('1:02.34'), { timeMs: 62340, penalty: 0 });
  assert.deepEqual(parseTypedTime('1:02:03.45'), { timeMs: 3723450, penalty: 0 });
  assert.deepEqual(parseTypedTime(' 12.34 '), { timeMs: 12340, penalty: 0 });
  assert.equal(parseTypedTime('1:75.00'), null);
  assert.equal(parseTypedTime('12.3456'), null);
  assert.equal(parseTypedTime('abc'), null);
  assert.equal(parseTypedTime(''), null);
  assert.equal(parseTypedTime('0.00'), null);
});

test('typing mode: penalties', () => {
  assert.deepEqual(parseTypedTime('12.34+'), { timeMs: 12340, penalty: 2000 });
  assert.deepEqual(parseTypedTime('12.34+2'), { timeMs: 12340, penalty: 2000 });
  assert.deepEqual(parseTypedTime('1234+'), { timeMs: 12340, penalty: 2000 });
  assert.deepEqual(parseTypedTime('DNF'), { timeMs: 0, penalty: 'DNF' });
  assert.deepEqual(parseTypedTime('dnf'), { timeMs: 0, penalty: 'DNF' });
  assert.deepEqual(parseTypedTime('DNF(12.34)'), { timeMs: 12340, penalty: 'DNF' });
  assert.equal(parseTypedTime('DNF12'), null);
});
