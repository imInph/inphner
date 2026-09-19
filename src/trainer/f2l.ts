/**
 * inphner: the 41 F2L cases (front-right slot), enumerated. Pure, unit-tested.
 *
 * A case is where the FR pair's corner (piece DRF) and edge (piece FR) are,
 * and how they're turned, with the cross and the other three slots solved.
 * Up to AUF that gives 24 (both in the top) + 6 (corner top, edge in the slot)
 * + 6 (corner in the slot, edge top) + 5 (both in the slot, not solved) = 41.
 *
 * Names are descriptive and read off the stickers (white = the cross colour,
 * green = front), not a numbering, so they can't be wrong.
 */
import type { Rng } from '../scramble/moves.ts';
import { permutationParity } from '../scramble/states.ts';
import { CORNER_POS, EDGE_POS, stickers, type State } from './cube3.ts';
import type { Face } from '../scramble/nxn.ts';

export interface F2LCase {
  id: string;
  group: 'top' | 'edge-slot' | 'corner-slot' | 'slot';
  name: string;
  /** Canonical placement: corner at 0 (UFR) or 4 (DRF); edge at 0–3 (U layer) or 8 (FR). */
  corner: 0 | 4;
  co: number;
  edge: number;
  eo: number;
}

export const F2L_GROUPS: { id: F2LCase['group']; name: string }[] = [
  { id: 'top', name: 'Both in the top' },
  { id: 'edge-slot', name: 'Corner in the top, edge in the slot' },
  { id: 'corner-slot', name: 'Corner in the slot, edge in the top' },
  { id: 'slot', name: 'Both in the slot' },
];

const CORNER_PIECE = 4; // DRF
const EDGE_PIECE = 8; // FR
const WORD: Record<Face, string> = { U: 'up', D: 'down', F: 'front', R: 'right', B: 'back', L: 'left' };

function describe(c: Omit<F2LCase, 'id' | 'group' | 'name'>): string {
  // The corner's white (D-colour) sticker and the edge's green (F-colour) sticker.
  const white = CORNER_POS[c.corner]![c.co % 3]!;
  const green = EDGE_POS[c.edge]![c.eo % 2]!;
  const cornerTxt = c.corner === 0 ? `white ${WORD[white]}` : c.co === 0 ? 'corner solved' : `corner in slot, white ${WORD[white]}`;
  let edgeTxt: string;
  if (c.edge === 8) edgeTxt = c.eo === 0 ? 'edge solved' : 'edge flipped';
  else edgeTxt = `edge ${['UF', 'UR', 'UB', 'UL'][c.edge]}, green ${WORD[green]}`;
  return `${cornerTxt} · ${edgeTxt}`;
}

export function enumerateF2L(): F2LCase[] {
  const out: F2LCase[] = [];
  const add = (group: F2LCase['group'], corner: 0 | 4, co: number, edge: number, eo: number) => {
    const base = { corner, co, edge, eo };
    out.push({ id: `f2l-c${corner}${co}-e${edge}${eo}`, group, name: describe(base), ...base });
  };
  for (let co = 0; co < 3; co++) for (let edge = 0; edge < 4; edge++) for (let eo = 0; eo < 2; eo++) add('top', 0, co, edge, eo);
  for (let co = 0; co < 3; co++) for (let eo = 0; eo < 2; eo++) add('edge-slot', 0, co, 8, eo);
  for (let co = 0; co < 3; co++) for (let eo = 0; eo < 2; eo++) add('corner-slot', 4, co, 0, eo);
  for (let co = 0; co < 3; co++) for (let eo = 0; eo < 2; eo++) if (co || eo) add('slot', 4, co, 8, eo);
  return out;
}

function shuffle<T>(a: T[], rng: Rng): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * A random full-cube state for a case: the pair placed (after a random AUF),
 * the last-layer pieces anywhere else they can go (including the empty slot),
 * cross and other slots solved. `auf` fixes the AUF (0 for diagrams).
 */
export function f2lState(c: F2LCase, rng: Rng = Math.random, auf?: number): State {
  const k = auf ?? Math.floor(rng() * 4);
  const rot = (p: number) => (p < 4 ? (p + k) % 4 : p);
  const cPos = rot(c.corner);
  const ePos = rot(c.edge);

  const corners = { pieces: [...Array(8).keys()], orientation: Array<number>(8).fill(0) };
  const edges = { pieces: [...Array(12).keys()], orientation: Array<number>(12).fill(0) };

  const freeC = [0, 1, 2, 3, 4].filter((p) => p !== cPos);
  const llC = shuffle([0, 1, 2, 3], rng);
  corners.pieces[cPos] = CORNER_PIECE;
  corners.orientation[cPos] = c.co;
  freeC.forEach((p, i) => { corners.pieces[p] = llC[i]!; });
  const freeE = [0, 1, 2, 3, 8].filter((p) => p !== ePos);
  const llE = shuffle([0, 1, 2, 3], rng);
  edges.pieces[ePos] = EDGE_PIECE;
  edges.orientation[ePos] = c.eo;
  freeE.forEach((p, i) => { edges.pieces[p] = llE[i]!; });

  // Orientations of the last-layer pieces: random, the last one fixes the sum.
  let twist = c.co;
  freeC.forEach((p, i) => {
    const o = i === freeC.length - 1 ? (3 - (twist % 3)) % 3 : Math.floor(rng() * 3);
    corners.orientation[p] = o;
    twist += o;
  });
  let flip = c.eo;
  freeE.forEach((p, i) => {
    const o = i === freeE.length - 1 ? flip % 2 : Math.floor(rng() * 2);
    edges.orientation[p] = o;
    flip += o;
  });
  // Permutation parities must match: swap two last-layer edges if not.
  if (permutationParity(corners.pieces) !== permutationParity(edges.pieces)) {
    const [a, b] = [freeE[0]!, freeE[1]!];
    [edges.pieces[a], edges.pieces[b]] = [edges.pieces[b]!, edges.pieces[a]!];
  }
  return { EDGES: edges, CORNERS: corners };
}

export type Sticker = Face | 'X';

/** Face grids for a diagram: last-layer pieces greyed ('X'), F2L pieces in colour. */
export function f2lGrids(s: State): Record<'U' | 'F' | 'R', Sticker[][]> {
  const st = stickers(s);
  const isLL = (key: string) => {
    const m = /^([ce])(\d+):/.exec(key)!;
    const piece = m[1] === 'c' ? s.CORNERS.pieces[+m[2]!]! : s.EDGES.pieces[+m[2]!]!;
    return piece < 4;
  };
  const get = (kind: 'c' | 'e', pos: number, f: Face): Sticker => {
    const key = `${kind}${pos}:${f}`;
    return isLL(key) ? 'X' : st.get(key)!;
  };
  return {
    U: [[get('c', 2, 'U'), get('e', 2, 'U'), get('c', 1, 'U')], [get('e', 3, 'U'), 'X', get('e', 1, 'U')], [get('c', 3, 'U'), get('e', 0, 'U'), get('c', 0, 'U')]],
    F: [[get('c', 3, 'F'), get('e', 0, 'F'), get('c', 0, 'F')], [get('e', 9, 'F'), 'F', get('e', 8, 'F')], [get('c', 5, 'F'), get('e', 4, 'F'), get('c', 4, 'F')]],
    R: [[get('c', 0, 'R'), get('e', 1, 'R'), get('c', 1, 'R')], [get('e', 8, 'R'), 'R', get('e', 10, 'R')], [get('c', 4, 'R'), get('e', 5, 'R'), get('c', 7, 'R')]],
  };
}
