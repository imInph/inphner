/**
 * inphner: an N×N×N sticker simulator (2x2 … 7x7) for the scramble preview
 * net. Pure, unit-tested. Each sticker has an integer position and a face
 * normal; a turn rotates every sticker in the turned layers about the face
 * axis. Coordinates: x → R, y → U, z → F. On an N-cube sticker centres sit
 * at odd/even offsets -(N-1)…(N-1) (step 2) and ±N on their face's axis.
 *
 * Notation (WCA / SiGN): R U F L D B, ' and 2, Rw (2 layers), 3Rw (3 layers),
 * 2R (the 2nd layer only), r = Rw, M E S (odd cubes), x y z.
 */

export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export const FACES: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

type Vec = [number, number, number];
interface Sticker { p: Vec; n: Vec; color: Face }

/** Face → [axis index, sign]. */
const FACE_AXIS: Record<Face, [0 | 1 | 2, 1 | -1]> = {
  R: [0, 1], L: [0, -1], U: [1, 1], D: [1, -1], F: [2, 1], B: [2, -1],
};

export interface CubeState {
  n: number;
  stickers: Sticker[];
}

export function solvedCube(n: number): CubeState {
  const stickers: Sticker[] = [];
  for (const face of FACES) {
    const [axis, sign] = FACE_AXIS[face];
    const [a, b] = [0, 1, 2].filter((i) => i !== axis) as [number, number];
    for (let i = -(n - 1); i <= n - 1; i += 2) {
      for (let j = -(n - 1); j <= n - 1; j += 2) {
        const p: Vec = [0, 0, 0];
        p[axis] = sign * n;
        p[a] = i;
        p[b] = j;
        const nrm: Vec = [0, 0, 0];
        nrm[axis] = sign;
        stickers.push({ p, n: nrm, color: face });
      }
    }
  }
  return { n, stickers };
}

/** +90° (right-hand) about +axis. */
function rot90(v: Vec, axis: number): Vec {
  const [x, y, z] = v;
  if (axis === 0) return [x, -z, y];
  if (axis === 1) return [z, y, -x];
  return [-y, x, z];
}

function rotate(v: Vec, axis: number, quarter: number): Vec {
  let out = v;
  for (let i = 0; i < quarter; i++) out = rot90(out, axis);
  return out;
}

interface Turn { axis: 0 | 1 | 2; sign: 1 | -1; layers: (layer: number) => boolean; turns: number }

/** Layer index (1 = outermost) of a sticker as seen from the face (axis, sign). */
function layerOf(s: Sticker, axis: number, sign: number, n: number): number {
  const c = s.p[axis]! * sign;
  if (c === n) return 1;
  if (c === -n) return n;
  return (n - 1 - c) / 2 + 1;
}

function applyTurn(state: CubeState, t: Turn): void {
  // Clockwise seen from the face = -90° about its outward normal.
  const q = (((-t.sign * t.turns) % 4) + 4) % 4;
  if (q === 0) return;
  for (const s of state.stickers) {
    if (!t.layers(layerOf(s, t.axis, t.sign, state.n))) continue;
    s.p = rotate(s.p, t.axis, q);
    s.n = rotate(s.n, t.axis, q);
  }
}

const MOVE_RE = /^(\d*)([URFDLBurfdlbxyzMES])(w?)(\d*)('?)$/;

/** Parse one move for an N-cube; null when it isn't valid there. */
export function parseMove(token: string, n: number): Turn | null {
  const m = MOVE_RE.exec(token);
  if (!m) return null;
  const [, prefix, letter, wide, amountStr, prime] = m as unknown as [string, string, string, string, string, string];
  const amount = amountStr ? Number(amountStr) : 1;
  const turns = prime ? -amount : amount;

  if (letter === 'x' || letter === 'y' || letter === 'z') {
    if (prefix || wide) return null;
    const face: Face = letter === 'x' ? 'R' : letter === 'y' ? 'U' : 'F';
    const [axis, sign] = FACE_AXIS[face];
    return { axis, sign, layers: () => true, turns };
  }
  if (letter === 'M' || letter === 'E' || letter === 'S') {
    if (n % 2 === 0 || prefix || wide) return null;
    const face: Face = letter === 'M' ? 'L' : letter === 'E' ? 'D' : 'F';
    const [axis, sign] = FACE_AXIS[face];
    const mid = (n + 1) / 2;
    return { axis, sign, layers: (l) => l === mid, turns };
  }
  const lower = letter === letter.toLowerCase();
  const face = letter.toUpperCase() as Face;
  const [axis, sign] = FACE_AXIS[face];
  let depth = prefix ? Number(prefix) : 0;
  if (depth > n) return null;
  if (wide || lower) {
    if (lower && wide) return null;
    const width = depth || 2;
    if (width > n) return null;
    return { axis, sign, layers: (l) => l <= width, turns };
  }
  if (depth) return { axis, sign, layers: (l) => l === depth, turns };
  return { axis, sign, layers: (l) => l === 1, turns };
}

/** Apply a scramble; returns false (state untouched) when any token doesn't parse for this N. */
export function applyScramble(state: CubeState, scramble: string): boolean {
  const tokens = scramble.split(/\s+/).filter(Boolean);
  const turns = tokens.map((t) => parseMove(t, state.n));
  if (turns.some((t) => t === null)) return false;
  for (const t of turns) applyTurn(state, t!);
  return true;
}

/**
 * Face grids for the net, rows top→bottom and cols left→right as the face is
 * seen in the standard cross layout (U on top of F, L F R B in a row, D below).
 */
export function faceGrids(state: CubeState): Record<Face, Face[][]> {
  const n = state.n;
  const grids = {} as Record<Face, Face[][]>;
  for (const f of FACES) grids[f] = Array.from({ length: n }, () => Array<Face>(n).fill(f));
  const idx = (v: number) => (v + (n - 1)) / 2;
  const rev = (v: number) => (n - 1 - v) / 2;
  for (const s of state.stickers) {
    const [x, y, z] = s.p;
    const [nx, ny, nz] = s.n;
    let face: Face, row: number, col: number;
    if (ny === 1) { face = 'U'; row = idx(z); col = idx(x); }
    else if (ny === -1) { face = 'D'; row = rev(z); col = idx(x); }
    else if (nz === 1) { face = 'F'; row = rev(y); col = idx(x); }
    else if (nz === -1) { face = 'B'; row = rev(y); col = rev(x); }
    else if (nx === 1) { face = 'R'; row = rev(y); col = rev(z); }
    else { face = 'L'; row = rev(y); col = idx(z); }
    grids[face][row]![col] = s.color;
  }
  return grids;
}

export function isSolved(state: CubeState): boolean {
  const g = faceGrids(state);
  return FACES.every((f) => g[f].every((row) => row.every((c) => c === row[0] && c === g[f][0]![0])));
}

/** Size of an NxN event, or 0 for other puzzles. */
export function cubeSize(event: string): number {
  const m = /^([2-7])\1\1/.exec(event);
  if (m) return Number(m[1]);
  return ['lse', '2gen', '3gen', 'roux', 'cross', 'f2l', 'll', '333len'].includes(event) ? 3 : 0;
}
