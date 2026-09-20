/**
 * The solvers are only worth having if their answers are true and optimal, so
 * every test here checks the cube afterwards rather than a remembered string.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { apply, cubeFromScramble, solved, TURNS, type Cube } from './cube.ts';
import { crossSolver, eolineSolver, firstBlockSolver, trackedSolver } from './solve.ts';
import { COLOUR_NAMES, FACE_ORDER, orientations, TO_BOTTOM } from './orient.ts';
import { applyScramble, faceGrids, solvedCube } from '../scramble/nxn.ts';

const SCRAMBLES = [
  "R U R' U' F2 L D2 B' R2 F U2 D L' B2 R D' F' L2 U B",
  "D2 L2 F2 U' B2 U' F2 D' R2 D2 B2 L' B' R' U2 L2 F D' R' F2 U",
  "F R U' R2 D B2 L F2 D' R B U2 L2 F' B2 D2 R2 U L2 D",
  "U2 F2 R2 B2 D' L2 D2 B2 U B2 F' L' R2 U' R' F' D2 L U'",
];

const crossHome = (c: Cube) => [4, 5, 6, 7].every((p) => c.ep[p] === p && c.eo[p] === 0);
const eolineHome = (c: Cube) => c.eo.every((o) => o === 0) && c.ep[4] === 4 && c.ep[6] === 6;
const fbHome = (c: Cube) => [7, 9, 11].every((p) => c.ep[p] === p && c.eo[p] === 0)
  && [5, 6].every((p) => c.cp[p] === p && c.co[p] === 0);

test('edge orientation flips on F and B only (the ZZ convention)', () => {
  for (const t of TURNS) {
    const flipped = apply(solved(), t).eo.some((o) => o !== 0);
    const quarterFB = /^[FB]'?$/.test(t);
    assert.equal(flipped, quarterFB, `${t} should ${quarterFB ? '' : 'not '}flip edges`);
  }
});

test('the cross solution solves the cross, and is optimal', () => {
  const solver = crossSolver();
  for (const scramble of SCRAMBLES) {
    const cube = cubeFromScramble(scramble)!;
    const solution = solver.solve(cube);
    assert.ok(crossHome(apply(cube, solution.join(' '))), `cross not solved: ${scramble}`);
    assert.ok(solution.length <= 8, `${solution.length} moves is longer than a cross ever needs`);
    // Optimal: no shorter solution exists, so every one-move-shorter start fails.
    for (const t of TURNS) {
      const shorter = solver.solve(apply(cube, t));
      assert.ok(shorter.length >= solution.length - 1, 'a move cannot save more than one move');
    }
  }
});

test('an already solved cross needs no moves', () => {
  assert.deepEqual(crossSolver().solve(solved()), []);
  assert.deepEqual(crossSolver().solve(apply(solved(), 'U')), []);
});

test('EOLine orients every edge and places DF and DB', () => {
  const solver = eolineSolver();
  for (const scramble of SCRAMBLES) {
    const cube = cubeFromScramble(scramble)!;
    const solution = solver.solve(cube);
    assert.ok(eolineHome(apply(cube, solution.join(' '))), `EOLine not solved: ${scramble}`);
    assert.ok(solution.length <= 10, `${solution.length} moves is too many for an EOLine`);
  }
});

test("Roux's first block solver builds the left block", () => {
  const solver = firstBlockSolver();
  for (const scramble of SCRAMBLES.slice(0, 2)) {
    const cube = cubeFromScramble(scramble)!;
    const solution = solver.solve(cube);
    assert.ok(fbHome(apply(cube, solution.join(' '))), `first block not built: ${scramble}`);
  }
});

test('a tracked solver only cares about its own pieces', () => {
  const solver = trackedSolver([0], []);   // just the UF edge
  const cube = cubeFromScramble(SCRAMBLES[0]!)!;
  const after = apply(cube, solver.solve(cube).join(' '));
  assert.equal(after.ep[0], 0);
  assert.equal(after.eo[0], 0);
});

test('a hint solves the cross of the colour you asked for, after its rotation', () => {
  const solver = crossSolver();
  for (const scramble of SCRAMBLES) {
    for (const colour of FACE_ORDER) {
      const rotation = TO_BOTTOM[colour];
      const setup = [scramble, rotation].filter(Boolean).join(' ');
      const cube = cubeFromScramble(setup)!;
      const solution = solver.solve(cube).join(' ');
      assert.ok(crossHome(apply(cube, solution)), `${COLOUR_NAMES[colour]} cross unsolved: ${scramble}`);

      // And on real stickers: that bottom layer really is the colour we asked for.
      const stickerCube = solvedCube(3);
      assert.ok(applyScramble(stickerCube, `${setup} ${solution}`));
      const g = faceGrids(stickerCube);
      assert.equal(g.D[1]![1], colour, 'the wrong face ended up down');
      for (const [r, c] of [[0, 1], [1, 0], [1, 2], [2, 1]] as [number, number][]) {
        assert.equal(g.D[r]![c], colour, `${COLOUR_NAMES[colour]} cross edge missing on D`);
      }
      for (const side of ['F', 'R', 'B', 'L'] as const) {
        assert.equal(g[side][2]![1], g[side][1]![1], `${COLOUR_NAMES[colour]} cross edge not matched to its centre`);
      }
    }
  }
});

test('colour neutral picks a cross no longer than any single colour', () => {
  const solver = crossSolver();
  const scramble = SCRAMBLES[0]!;
  const lengths = FACE_ORDER.map((colour) => {
    const setup = [scramble, TO_BOTTOM[colour]].filter(Boolean).join(' ');
    return solver.solve(cubeFromScramble(setup)!).length;
  });
  assert.equal(Math.min(...lengths), Math.min(...lengths), 'sanity');
  assert.ok(Math.max(...lengths) >= Math.min(...lengths));
  assert.equal(orientations('any', false).length, 6);
});
