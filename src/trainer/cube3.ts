/**
 * inphner: stickers of a full 3x3 piece state (cubing.js KPuzzle layout).
 * Pure, unit-tested against both cubing.js and our N×N simulator.
 *
 * Positions (cubing.js order):
 *   corners UFR URB UBL ULF DRF DFL DLB DBR
 *   edges   UF UR UB UL DF DR DB DL FR FL BR BL
 * Each position lists its faces starting at the reference face (U/D for
 * corners and U/D edges, F/B for E-slice edges), corners clockwise seen from
 * outside. A piece with orientation o at position p puts its i-th colour on
 * face (i + o) of p.
 */
import type { Face } from '../scramble/nxn.ts';

export const CORNER_POS: Face[][] = [
  ['U', 'R', 'F'], ['U', 'B', 'R'], ['U', 'L', 'B'], ['U', 'F', 'L'],
  ['D', 'F', 'R'], ['D', 'L', 'F'], ['D', 'B', 'L'], ['D', 'R', 'B'],
];
export const EDGE_POS: Face[][] = [
  ['U', 'F'], ['U', 'R'], ['U', 'B'], ['U', 'L'], ['D', 'F'], ['D', 'R'], ['D', 'B'], ['D', 'L'],
  ['F', 'R'], ['F', 'L'], ['B', 'R'], ['B', 'L'],
];

export interface Orbit { pieces: number[]; orientation: number[] }
export interface State { EDGES: Orbit; CORNERS: Orbit }

export function solvedState(): State {
  return {
    EDGES: { pieces: [...Array(12).keys()], orientation: Array<number>(12).fill(0) },
    CORNERS: { pieces: [...Array(8).keys()], orientation: Array<number>(8).fill(0) },
  };
}

/** Sticker key "<cornerPos|edgePos>:<face>" → the colour (home face) shown there. */
export function stickers(s: State): Map<string, Face> {
  const out = new Map<string, Face>();
  s.CORNERS.pieces.forEach((piece, p) => {
    const o = s.CORNERS.orientation[p]!;
    for (let i = 0; i < 3; i++) out.set(`c${p}:${CORNER_POS[p]![(i + o) % 3]}`, CORNER_POS[piece]![i]!);
  });
  s.EDGES.pieces.forEach((piece, p) => {
    const o = s.EDGES.orientation[p]!;
    for (let i = 0; i < 2; i++) out.set(`e${p}:${EDGE_POS[p]![(i + o) % 2]}`, EDGE_POS[piece]![i]!);
  });
  return out;
}

const CI = (name: string) => ['UFR', 'URB', 'UBL', 'ULF', 'DRF', 'DFL', 'DLB', 'DBR'].indexOf(name);
const EI = (name: string) => ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL'].indexOf(name);

/**
 * Face grids in the same layout as nxn.faceGrids (rows top→bottom, cols
 * left→right as each face is seen in the cross net), centres included.
 */
export function grids(s: State): Record<Face, Face[][]> {
  const st = stickers(s);
  const c = (n: string, f: Face) => st.get(`c${CI(n)}:${f}`)!;
  const e = (n: string, f: Face) => st.get(`e${EI(n)}:${f}`)!;
  return {
    U: [[c('UBL', 'U'), e('UB', 'U'), c('URB', 'U')], [e('UL', 'U'), 'U', e('UR', 'U')], [c('ULF', 'U'), e('UF', 'U'), c('UFR', 'U')]],
    F: [[c('ULF', 'F'), e('UF', 'F'), c('UFR', 'F')], [e('FL', 'F'), 'F', e('FR', 'F')], [c('DFL', 'F'), e('DF', 'F'), c('DRF', 'F')]],
    R: [[c('UFR', 'R'), e('UR', 'R'), c('URB', 'R')], [e('FR', 'R'), 'R', e('BR', 'R')], [c('DRF', 'R'), e('DR', 'R'), c('DBR', 'R')]],
    B: [[c('URB', 'B'), e('UB', 'B'), c('UBL', 'B')], [e('BR', 'B'), 'B', e('BL', 'B')], [c('DBR', 'B'), e('DB', 'B'), c('DLB', 'B')]],
    L: [[c('UBL', 'L'), e('UL', 'L'), c('ULF', 'L')], [e('BL', 'L'), 'L', e('FL', 'L')], [c('DLB', 'L'), e('DL', 'L'), c('DFL', 'L')]],
    D: [[c('DFL', 'D'), e('DF', 'D'), c('DRF', 'D')], [e('DL', 'D'), 'D', e('DR', 'D')], [c('DLB', 'D'), e('DB', 'D'), c('DBR', 'D')]],
  };
}
