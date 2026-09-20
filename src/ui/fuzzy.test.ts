import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fuzzyFields, fuzzyMatch, rank } from './fuzzy.ts';

const score = (q: string, t: string) => fuzzyMatch(q, t)?.score ?? -Infinity;

test('an empty query matches everything, with nothing highlighted', () => {
  const m = fuzzyMatch('  ', 'Go to Timer');
  assert.deepEqual(m, { score: 0, indices: [] });
});

test('characters must appear in order', () => {
  assert.equal(fuzzyMatch('xyz', 'Timer'), null);
  assert.equal(fuzzyMatch('remit', 'Timer'), null);
  assert.ok(fuzzyMatch('tmr', 'Timer'));
});

test('matching is case-insensitive and reports the matched positions', () => {
  assert.deepEqual(fuzzyMatch('TIM', 'Timer')!.indices, [0, 1, 2]);
});

test('initials land on word starts', () => {
  assert.deepEqual(fuzzyMatch('gtt', 'Go to Timer')!.indices, [0, 3, 6]);
});

test('a prefix beats a scattered match', () => {
  assert.ok(score('ses', 'Sessions') > score('ses', 'Use this'));
});

test('consecutive characters beat gaps', () => {
  assert.ok(score('abc', 'abcdef') > score('abc', 'a-b-c-d-e-f'));
});

test('a run of characters beats the initials of scattered words', () => {
  assert.ok(score('stat', 'Go to Stats') > score('stat', 'Switch to PLL attack'));
  assert.ok(score('sess', 'Sessions') > score('sess', 'Switch to the session sheet'));
});

test('spaces split the query into terms that may match in any order', () => {
  assert.ok(fuzzyMatch('go timer', 'Go to Timer'));
  assert.ok(fuzzyMatch('timer go', 'Go to Timer'));
  assert.equal(fuzzyMatch('go trainer', 'Go to Timer'), null);
});

test('rank drops non-matches and puts the best first', () => {
  const items = ['Stats', 'Settings', 'Sessions'];
  assert.deepEqual(rank('ses', items, (s, q) => fuzzyMatch(q, s)).map((r) => r.item), ['Sessions', 'Settings']);
});

test('rank keeps the original order for ties', () => {
  const items = ['Timer', 'Timer'];
  const out = rank('tim', items, (s, q) => fuzzyMatch(q, s));
  assert.equal(out.length, 2);
  assert.equal(out[0]!.match.score, out[1]!.match.score);
});

test('the label wins over the subtitle, which still matches at a penalty', () => {
  const onLabel = fuzzyFields('stat', 'Go to Stats', 'Go to Stats Trends and PBs')!;
  const onSub = fuzzyFields('stat', 'Turn inspection off', 'Turn inspection off statistics')!;
  assert.ok(onLabel.score > onSub.score);
  assert.deepEqual(onLabel.indices, [6, 7, 8, 9]);
  assert.deepEqual(onSub.indices, [], 'a subtitle match highlights nothing in the label');
  assert.equal(fuzzyFields('zzz', 'Go to Stats', 'Go to Stats Trends and PBs'), null);
});

test('a run is found even when an earlier character tempts a greedy match', () => {
  const text = 'Import solves… upload restore cstimer csv';
  const m = fuzzyMatch('csv', text)!;
  assert.equal(text.slice(m.indices[0]!, m.indices[2]! + 1), 'csv');
  assert.ok(m.score > score('csv', 'Switch to F2L only (last layer solved)'));
});
