/**
 * inphner: the Tools solver worker. Each hint's tables are built the first
 * time that hint is asked for (the cross ~70 ms, EOLine ~200 ms, the first
 * block and XCross a few seconds) and then answer in well under a millisecond,
 * which is why this is not on the main thread.
 *
 * A request carries the orientations to try, grouped by cross colour, because
 * a solution you can't orient is no use at the cube and because "any colour"
 * should show what each colour would cost rather than silently pick one.
 */
import { cubeFromScramble, type Cube } from './cube.ts';
import { crossSolver, eolineSolver, firstBlockSolver, xcrossSolver, type MultiSolver, type Solver } from './solve.ts';

export type HintKind = 'cross' | 'xcross' | 'eoline' | 'fb';

export interface HintGroup {
  /** The face whose colour ends up on the bottom, e.g. 'U' for white. */
  colour: string;
  /** Rotations that put it there; more than one when the front matters too. */
  rotations: string[];
}

export interface HintRequest {
  id: number;
  kind: HintKind;
  scramble: string;
  groups: HintGroup[];
}

export interface HintOption {
  colour: string;
  /** The rotation the moves are meant to follow. */
  rotation: string;
  moves: string[];
}

export interface HintReply {
  id: number;
  kind: HintKind;
  options?: HintOption[];
  error?: string;
  ms: number;
}

const solvers: Partial<Record<HintKind, Solver>> = {};
let xcross: MultiSolver | null = null;

function solverFor(kind: HintKind): Solver {
  if (kind === 'cross') return solvers.cross ??= crossSolver();
  if (kind === 'eoline') return solvers.eoline ??= eolineSolver();
  return solvers.fb ??= firstBlockSolver();
}

/** The best solution for one cross colour. */
function bestFor(kind: HintKind, cubes: Cube[], rotations: string[]): { rotation: string; moves: string[] } {
  if (kind === 'xcross') {
    xcross ??= xcrossSolver();
    const { index, moves } = xcross.solveBest(cubes);
    return { rotation: rotations[index]!, moves };
  }
  const solver = solverFor(kind);
  let best: { rotation: string; moves: string[] } | null = null;
  cubes.forEach((cube, i) => {
    const moves = solver.solve(cube);
    if (!best || moves.length < best.moves.length) best = { rotation: rotations[i]!, moves };
  });
  return best!;
}

declare const self: { addEventListener(t: 'message', cb: (e: { data: HintRequest }) => void): void; postMessage(m: HintReply): void };

self.addEventListener('message', (e) => {
  const { id, kind, scramble, groups } = e.data;
  const started = Date.now();
  try {
    const options: HintOption[] = [];
    for (const group of groups) {
      const rotations = group.rotations.length ? group.rotations : [''];
      const cubes: Cube[] = [];
      for (const rotation of rotations) {
        const cube = cubeFromScramble([scramble, rotation].filter(Boolean).join(' '));
        if (!cube) {
          self.postMessage({ id, kind, error: 'That scramble has notation this solver does not read.', ms: 0 });
          return;
        }
        cubes.push(cube);
      }
      options.push({ colour: group.colour, ...bestFor(kind, cubes, rotations) });
    }
    self.postMessage({ id, kind, options, ms: Date.now() - started });
  } catch (err) {
    self.postMessage({ id, kind, error: String(err), ms: Date.now() - started });
  }
});
