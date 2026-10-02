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
import type { Face } from './nxn.ts';

export interface OrbitData { pieces: number[]; orientation: number[] }
export interface State3 { EDGES: OrbitData; CORNERS: OrbitData }

const EDGE_NAMES = ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL'];
const CORNER_NAMES = ['UFR', 'URB', 'UBL', 'ULF', 'DRF', 'DFL', 'DLB', 'DBR'];
export const OPPOSITE: Record<Face, Face> = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'L', L: 'R' };

const on = (names: string[], face: Face) => names.flatMap((n, i) => (n.includes(face) ? [i] : []));
const all = (n: number) => [...Array(n).keys()];

/*
 * A scramble is applied in the WCA orientation (white top, green front); the
 * solver then holds the cross colour on the bottom. So the subsets are named
 * for the solver: the cross colour is the FIRST layer, its opposite the last.
 */
/** The four edge slots of a face's cross. */
export function crossEdges(face: Face): number[] {
  return on(EDGE_NAMES, face);
}
/** F2L practice: that colour's cross solved; every other edge and every corner moves. */
export function f2lSubset(face: Face): { edges: number[]; corners: number[] } {
  const cross = crossEdges(face);
  return { edges: all(12).filter((i) => !cross.includes(i)), corners: all(8) };
}
/** Last-layer practice: the F2L of that colour solved; only the opposite layer moves. */
export function llSubset(face: Face): { edges: number[]; corners: number[] } {
  const ll = OPPOSITE[face];
  return { edges: on(EDGE_NAMES, ll), corners: on(CORNER_NAMES, ll) };
}

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
