/**
 * inphner: scrambles that set up a trainer case (inphner-prompt.md §A8).
 *
 * The case goes into a random full-cube state (random AUF before and after;
 * for OLL also a random last-layer permutation; for F2L random last-layer
 * pieces), which cubing.js then solves; the inverted solution is the scramble.
 * So the scramble looks like any random-state scramble: you can't read the
 * case off its last moves. Custom cases apply the inverse of the user's alg.
 */
import { aufVariants, compose, invertAlg, parity, uPower, type LL } from './ll.ts';
import { f2lState } from './f2l.ts';
import type { TrainerCase } from './cases.ts';
import type { State } from './cube3.ts';
import { normalizeScramble } from '../scramble/moves.ts';

function shuffle(n: number): number[] {
  const a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** The LL state to set up, randomised within the case. */
export function randomLL(c: TrainerCase): LL {
  const base = c.ll!;
  if (c.set === 'oll') {
    // Orientation pattern seen from a random side, with a random permutation.
    const r = Math.floor(Math.random() * 4);
    const turned = compose(compose(uPower(r), base), uPower(-r));
    let cp = shuffle(4);
    const ep = shuffle(4);
    if (parity(cp) !== parity(ep)) cp = [cp[1]!, cp[0]!, cp[2]!, cp[3]!];
    return { cp, co: turned.co, ep, eo: turned.eo };
  }
  const vs = aufVariants(base);
  return vs[Math.floor(Math.random() * vs.length)]!;
}

async function solveToScramble(state: State): Promise<string> {
  const [{ cube3x3x3 }, { KPattern }, { experimentalSolve3x3x3IgnoringCenters }] = await Promise.all([
    import('cubing/puzzles'), import('cubing/kpuzzle'), import('cubing/search'),
  ]);
  const kp = await cube3x3x3.kpuzzle();
  const data = structuredClone(kp.definition.defaultPattern) as unknown as Record<string, unknown>;
  data.EDGES = state.EDGES;
  data.CORNERS = state.CORNERS;
  const solution = await experimentalSolve3x3x3IgnoringCenters(new KPattern(kp, data as never));
  return normalizeScramble(solution.invert().toString());
}

function withLL(ll: LL): State {
  const corners = { pieces: [...Array(8).keys()], orientation: Array<number>(8).fill(0) };
  const edges = { pieces: [...Array(12).keys()], orientation: Array<number>(12).fill(0) };
  for (let i = 0; i < 4; i++) {
    corners.pieces[i] = ll.cp[i]!;
    corners.orientation[i] = ll.co[i]!;
    edges.pieces[i] = ll.ep[i]!;
    edges.orientation[i] = ll.eo[i]!;
  }
  return { EDGES: edges, CORNERS: corners };
}

export async function caseScramble(c: TrainerCase): Promise<string> {
  if (c.kind === 'll' && c.ll) return solveToScramble(withLL(randomLL(c)));
  if (c.kind === 'f2l' && c.f2l) return solveToScramble(f2lState(c.f2l));
  // Custom case that isn't a last-layer alg: set it up with the inverse (after a random AUF).
  const [{ cube3x3x3 }] = await Promise.all([import('cubing/puzzles')]);
  const kp = await cube3x3x3.kpuzzle();
  const auf = ['', 'U ', 'U2 ', "U' "][Math.floor(Math.random() * 4)];
  const pattern = kp.defaultPattern().applyAlg(`${auf}${invertAlg(c.alg)}`);
  return solveToScramble(pattern.patternData as unknown as State);
}
