/**
 * inphner: the BLD memo helper (A9). PURE.
 *
 * Letters are not typed in from memory: Speffz is defined as "each face's four
 * stickers, clockwise from the top-left as the face is seen in the standard
 * net", and that is exactly the grid layout in trainer/cube3.ts, so the scheme
 * is generated from it (U → A B C D, L → E F G H, F → I…, R → M…, B → Q…,
 * D → U V W X, for corners and edges alike).
 *
 * Tracing is the usual one: look at the sticker sitting in the buffer, say
 * where it belongs, go there, repeat. When the cycle closes on the buffer
 * piece, break into the first unsolved sticker that hasn't been visited.
 */
import { CELLS, type Cube } from './cube.ts';
import { CORNER_POS, EDGE_POS } from '../trainer/cube3.ts';
import type { Face } from '../scramble/nxn.ts';

/** A sticker is its slot × the facelet index within that slot. */
export const EDGE_STICKERS = 24;
export const CORNER_STICKERS = 24;

export interface Scheme {
  /** Letter per edge sticker (slot * 2 + facelet). */
  edges: string[];
  /** Letter per corner sticker (slot * 3 + facelet). */
  corners: string[];
}

const FACE_ORDER: Face[] = ['U', 'L', 'F', 'R', 'B', 'D'];
const CORNER_CELLS = [[0, 0], [0, 2], [2, 2], [2, 0]];
const EDGE_CELLS = [[0, 1], [1, 2], [2, 1], [1, 0]];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWX';

/** (face, row, col) → sticker index, for edges and corners. */
function cellIndex(): { edges: Map<string, number>; corners: Map<string, number> } {
  const edges = new Map<string, number>();
  const corners = new Map<string, number>();
  for (const [key, cell] of CELLS) {
    const [face, row, col] = cell;
    const [kind, rest] = [key[0]!, key.slice(1)];
    const slot = Number(rest.split(':')[0]);
    const at = `${face}${row}${col}`;
    if (kind === 'e') edges.set(at, slot * 2 + EDGE_POS[slot]!.indexOf(face));
    else corners.set(at, slot * 3 + CORNER_POS[slot]!.indexOf(face));
  }
  return { edges, corners };
}

export function speffz(): Scheme {
  const cells = cellIndex();
  const scheme: Scheme = { edges: Array<string>(EDGE_STICKERS).fill(''), corners: Array<string>(CORNER_STICKERS).fill('') };
  FACE_ORDER.forEach((face, f) => {
    CORNER_CELLS.forEach(([row, col], i) => {
      scheme.corners[cells.corners.get(`${face}${row}${col}`)!] = LETTERS[f * 4 + i]!;
    });
    EDGE_CELLS.forEach(([row, col], i) => {
      scheme.edges[cells.edges.get(`${face}${row}${col}`)!] = LETTERS[f * 4 + i]!;
    });
  });
  return scheme;
}

export const SPEFFZ = speffz();

/** Sticker index of a named location, e.g. edge "UF" facelet 0, corner "UFR". */
export function edgeSticker(slot: number, facelet = 0): number { return slot * 2 + facelet; }
export function cornerSticker(slot: number, facelet = 0): number { return slot * 3 + facelet; }

export interface Memo {
  edges: string[];
  corners: string[];
  /** Edge targets are odd: the solve needs a parity fix. */
  parity: boolean;
  /** Pieces already home but flipped/twisted, as their buffer-side letters. */
  flipped: string[];
  twisted: string[];
}

interface Orbit {
  count: number;       // pieces
  facelets: number;    // 2 or 3
  perm: number[];      // piece in each slot
  ori: number[];       // orientation of each slot
  letters: string[];
}

/** Where the sticker currently sitting at `sticker` belongs. */
function homeOf(o: Orbit, sticker: number): number {
  const slot = Math.floor(sticker / o.facelets);
  const facelet = sticker % o.facelets;
  const piece = o.perm[slot]!;
  const from = (facelet - o.ori[slot]! + o.facelets * 2) % o.facelets;
  return piece * o.facelets + from;
}

/**
 * Trace one orbit from its buffer, breaking into the first unsolved piece in
 * letter order. A piece that is home but turned becomes the usual two shots at
 * its own stickers; `flipped` / `twisted` additionally name them, because they
 * are worth spotting before you start.
 */
function trace(o: Orbit, buffer: number): { targets: string[]; broken: string[] } {
  const bufferSlot = Math.floor(buffer / o.facelets);
  const targets: string[] = [];
  const broken: string[] = [];
  const visited = new Set<number>([bufferSlot]);
  // Break-ins go in letter order, the way they are written down.
  const byLetter = o.letters.map((letter, sticker) => ({ letter, sticker }))
    .sort((a, b) => a.letter.localeCompare(b.letter));

  const breakIn = (): number => {
    for (const { sticker } of byLetter) {
      const slot = Math.floor(sticker / o.facelets);
      // A piece that is home but turned is not solved: it is broken into like
      // any other, which is the usual two shots at its own stickers.
      if (slot === bufferSlot || visited.has(slot)) continue;
      if (o.perm[slot] === slot && o.ori[slot] === 0) continue;
      return sticker;
    }
    return -1;
  };

  let cur = buffer;
  // A cycle closes when the next shot would land on the piece it started from:
  // that piece is then back where it belongs, whichever of its stickers it is.
  let cycleSlot = bufferSlot;
  for (let guard = 0; guard < 64; guard++) {
    const target = homeOf(o, cur);
    const slot = Math.floor(target / o.facelets);
    if (slot === cycleSlot) {
      // The buffer's own cycle needs no last shot — its piece lands home by
      // itself. A cycle we broke into is closed by shooting at it once more.
      if (cycleSlot !== bufferSlot) targets.push(o.letters[target]!);
      const next = breakIn();
      if (next < 0) break;
      cycleSlot = Math.floor(next / o.facelets);
      visited.add(cycleSlot);
      broken.push(o.letters[next]!);
      targets.push(o.letters[next]!);
      cur = next;
      continue;
    }
    visited.add(slot);
    targets.push(o.letters[target]!);
    cur = target;
  }
  return { targets, broken };
}

export interface MemoOptions {
  scheme?: Scheme;
  /** Sticker indices; UF (edges) and UFR (corners) by default. */
  edgeBuffer?: number;
  cornerBuffer?: number;
}

export function memoFor(cube: Cube, opts: MemoOptions = {}): Memo {
  const scheme = opts.scheme ?? SPEFFZ;
  const edgeBuffer = opts.edgeBuffer ?? edgeSticker(0);   // UF
  const cornerBuffer = opts.cornerBuffer ?? cornerSticker(0); // UFR
  const edges: Orbit = { count: 12, facelets: 2, perm: cube.ep, ori: cube.eo, letters: scheme.edges };
  const corners: Orbit = { count: 8, facelets: 3, perm: cube.cp, ori: cube.co, letters: scheme.corners };

  const e = trace(edges, edgeBuffer);
  const c = trace(corners, cornerBuffer);
  const flipped: string[] = [];
  for (let slot = 0; slot < 12; slot++) {
    if (cube.ep[slot] === slot && cube.eo[slot] !== 0) flipped.push(scheme.edges[slot * 2]!);
  }
  const twisted: string[] = [];
  for (let slot = 0; slot < 8; slot++) {
    if (cube.cp[slot] === slot && cube.co[slot] !== 0) twisted.push(scheme.corners[slot * 3]!);
  }
  return { edges: e.targets, corners: c.targets, parity: e.targets.length % 2 === 1, flipped, twisted };
}

/** Memo letters in pairs, as they are memorised. */
export function pairs(targets: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < targets.length; i += 2) out.push(targets.slice(i, i + 2).join(''));
  return out;
}
