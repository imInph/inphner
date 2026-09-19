/**
 * inphner: scramble text helpers and random-move scramblers. Pure, unit-tested.
 * Random-STATE scrambles come from cubing.js (generator.ts); random-move ones
 * are for the training events that are defined by their move set (2GEN, 3GEN,
 * LSE, custom-length 3x3).
 */

export type Rng = () => number;

const AXIS: Record<string, string> = { R: 'x', L: 'x', M: 'x', U: 'y', D: 'y', E: 'y', F: 'z', B: 'z', S: 'z' };
const SUFFIX = ['', "'", '2'];

/**
 * `length` moves over `faces`: never the same face twice in a row, and never
 * three moves on one axis in a row (no "R L R"), the usual random-move rules.
 */
export function randomMoves(faces: string[], length: number, rng: Rng = Math.random): string[] {
  const out: string[] = [];
  let prevFace = '';
  let prevAxis = '';
  let axisRun = 0;
  while (out.length < length) {
    const face = faces[Math.floor(rng() * faces.length)]!;
    if (face === prevFace) continue;
    const axis = AXIS[face] ?? face;
    if (axis === prevAxis && axisRun >= 2) continue;
    // Same axis as the previous move: only allow when the faces differ (R L), not a third one.
    if (axis === prevAxis) {
      axisRun++;
    } else {
      axisRun = 1;
    }
    prevFace = face;
    prevAxis = axis;
    out.push(face + SUFFIX[Math.floor(rng() * 3)]!);
  }
  return out;
}

/** Quarter turns of a move token: R → 1, R' → 3, R2 → 2. */
export function quarterTurns(move: string): number {
  const m = /^[A-Za-z]+w?(\d*)('?)$/.exec(move);
  if (!m) return 0;
  const n = m[1] ? Number(m[1]) : 1;
  return ((m[2] ? -n : n) % 4 + 4) % 4;
}

function withTurns(face: string, q: number): string | null {
  return q === 0 ? null : face + (q === 1 ? '' : q === 2 ? '2' : "'");
}

/**
 * LSE (Roux last six edges): random <M, U> moves, then the U turns are made to
 * add up to a multiple of 4 so the corners (and blocks) end up solved.
 */
export function lseScramble(length = 20, rng: Rng = Math.random): string[] {
  const moves = randomMoves(['M', 'U'], length, rng);
  const uTotal = moves.filter((m) => m[0] === 'U').reduce((a, m) => a + quarterTurns(m), 0) % 4;
  if (uTotal === 0) return moves;
  const fix = (4 - uTotal) % 4;
  const last = moves[moves.length - 1]!;
  if (last[0] === 'U') {
    const merged = withTurns('U', (quarterTurns(last) + fix) % 4);
    moves.pop();
    if (merged) moves.push(merged);
  } else {
    moves.push(withTurns('U', fix)!);
  }
  return moves;
}

/** Tidy a scramble string: single spaces, "R2'" → "R2" (cubing.js inversions produce those). */
export function normalizeScramble(s: string): string {
  return s.replace(/(\w)2'/g, '$12').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

/**
 * Split a scramble into display tokens (one <span> each, so lines never break
 * inside a move). Square-1 keeps "(1, 0)" together; slashes are their own token.
 * Returns rows: Megaminx gets one row per WCA line (each ends in U or U').
 */
export function scrambleRows(scramble: string, event: string): string[][] {
  const lines = scramble.split('\n').map((l) => l.trim()).filter(Boolean);
  const tokenize = (line: string) => line.match(/\([^)]*\)|\/|[^\s/()]+/g) ?? [];
  if (event === 'minx' && lines.length <= 1) {
    const rows: string[][] = [];
    let row: string[] = [];
    for (const t of tokenize(lines[0] ?? '')) {
      row.push(t);
      if (t === 'U' || t === "U'") {
        rows.push(row);
        row = [];
      }
    }
    if (row.length) rows.push(row);
    return rows;
  }
  if (event === 'minx' || event === '333mbf') return lines.map(tokenize);
  return [lines.flatMap(tokenize)];
}

/** Move count for the length indicator (Square-1 counts twists, i.e. slashes). */
export function scrambleLength(scramble: string, event: string): number {
  if (!scramble.trim()) return 0;
  if (event === 'sq1') return (scramble.match(/\//g) ?? []).length;
  if (event === '333mbf') return scramble.split('\n').filter(Boolean).length;
  return scrambleRows(scramble, event).flat().filter((t) => t !== '/').length;
}
