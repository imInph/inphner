/**
 * inphner: where a solve is, from the cube alone (A5: "smart cubes detect the
 * phases automatically"). PURE.
 *
 * CFOP's four milestones, each of which contains the ones before it:
 *   1 cross  — the four D edges home
 *   2 F2L    — plus the D corners and the E-slice edges
 *   3 OLL    — plus every last-layer piece oriented
 *   4 PLL    — solved
 * Splits are cumulative milliseconds from the start, like the keyboard timer's.
 */
import { turn, type Cube } from '../tools/cube.ts';

export const PHASE_NAMES = ['cross', 'F2L', 'OLL', 'PLL'] as const;
export type Phase = 0 | 1 | 2 | 3 | 4;

const home = (perm: readonly number[], ori: readonly number[], slots: readonly number[]): boolean =>
  slots.every((slot) => perm[slot] === slot && ori[slot] === 0);

/** The cube, and the three D turns away from it: solvers drift round the D face
 *  while they build, and a cross that is one D turn off is still a built cross. */
function withDTurns(cube: Cube): Cube[] {
  const out = [cube];
  for (let i = 0; i < 3; i++) out.push(turn(out[i]!, 'D'));
  return out;
}

export function phaseOf(cube: Cube): Phase {
  const views = withDTurns(cube);
  const crossDone = views.some((c) => home(c.ep, c.eo, [4, 5, 6, 7]));
  if (!crossDone) return 0;
  const f2lDone = views.some((c) => home(c.ep, c.eo, [4, 5, 6, 7])
    && home(c.cp, c.co, [4, 5, 6, 7]) && home(c.ep, c.eo, [8, 9, 10, 11]));
  if (!f2lDone) return 1;
  // Orientation doesn't care which way the U layer is turned.
  const orientedLL = [0, 1, 2, 3].every((slot) => cube.co[slot] === 0 && cube.eo[slot] === 0);
  if (!orientedLL) return 2;
  // Finished means finished: a solved cube sitting one D turn out is not solved.
  const solvedNow = home(cube.cp, cube.co, [0, 1, 2, 3, 4, 5, 6, 7])
    && home(cube.ep, cube.eo, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  return solvedNow ? 4 : 3;
}

/**
 * Watches a solve go past the milestones. A phase never un-completes: undoing
 * the cross mid-F2L shouldn't hand out a second cross split.
 */
export class PhaseTracker {
  private reached: Phase = 0;
  readonly splits: number[] = [];

  /** Call after every move. Returns the phases newly finished, if any. */
  update(cube: Cube, elapsedMs: number): Phase[] {
    const phase = phaseOf(cube);
    const done: Phase[] = [];
    while (this.reached < phase) {
      this.reached = (this.reached + 1) as Phase;
      // The last phase ends with the solve itself, which is the total time.
      if (this.reached < 4) this.splits.push(Math.round(elapsedMs));
      done.push(this.reached);
    }
    return done;
  }

  get phase(): Phase {
    return this.reached;
  }

  reset(): void {
    this.reached = 0;
    this.splits.length = 0;
  }
}
