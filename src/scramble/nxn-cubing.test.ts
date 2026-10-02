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
import { randomSubsetState, f2lSubset, llSubset, OPPOSITE } from './states.ts';
import { PIECE_LAYOUT } from './pieces.ts';
import type { Face } from './nxn.ts';
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

// Scrambles are applied white top; the solver holds the cross colour on the
// bottom, so that colour is the first layer and its opposite the last.
async function subsetCube({ edges, corners }: { edges: number[]; corners: number[] }) {
  const kpuzzle = await cube3x3x3.kpuzzle();
  const data = structuredClone(kpuzzle.definition.defaultPattern) as never as Record<string, unknown>;
  const s = randomSubsetState(edges, corners);
  data.EDGES = s.EDGES;
  data.CORNERS = s.CORNERS;
  const scramble = normalizeScramble((await experimentalSolve3x3x3IgnoringCenters(new KPattern(kpuzzle, data as never))).invert().toString());
  const cube = solvedCube(3);
  applyScramble(cube, scramble);
  const { faceGrids } = await import('./nxn.ts');
  return faceGrids(cube);
}
/** A slot is solved when each of its stickers shows its own face's colour. */
function slotSolved(g: Record<Face, Face[][]>, slot: string): boolean {
  return [...slot].every((f) => {
    const i = PIECE_LAYOUT[f as Face].indexOf(slot);
    return g[f as Face][Math.floor(i / 3)]![i % 3] === f;
  });
}
const SLOTS = [...new Set(Object.values(PIECE_LAYOUT).flat().filter((x): x is string => !!x))];
const COLOURS: Face[] = ['U', 'D', 'F', 'B', 'R', 'L'];

test('F2L scrambles keep only the chosen colour\'s cross solved', async () => {
  for (const x of COLOURS) {
    let cornerMoved = false;
    for (let i = 0; i < 4; i++) {
      const g = await subsetCube(f2lSubset(x));
      for (const slot of SLOTS.filter((s) => s.length === 2 && s.includes(x))) assert.ok(slotSolved(g, slot), `${x} cross edge ${slot}`);
      if (SLOTS.some((s) => s.length === 3 && s.includes(x) && !slotSolved(g, s))) cornerMoved = true;
    }
    assert.ok(cornerMoved, `${x}: first-layer corners are not handed out solved`);
  }
});

test('LL scrambles keep the chosen colour\'s F2L solved and move only the opposite layer', async () => {
  for (const x of COLOURS) {
    let llMoved = false;
    for (let i = 0; i < 4; i++) {
      const g = await subsetCube(llSubset(x));
      for (const slot of SLOTS.filter((s) => !s.includes(OPPOSITE[x]))) assert.ok(slotSolved(g, slot), `${x}: ${slot} solved`);
      if (SLOTS.some((s) => s.includes(OPPOSITE[x]) && !slotSolved(g, s))) llMoved = true;
    }
    assert.ok(llMoved, `${x}: the last layer is actually scrambled`);
  }
});
