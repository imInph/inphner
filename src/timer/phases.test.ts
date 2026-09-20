import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { apply, cubeFromScramble, solved } from '../tools/cube.ts';
import { phaseOf, PhaseTracker } from './phases.ts';

test('a solved cube is past every phase', () => {
  assert.equal(phaseOf(solved()), 4);
});

test('the milestones are recognised in order', () => {
  // A scramble that only disturbs the last layer: cross and F2L are done.
  const llOnly = cubeFromScramble("R U R' U R U2 R'")!;   // Sune: F2L intact, LL twisted
  assert.equal(phaseOf(llOnly), 2, 'F2L is built, the last layer is not oriented');

  // A U-permutation: oriented but not permuted.
  const pll = cubeFromScramble("R U' R U R U R U' R' U' R2")!;
  assert.equal(phaseOf(pll), 3, 'oriented, still to permute');

  // A full scramble is nowhere yet.
  assert.equal(phaseOf(cubeFromScramble("R U R' U' F2 L D2 B' R2 F U2 D L' B2 R D' F' L2 U B")!), 0);
});

test('a D turn keeps the cross built, but the solve is not finished', () => {
  assert.equal(phaseOf(apply(solved(), 'D')), 3, 'built and oriented, one D turn from done');
  assert.equal(phaseOf(apply(solved(), 'F')), 0, 'an F turn breaks the cross');
  assert.equal(phaseOf(apply(solved(), 'U')), 3, 'AUF is not a finished solve either');
});

test('the tracker records a split as each phase finishes, and never twice', () => {
  const tracker = new PhaseTracker();
  const sune = cubeFromScramble("R U R' U R U2 R'")!;      // F2L built, last layer twisted
  assert.deepEqual(tracker.update(sune, 800), [1, 2], 'cross and F2L were already built');
  assert.deepEqual(tracker.splits, [800, 800]);

  // Feeding the same state again adds nothing.
  assert.deepEqual(tracker.update(sune, 1_500), []);
  assert.deepEqual(tracker.splits, [800, 800]);

  const finished = apply(sune, "R U2 R' U' R U' R'");        // the inverse: solved
  assert.deepEqual(tracker.update(finished, 5_000), [3, 4], 'OLL and PLL finished together');
  assert.equal(tracker.phase, 4);
  assert.deepEqual(tracker.splits, [800, 800, 5_000], 'three splits: cross, F2L, OLL');
});

test('the last phase has no split of its own: that is the total time', () => {
  const tracker = new PhaseTracker();
  tracker.update(solved(), 12_340);
  assert.equal(tracker.phase, 4);
  assert.equal(tracker.splits.length, 3, 'cross, F2L and OLL, not PLL');
});
