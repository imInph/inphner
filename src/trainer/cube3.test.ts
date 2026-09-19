import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cube3x3x3 } from 'cubing/puzzles';
import { grids, type State } from './cube3.ts';
import { applyScramble, faceGrids, solvedCube } from '../scramble/nxn.ts';
import { randomMoves } from '../scramble/moves.ts';

test('piece-state stickers match the simulator for random move sequences', async () => {
  const kp = await cube3x3x3.kpuzzle();
  let seed = 11;
  const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 40; i++) {
    const alg = randomMoves(['R', 'U', 'F', 'L', 'D', 'B'], 12 + (i % 9), rng).join(' ');
    const data = kp.defaultPattern().applyAlg(alg).patternData as unknown as State;
    const sim = solvedCube(3);
    applyScramble(sim, alg);
    assert.deepEqual(grids(data), faceGrids(sim), alg);
  }
});
