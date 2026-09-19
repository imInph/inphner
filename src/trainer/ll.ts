/**
 * inphner: last-layer states for the trainer. Pure, unit-tested.
 *
 * An LL state is the four U-layer corners and edges: which piece sits at each
 * position and how it's twisted/flipped. Positions (cubing.js order):
 *   corners 0 UFR · 1 URB · 2 UBL · 3 ULF      edges 0 UF · 1 UR · 2 UB · 3 UL
 * Orientation 0 = the piece's U sticker is on the U face.
 *
 * Case identities are ENUMERATED, not recalled: every LL permutation (with
 * orientation solved) up to pre/post AUF gives exactly 21 PLL classes, and
 * every orientation pattern up to AUF gives exactly 57 OLL classes. Named
 * algorithms are only attached to a class after a test proves the alg really
 * produces it (see ll.test.ts), so a wrong or mislabelled alg can't ship.
 */
import { applyScramble, faceGrids, solvedCube, type Face } from '../scramble/nxn.ts';

export interface LL { cp: number[]; co: number[]; ep: number[]; eo: number[] }

export const SOLVED_LL: LL = { cp: [0, 1, 2, 3], co: [0, 0, 0, 0], ep: [0, 1, 2, 3], eo: [0, 0, 0, 0] };

/** Apply transformation `t` to state `s` (KPuzzle semantics: position i receives what was at t.p[i]). */
export function compose(s: LL, t: LL): LL {
  return {
    cp: t.cp.map((from) => s.cp[from]!),
    co: t.cp.map((from, i) => (s.co[from]! + t.co[i]!) % 3),
    ep: t.ep.map((from) => s.ep[from]!),
    eo: t.ep.map((from, i) => (s.eo[from]! + t.eo[i]!) % 2),
  };
}

/** The U move on the last layer (cubing.js: permutation [1, 2, 3, 0] on both orbits). */
export const U_MOVE: LL = { cp: [1, 2, 3, 0], co: [0, 0, 0, 0], ep: [1, 2, 3, 0], eo: [0, 0, 0, 0] };

export function uPower(k: number): LL {
  let s = SOLVED_LL;
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) s = compose(s, U_MOVE);
  return s;
}

const key = (s: LL) => `${s.cp.join('')}${s.co.join('')}${s.ep.join('')}${s.eo.join('')}`;

/** Every state reachable by U^a · s · U^b (the AUFs a solver can do before and after). */
export function aufVariants(s: LL): LL[] {
  const out: LL[] = [];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) out.push(compose(compose(uPower(a), s), uPower(b)));
  return out;
}

export function pllKey(s: LL): string {
  return aufVariants(s).map(key).sort()[0]!;
}

/** OLL class: the orientation pattern up to AUF (the permutation doesn't matter for OLL). */
export function ollKey(s: LL): string {
  const pats: string[] = [];
  for (let a = 0; a < 4; a++) {
    // Rotating the view by U: conjugate, then only orientation is compared.
    const r = compose(compose(uPower(a), s), uPower(-a));
    pats.push(r.co.join('') + r.eo.join(''));
  }
  return pats.sort()[0]!;
}

function permutations(n: number): number[][] {
  if (n === 1) return [[0]];
  const out: number[][] = [];
  for (const p of permutations(n - 1)) for (let i = 0; i <= p.length; i++) out.push([...p.slice(0, i), n - 1, ...p.slice(i)]);
  return out;
}

export function parity(p: number[]): number {
  let x = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i]! > p[j]!) x ^= 1;
  return x;
}

/** One representative per PLL class (solved excluded). */
export function enumeratePll(): LL[] {
  const reps = new Map<string, LL>();
  for (const cp of permutations(4)) for (const ep of permutations(4)) {
    if (parity(cp) !== parity(ep)) continue;
    const s: LL = { cp, co: [0, 0, 0, 0], ep, eo: [0, 0, 0, 0] };
    const k = pllKey(s);
    if (!reps.has(k)) reps.set(k, s);
  }
  reps.delete(pllKey(SOLVED_LL));
  return [...reps.values()];
}

/** One representative per OLL class (oriented excluded), permutation solved. */
export function enumerateOll(): LL[] {
  const reps = new Map<string, LL>();
  for (let c = 0; c < 81; c++) for (let e = 0; e < 16; e++) {
    const co = [c % 3, Math.floor(c / 3) % 3, Math.floor(c / 9) % 3, Math.floor(c / 27) % 3];
    const eo = [e & 1, (e >> 1) & 1, (e >> 2) & 1, (e >> 3) & 1];
    if (co.reduce((a, b) => a + b, 0) % 3 || eo.reduce((a, b) => a + b, 0) % 2) continue;
    const s: LL = { cp: [0, 1, 2, 3], co, ep: [0, 1, 2, 3], eo };
    const k = ollKey(s);
    if (!reps.has(k)) reps.set(k, s);
  }
  reps.delete(ollKey(SOLVED_LL));
  return [...reps.values()];
}

/* ------------------------------------------------------------- facelets */

// Faces around each U corner position, clockwise seen from outside, starting at U.
const CORNER_FACES: Face[][] = [['U', 'R', 'F'], ['U', 'B', 'R'], ['U', 'L', 'B'], ['U', 'F', 'L']];
const EDGE_FACES: Face[][] = [['U', 'F'], ['U', 'R'], ['U', 'B'], ['U', 'L']];

/** Sticker colours (as home faces) of an LL state: U face grid + the top row of each side, left→right seen from above. */
export interface LLFacelets { u: Face[][]; F: Face[]; R: Face[]; B: Face[]; L: Face[] }

export function facelets(s: LL): LLFacelets {
  const corner = new Map<string, Face>();
  const edge = new Map<string, Face>();
  for (let p = 0; p < 4; p++) {
    const piece = s.cp[p]!;
    for (let i = 0; i < 3; i++) corner.set(`${p}${CORNER_FACES[p]![(i + s.co[p]!) % 3]}`, CORNER_FACES[piece]![i]!);
    const e = s.ep[p]!;
    for (let i = 0; i < 2; i++) edge.set(`${p}${EDGE_FACES[p]![(i + s.eo[p]!) % 2]}`, EDGE_FACES[e]![i]!);
  }
  const c = (p: number, f: Face) => corner.get(`${p}${f}`)!;
  const e = (p: number, f: Face) => edge.get(`${p}${f}`)!;
  return {
    u: [
      [c(2, 'U'), e(2, 'U'), c(1, 'U')],
      [e(3, 'U'), 'U', e(1, 'U')],
      [c(3, 'U'), e(0, 'U'), c(0, 'U')],
    ],
    B: [c(2, 'B'), e(2, 'B'), c(1, 'B')],
    R: [c(1, 'R'), e(1, 'R'), c(0, 'R')],
    F: [c(3, 'F'), e(0, 'F'), c(0, 'F')],
    L: [c(2, 'L'), e(3, 'L'), c(3, 'L')],
  };
}

/* ------------------------------------------------------------ from an alg */

export function invertAlg(alg: string): string {
  return alg.trim().split(/\s+/).filter(Boolean).reverse().map((m) => {
    if (m.endsWith("2'")) return m.slice(0, -1);
    if (m.endsWith('2')) return m;
    if (m.endsWith("'")) return m.slice(0, -1);
    return `${m}'`;
  }).join(' ');
}


/**
 * The LL case an alg solves: apply its inverse to a solved cube and read the
 * last layer back (colours are normalised to the centres, so a trailing y is
 * fine). Returns null when the alg disturbs the first two layers.
 */
export function llFromAlg(alg: string): LL | null {
  const cube = solvedCube(3);
  if (!applyScramble(cube, invertAlg(alg))) return null;
  const g = faceGrids(cube);
  // Colour → the face it belongs to now (by the centre sticker).
  const home = new Map<Face, Face>();
  for (const f of ['U', 'D', 'F', 'B', 'R', 'L'] as Face[]) home.set(g[f][1]![1]!, f);
  const as = (c: Face) => home.get(c)!;
  // F2L intact: D face and the bottom two rows of every side.
  if (!g.D.flat().every((c) => as(c) === 'D')) return null;
  for (const f of ['F', 'R', 'B', 'L'] as Face[]) if (!g[f].slice(1).flat().every((c) => as(c) === f)) return null;
  // Top-row stickers of each side, left→right seen from the front of that face.
  const top = {
    U: g.U.map((r) => r.map(as)),
    F: g.F[0]!.map(as), R: g.R[0]!.map(as), B: g.B[0]!.map(as), L: g.L[0]!.map(as),
  };
  // Stickers per position, in CORNER_FACES / EDGE_FACES order.
  const cornerStickers: Face[][] = [
    [top.U[2]![2]!, top.R[0]!, top.F[2]!], // UFR: U, R (front-left of R face), F (right of F)
    [top.U[0]![2]!, top.B[0]!, top.R[2]!], // URB
    [top.U[0]![0]!, top.L[0]!, top.B[2]!], // UBL
    [top.U[2]![0]!, top.F[0]!, top.L[2]!], // ULF
  ];
  const edgeStickers: Face[][] = [
    [top.U[2]![1]!, top.F[1]!], [top.U[1]![2]!, top.R[1]!], [top.U[0]![1]!, top.B[1]!], [top.U[1]![0]!, top.L[1]!],
  ];
  const s: LL = { cp: [], co: [], ep: [], eo: [] };
  for (let p = 0; p < 4; p++) {
    const st = cornerStickers[p]!;
    const o = st.findIndex((f) => f === 'U' || f === 'D');
    if (o < 0) return null;
    // Rotate so index 0 is the U sticker; the other two identify the piece.
    const rot = [st[o]!, st[(o + 1) % 3]!, st[(o + 2) % 3]!];
    const piece = CORNER_FACES.findIndex((cf) => cf[1] === rot[1] && cf[2] === rot[2]);
    if (piece < 0) return null;
    s.cp.push(piece);
    s.co.push(o);
    const es = edgeStickers[p]!;
    const eu = es[0] === 'U' ? 0 : es[1] === 'U' ? 1 : -1;
    if (eu < 0) return null;
    const side = es[1 - eu]!;
    const epiece = EDGE_FACES.findIndex((ef) => ef[1] === side);
    if (epiece < 0) return null;
    s.ep.push(epiece);
    s.eo.push(eu);
  }
  return s;
}
