import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cube3x3x3 } from 'cubing/puzzles';
import { KPattern } from 'cubing/kpuzzle';
import { experimentalSolve3x3x3IgnoringCenters } from 'cubing/search';
import { enumerateF2L, f2lGrids, f2lState } from './f2l.ts';
import { grids } from './cube3.ts';
import { permutationParity } from '../scramble/states.ts';

test('41 distinct F2L cases in 4 groups (24 + 6 + 6 + 5)', () => {
  const cases = enumerateF2L();
  assert.equal(cases.length, 41);
  assert.equal(new Set(cases.map((c) => c.id)).size, 41);
  assert.equal(new Set(cases.map((c) => c.name)).size, 41, 'names are unique');
  const count = (g: string) => cases.filter((c) => c.group === g).length;
  assert.deepEqual([count('top'), count('edge-slot'), count('corner-slot'), count('slot')], [24, 6, 6, 5]);
});

test('every case yields valid states with the cross and other slots solved', () => {
  let seed = 3;
  const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const c of enumerateF2L()) {
    for (let t = 0; t < 5; t++) {
      const s = f2lState(c, rng);
      assert.equal(permutationParity(s.CORNERS.pieces), permutationParity(s.EDGES.pieces), c.id);
      assert.equal(s.CORNERS.orientation.reduce((a, b) => a + b, 0) % 3, 0, c.id);
      assert.equal(s.EDGES.orientation.reduce((a, b) => a + b, 0) % 2, 0, c.id);
      for (const p of [5, 6, 7]) assert.deepEqual([s.CORNERS.pieces[p], s.CORNERS.orientation[p]], [p, 0]);
      for (const p of [4, 5, 6, 7, 9, 10, 11]) assert.deepEqual([s.EDGES.pieces[p], s.EDGES.orientation[p]], [p, 0]);
      // The D face is solved everywhere except the FR slot's corner (which holds whatever sits there).
      const g = grids(s);
      const d = g.D.flat();
      assert.ok(d.every((x, i) => i === 2 || x === 'D'), `${c.id}: cross and other D corners solved`);
    }
  }
});

test('the diagram shows the pair where the name says (sample)', () => {
  const c = enumerateF2L().find((x) => x.name === 'white right · edge UB, green up')!;
  const g = f2lGrids(f2lState(c, Math.random, 0));
  assert.equal(g.R[0]![0], 'D', 'white (cross colour) on the right face of UFR');
  assert.equal(g.U[0]![1], 'F', 'green on top of UB');
});

test('F2L states are solvable by cubing.js (one per group)', async () => {
  const kp = await cube3x3x3.kpuzzle();
  const cases = enumerateF2L();
  for (const g of ['top', 'edge-slot', 'corner-slot', 'slot']) {
    const c = cases.find((x) => x.group === g)!;
    const s = f2lState(c);
    const data = structuredClone(kp.definition.defaultPattern) as unknown as Record<string, unknown>;
    data.EDGES = s.EDGES;
    data.CORNERS = s.CORNERS;
    const sol = await experimentalSolve3x3x3IgnoringCenters(new KPattern(kp, data as never));
    assert.ok(sol.toString().length > 0);
  }
});
