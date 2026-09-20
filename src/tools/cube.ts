/**
 * inphner: a piece-level 3x3 (permutation + orientation), fast enough for the
 * Tools solvers' breadth-first searches. PURE.
 *
 * The move tables are not typed in by hand: they are read once from our own
 * sticker simulator (scramble/nxn.ts, which is cross-checked against
 * cubing.js), so there is one source of truth for what a turn does.
 *
 * Order is cubing.js's, the same as trainer/cube3.ts:
 *   edges   UF UR UB UL DF DR DB DL FR FL BR BL
 *   corners UFR URB UBL ULF DRF DFL DLB DBR
 * An edge's orientation is 0 when its first-listed face sticker sits on the
 * first-listed face of its slot; a corner's is how far its U/D sticker is
 * turned clockwise from the slot's U/D face.
 */
import { CORNER_POS, EDGE_POS } from '../trainer/cube3.ts';
import { applyScramble, faceGrids, solvedCube, type Face } from '../scramble/nxn.ts';

export interface Cube {
  ep: number[]; eo: number[];
  cp: number[]; co: number[];
}

export const MOVES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type MoveFace = typeof MOVES[number];
/** The 18 quarter/half turns, in the order the searches try them. */
export const TURNS: string[] = MOVES.flatMap((f) => [f, `${f}2`, `${f}'`]);

export function solved(): Cube {
  return {
    ep: [...Array(12).keys()], eo: Array<number>(12).fill(0),
    cp: [...Array(8).keys()], co: Array<number>(8).fill(0),
  };
}

/** Where each sticker lives in nxn's face grids: "e<pos>:<face>" / "c<pos>:<face>". */
export const CELLS = new Map<string, [Face, number, number]>();
{
  const corners = ['UFR', 'URB', 'UBL', 'ULF', 'DRF', 'DFL', 'DLB', 'DBR'];
  const edges = ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL'];
  // Each face grid, row by row, naming the piece each cell belongs to.
  const layout: Record<Face, (string | null)[]> = {
    U: ['UBL', 'UB', 'URB', 'UL', null, 'UR', 'ULF', 'UF', 'UFR'],
    F: ['ULF', 'UF', 'UFR', 'FL', null, 'FR', 'DFL', 'DF', 'DRF'],
    R: ['UFR', 'UR', 'URB', 'FR', null, 'BR', 'DRF', 'DR', 'DBR'],
    B: ['URB', 'UB', 'UBL', 'BR', null, 'BL', 'DBR', 'DB', 'DLB'],
    L: ['UBL', 'UL', 'ULF', 'BL', null, 'FL', 'DLB', 'DL', 'DFL'],
    D: ['DFL', 'DF', 'DRF', 'DL', null, 'DR', 'DLB', 'DB', 'DBR'],
  };
  for (const [face, cells] of Object.entries(layout) as [Face, (string | null)[]][]) {
    cells.forEach((name, i) => {
      if (!name) return;
      const c = corners.indexOf(name);
      const key = c >= 0 ? `c${c}:${face}` : `e${edges.indexOf(name)}:${face}`;
      CELLS.set(key, [face, Math.floor(i / 3), i % 3]);
    });
  }
}

/** Read a sticker cube back as pieces. Colours are named by their centre. */
export function fromStickers(state: ReturnType<typeof solvedCube>): Cube | null {
  const g = faceGrids(state);
  const home = new Map<Face, Face>();
  for (const f of ['U', 'R', 'F', 'D', 'L', 'B'] as Face[]) home.set(g[f][1]![1]!, f);
  const at = (key: string): Face | null => {
    const cell = CELLS.get(key);
    if (!cell) return null;
    return home.get(g[cell[0]][cell[1]]![cell[2]]!) ?? null;
  };

  const cube = solved();
  for (let p = 0; p < 12; p++) {
    const faces = EDGE_POS[p]!.map((f) => at(`e${p}:${f}`));
    if (faces.some((f) => f === null)) return null;
    const piece = EDGE_POS.findIndex((home2) => home2.every((f) => faces.includes(f)));
    if (piece < 0) return null;
    cube.ep[p] = piece;
    cube.eo[p] = faces[0] === EDGE_POS[piece]![0] ? 0 : 1;
  }
  for (let p = 0; p < 8; p++) {
    const faces = CORNER_POS[p]!.map((f) => at(`c${p}:${f}`));
    if (faces.some((f) => f === null)) return null;
    const piece = CORNER_POS.findIndex((home2) => home2.every((f) => faces.includes(f)));
    if (piece < 0) return null;
    const o = faces.findIndex((f) => f === 'U' || f === 'D');
    if (o < 0) return null;
    cube.cp[p] = piece;
    cube.co[p] = o;
  }
  return cube;
}

/** Each turn as the cube it produces from solved: pieces[slot] and the twist it adds. */
export const TABLE: Record<string, Cube> = {};
for (const turn of TURNS) {
  const state = solvedCube(3);
  applyScramble(state, turn);
  TABLE[turn] = fromStickers(state)!;
}

export function turn(cube: Cube, move: string): Cube {
  const t = TABLE[move];
  if (!t) throw new Error(`unknown move ${move}`);
  const out: Cube = { ep: Array(12), eo: Array(12), cp: Array(8), co: Array(8) };
  for (let p = 0; p < 12; p++) {
    const from = t.ep[p]!;
    out.ep[p] = cube.ep[from]!;
    out.eo[p] = (cube.eo[from]! + t.eo[p]!) % 2;
  }
  for (let p = 0; p < 8; p++) {
    const from = t.cp[p]!;
    out.cp[p] = cube.cp[from]!;
    out.co[p] = (cube.co[from]! + t.co[p]!) % 3;
  }
  return out;
}

export function apply(cube: Cube, moves: string): Cube {
  let out = cube;
  for (const m of moves.trim().split(/\s+/).filter(Boolean)) out = turn(out, m);
  return out;
}

/** The cube a scramble leaves, or null if the notation isn't plain 3x3 turns. */
export function cubeFromScramble(scramble: string): Cube | null {
  const state = solvedCube(3);
  if (!applyScramble(state, scramble)) return null;
  return fromStickers(state);
}

/** Kociemba's facelet order: U R F D L B, each face read row by row. */
const FACELET_FACES: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

/**
 * A cube from a 54-character facelet string ("UUUUUUUUURRR…"), the form smart
 * cubes and solvers speak. Our grid layout is the same one Kociemba reads, so
 * the mapping is positional; `cube.test.ts` checks it against a known state.
 */
export function cubeFromFacelets(facelets: string): Cube | null {
  if (facelets.length !== 54) return null;
  const at = (face: Face, row: number, col: number): Face => {
    const f = FACELET_FACES.indexOf(face);
    return facelets[f * 9 + row * 3 + col] as Face;
  };
  if (!FACELET_FACES.every((f) => at(f, 1, 1) === f)) return null;   // centres must be home
  const sticker = (key: string): Face | null => {
    const cell = CELLS.get(key);
    return cell ? at(cell[0], cell[1], cell[2]) : null;
  };

  const cube = solved();
  for (let p = 0; p < 12; p++) {
    const faces = EDGE_POS[p]!.map((f) => sticker(`e${p}:${f}`));
    const piece = EDGE_POS.findIndex((home) => home.every((f) => faces.includes(f)));
    if (piece < 0) return null;
    cube.ep[p] = piece;
    cube.eo[p] = faces[0] === EDGE_POS[piece]![0] ? 0 : 1;
  }
  for (let p = 0; p < 8; p++) {
    const faces = CORNER_POS[p]!.map((f) => sticker(`c${p}:${f}`));
    const piece = CORNER_POS.findIndex((home) => home.every((f) => faces.includes(f)));
    const o = faces.findIndex((f) => f === 'U' || f === 'D');
    if (piece < 0 || o < 0) return null;
    cube.cp[p] = piece;
    cube.co[p] = o;
  }
  return cube;
}
