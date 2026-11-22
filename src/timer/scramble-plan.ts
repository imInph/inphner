/**
 * inphner: a way from the cube as it is to the scramble's state, for when the
 * cube wasn't solved when the scramble came up (or a turn went unreported).
 * csTimer does the same. cubing.js's solver is loaded lazily, like everywhere
 * else; our piece order and orientation are cubing.js's (checked in the test).
 */
import { compose, invert, sameCube, type Cube } from '../tools/cube.ts';
import { normalizeScramble } from '../scramble/moves.ts';

export async function planFrom(current: Cube, target: Cube): Promise<string> {
  if (sameCube(current, target)) return '';
  const [{ cube3x3x3 }, { KPattern }, { experimentalSolve3x3x3IgnoringCenters }] = await Promise.all([
    import('cubing/puzzles'), import('cubing/kpuzzle'), import('cubing/search'),
  ]);
  const kp = await cube3x3x3.kpuzzle();
  // Undo the target, then do the cube: solving that state takes the cube to the target.
  const p = compose(invert(target), current);
  const data = structuredClone(kp.definition.defaultPattern) as unknown as Record<string, unknown>;
  data.EDGES = { pieces: p.ep, orientation: p.eo };
  data.CORNERS = { pieces: p.cp, orientation: p.co };
  const solution = await experimentalSolve3x3x3IgnoringCenters(new KPattern(kp, data as never));
  return normalizeScramble(solution.toString());
}
