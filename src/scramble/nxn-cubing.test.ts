/**
 * Cross-check: our N×N simulator must agree with cubing.js on what a 3x3 move
 * sequence does. For random-state scrambles, applying the scramble and then
 * cubing.js's own solution of that state must leave our cube solved.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cube3x3x3 } from 'cubing/puzzles';
import { KPattern } from 'cubing/kpuzzle';
import { experimentalSolve3x3x3IgnoringCenters } from 'cubing/search';
import { applyScramble, isSolved, solvedCube } from './nxn.ts';
import { randomSubsetState, U_EDGES, U_CORNERS } from './states.ts';
import { normalizeScramble } from './moves.ts';

test('simulator agrees with cubing.js on random 3x3 states', async () => {
  const kpuzzle = await cube3x3x3.kpuzzle();
  for (let i = 0; i < 12; i++) {
    const data = structuredClone(kpuzzle.definition.defaultPattern) as never as Record<string, unknown>;
    const edges = [...Array(12).keys()];
    const corners = [...Array(8).keys()];
    const s = randomSubsetState(edges, corners);
    data.EDGES = s.EDGES;
    data.CORNERS = s.CORNERS;
    const pattern = new KPattern(kpuzzle, data as never);
    const solution = (await experimentalSolve3x3x3IgnoringCenters(pattern)).toString();
    const scramble = normalizeScramble((await experimentalSolve3x3x3IgnoringCenters(pattern)).invert().toString());
    const cube = solvedCube(3);
    assert.ok(applyScramble(cube, scramble), scramble);
    assert.ok(!isSolved(cube));
    assert.ok(applyScramble(cube, normalizeScramble(solution)));
    assert.ok(isSolved(cube), `scramble ${scramble} then solution ${solution}`);
  }
});

test('LL subset states keep F2L solved in our simulator too', async () => {
  const kpuzzle = await cube3x3x3.kpuzzle();
  const { faceGrids } = await import('./nxn.ts');
  for (let i = 0; i < 6; i++) {
    const data = structuredClone(kpuzzle.definition.defaultPattern) as never as Record<string, unknown>;
    const s = randomSubsetState(U_EDGES, U_CORNERS);
    data.EDGES = s.EDGES;
    data.CORNERS = s.CORNERS;
    const scramble = normalizeScramble((await experimentalSolve3x3x3IgnoringCenters(new KPattern(kpuzzle, data as never))).invert().toString());
    const cube = solvedCube(3);
    applyScramble(cube, scramble);
    const g = faceGrids(cube);
    assert.ok(g.D.flat().every((c) => c === 'D'), 'D face solved');
    for (const f of ['F', 'R', 'B', 'L'] as const) {
      assert.ok(g[f].slice(1).flat().every((c) => c === f), `${f} bottom two rows solved`);
    }
  }
});
