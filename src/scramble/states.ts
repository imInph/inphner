/**
 * inphner: random 3x3 states for the training subsets. Pure, unit-tested.
 * The generator solves the state with cubing.js and inverts the solution, so a
 * scramble looks like any random-state scramble (you can't read the case off
 * its last moves).
 *
 * Piece order is cubing.js's 3x3x3 KPuzzle (verified against its move
 * definitions): EDGES UF UR UB UL DF DR DB DL FR FL BR BL;
 * CORNERS UFR URB UBL ULF DRF DFL DLB DBR; CENTERS U L F R B D.
 */
import type { Rng } from './moves.ts';

export interface OrbitData { pieces: number[]; orientation: number[] }
export interface State3 { EDGES: OrbitData; CORNERS: OrbitData }

export const U_EDGES = [0, 1, 2, 3];
export const U_CORNERS = [0, 1, 2, 3];
export const F2L_EDGES = [4, 5, 6, 7, 8, 9, 10, 11];
export const F2L_CORNERS = [4, 5, 6, 7];

function identity(n: number): OrbitData {
  return { pieces: Array.from({ length: n }, (_, i) => i), orientation: Array<number>(n).fill(0) };
}

function shuffle(a: number[], rng: Rng): number[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function permutationParity(p: number[]): number {
  let parity = 0;
  const seen = new Array<boolean>(p.length).fill(false);
  for (let i = 0; i < p.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = p[j]!) {
      seen[j] = true;
      len++;
    }
    parity ^= (len - 1) & 1;
  }
  return parity;
}

/**
 * A random solvable state where only the pieces in the given slots move
 * (among those same slots) and every other piece is solved. Permutation
 * parities of edges and corners match; edge flips sum to 0 mod 2 and corner
 * twists to 0 mod 3.
 */
export function randomSubsetState(edgeSlots: number[], cornerSlots: number[], rng: Rng = Math.random): State3 {
  const edges = identity(12);
  const corners = identity(8);

  const ep = shuffle(edgeSlots, rng);
  edgeSlots.forEach((slot, i) => { edges.pieces[slot] = ep[i]!; });
  const cp = shuffle(cornerSlots, rng);
  cornerSlots.forEach((slot, i) => { corners.pieces[slot] = cp[i]!; });

  if (permutationParity(edges.pieces) !== permutationParity(corners.pieces)) {
    // Fix parity by swapping two pieces inside whichever set can take it.
    const [set, slots] = edgeSlots.length >= 2 ? [edges, edgeSlots] : [corners, cornerSlots];
    const [a, b] = [slots[0]!, slots[1]!];
    [set.pieces[a], set.pieces[b]] = [set.pieces[b]!, set.pieces[a]!];
  }

  let flip = 0;
  edgeSlots.forEach((slot, i) => {
    const o = i === edgeSlots.length - 1 ? (2 - flip % 2) % 2 : Math.floor(rng() * 2);
    edges.orientation[slot] = o;
    flip += o;
  });
  let twist = 0;
  cornerSlots.forEach((slot, i) => {
    const o = i === cornerSlots.length - 1 ? (3 - twist % 3) % 3 : Math.floor(rng() * 3);
    corners.orientation[slot] = o;
    twist += o;
  });
  return { EDGES: edges, CORNERS: corners };
}

export function isSolvedState(s: State3): boolean {
  return s.EDGES.pieces.every((p, i) => p === i) && s.CORNERS.pieces.every((p, i) => p === i)
    && s.EDGES.orientation.every((o) => o === 0) && s.CORNERS.orientation.every((o) => o === 0);
}
