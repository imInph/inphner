/**
 * XCross: the cross plus one F2L pair. The tests check the answer on the cube
 * (never a remembered string) and that it is no shorter than the cross alone,
 * which is the one thing an optimal XCross can never be.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { apply, cubeFromScramble, type Cube } from './cube.ts';
import { crossSolver, xcrossSolver } from './solve.ts';
import { Y_TURNS } from './orient.ts';

const SCRAMBLES = [
  "R U R' U' F2 L D2 B' R2 F U2 D L' B2 R D' F' L2 U B",
  "D2 L2 F2 U' B2 U' F2 D' R2 D2 B2 L' B' R' U2 L2 F D' R' F2 U",
];

const crossHome = (c: Cube) => [4, 5, 6, 7].every((p) => c.ep[p] === p && c.eo[p] === 0);
const pairHome = (c: Cube) => c.ep[8] === 8 && c.eo[8] === 0 && c.cp[4] === 4 && c.co[4] === 0;

test('an XCross solves the cross and the front-right pair together', () => {
  const solver = xcrossSolver();
  const cross = crossSolver();
  for (const scramble of SCRAMBLES) {
    // The four F2L slots are the four ways of facing the cube.
    const cubes = Y_TURNS.map((y) => cubeFromScramble([scramble, y].filter(Boolean).join(' '))!);
    const { index, moves } = solver.solveBest(cubes);
    const after = apply(cubes[index]!, moves.join(' '));
    assert.ok(crossHome(after), `cross not solved: ${scramble}`);
    assert.ok(pairHome(after), `pair not solved: ${scramble}`);
    assert.ok(moves.length >= cross.solve(cubes[index]!).length, 'an XCross cannot beat the cross alone');
    assert.ok(moves.length <= 12, `${moves.length} moves is too long for an optimal XCross`);
  }
});

test('it picks the shortest of the four slots', () => {
  const solver = xcrossSolver();
  const scramble = SCRAMBLES[0]!;
  const cubes = Y_TURNS.map((y) => cubeFromScramble([scramble, y].filter(Boolean).join(' '))!);
  const best = solver.solveBest(cubes);
  // Solving each slot on its own can never beat the best of all four.
  for (let i = 0; i < cubes.length; i++) {
    const alone = solver.solveBest([cubes[i]!]);
    assert.ok(alone.moves.length >= best.moves.length, `slot ${i} beat the best of four`);
  }
});
