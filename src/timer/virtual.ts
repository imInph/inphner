/**
 * inphner: the virtual cube's key map. PURE.
 *
 * The layout is csTimer's (cs0x7f/cstimer, src/js/twisty/twistynnn.js,
 * generateCubeKeyMapping), read by physical key position (KeyboardEvent.code)
 * so it sits under the same fingers on any keyboard layout. Each key turns
 * layers `from`…`to` of a face, counted from that face (1 = the face itself).
 *
 * Like csTimer, the left and right hands have a depth: 3 / 4 move the left
 * hand's turns one layer out / in, 8 / 7 the right hand's, and Space puts both
 * back to 1. On a 3x3 a depth of 2 turns L and R into wide turns.
 */
import type { Face } from '../scramble/nxn.ts';

export interface LayerMove { face: Face; from: number; to: number; dir: 1 | -1 }
export interface Hands { left: number; right: number }

export const DEFAULT_HANDS: Hands = { left: 1, right: 1 };

type Entry = [from: number, to: number, face: Face, dir: 1 | -1];

/** csTimer's table, as a function of the hands' depth and the cube size. */
function table(n: number, { left: l, right: r }: Hands): Record<string, Entry> {
  return {
    KeyI: [1, r, 'R', 1], KeyK: [1, r, 'R', -1],
    KeyW: [1, 1, 'B', 1], KeyO: [1, 1, 'B', -1],
    KeyS: [1, 1, 'D', 1], KeyL: [1, 1, 'D', -1],
    KeyD: [1, l, 'L', 1], KeyE: [1, l, 'L', -1],
    KeyJ: [1, 1, 'U', 1], KeyF: [1, 1, 'U', -1],
    KeyH: [1, 1, 'F', 1], KeyG: [1, 1, 'F', -1],
    Semicolon: [1, n, 'U', 1], KeyA: [1, n, 'U', -1],
    KeyU: [1, r + 1, 'R', 1], KeyR: [1, l + 1, 'L', -1],
    KeyM: [1, r + 1, 'R', -1], KeyV: [1, l + 1, 'L', 1],
    KeyT: [1, n, 'L', -1], KeyY: [1, n, 'R', 1],
    KeyN: [1, n, 'R', -1], KeyB: [1, n, 'L', 1],
    Period: [r + 1, r + 1, 'R', 1], KeyX: [l + 1, l + 1, 'L', -1],
    Digit5: [l + 1, l + 1, 'L', 1], Digit6: [r + 1, r + 1, 'R', -1],
    Digit1: [2, n - 1, 'F', -1], Digit2: [2, n - 1, 'U', -1],
    Digit9: [2, n - 1, 'U', 1], Digit0: [2, n - 1, 'F', 1],
    KeyP: [1, n, 'F', 1], KeyQ: [1, n, 'F', -1],
    KeyZ: [1, 2, 'D', 1], KeyC: [1, 2, 'U', -1],
    Comma: [1, 2, 'U', 1], Slash: [1, 2, 'D', -1],
  };
}

/** The keyboard as the key map sheet draws it: four rows of ten. */
export const KEY_ROWS: [code: string, label: string][][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => [`Digit${d}`, d]),
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map((k) => [`Key${k}`, k]),
  [...['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'].map((k): [string, string] => [`Key${k}`, k]), ['Semicolon', ';']],
  [...['Z', 'X', 'C', 'V', 'B', 'N', 'M'].map((k): [string, string] => [`Key${k}`, k]),
    ['Comma', ','], ['Period', '.'], ['Slash', '/']],
];

/** The move a key makes, or null (not a turning key, or no such layer on this cube). */
export function keyMove(code: string, n: number, hands: Hands = DEFAULT_HANDS): LayerMove | null {
  const e = table(n, hands)[code];
  if (!e) return null;
  const [from, to, face, dir] = e;
  if (from > to || to > n) return null;
  return { face, from, to, dir };
}

/** The hands after a depth key (3 4 7 8, Space), or null for any other key. */
export function handsAfter(code: string, n: number, hands: Hands): Hands | null {
  const max = Math.max(1, n - 1);
  if (code === 'Digit3') return { ...hands, left: Math.max(1, hands.left - 1) };
  if (code === 'Digit4') return { ...hands, left: Math.min(hands.left + 1, max) };
  if (code === 'Digit7') return { ...hands, right: Math.min(hands.right + 1, max) };
  if (code === 'Digit8') return { ...hands, right: Math.max(1, hands.right - 1) };
  if (code === 'Space') return { ...DEFAULT_HANDS };
  return null;
}

/** A whole-cube turn: it moves no piece, so it never starts the clock. */
export function isRotation(m: LayerMove, n: number): boolean {
  return m.from === 1 && m.to === n;
}

const OPPOSITE: Record<Face, Face> = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };
const POSITIVE: Record<Face, boolean> = { R: true, U: true, F: true, L: false, D: false, B: false };
const ROTATION: Record<Face, string> = { R: 'x', L: 'x', U: 'y', D: 'y', F: 'z', B: 'z' };
/** M turns like L, E like D, S like F. */
const SLICE: Record<Face, [string, 1 | -1]> = {
  L: ['M', 1], R: ['M', -1], D: ['E', 1], U: ['E', -1], F: ['S', 1], B: ['S', -1],
};

const prime = (dir: number) => (dir === 1 ? '' : "'");

/**
 * WCA / SiGN notation for a move, as `scramble/nxn.ts` parses it. A block of
 * inner layers that touches neither face (5 / 0 on a 5x5) has no single name,
 * so it is written as the wide turn and the smaller wide turn undone.
 */
export function moveName(m: LayerMove, n: number): string {
  const { face, from, to, dir } = m;
  if (from === 1 && to === n) return ROTATION[face] + prime(POSITIVE[face] ? dir : -dir);
  if (from === to) {
    if (from === 1) return face + prime(dir);
    if (from === n) return OPPOSITE[face] + prime(-dir);
    if (n % 2 === 1 && from === (n + 1) / 2) {
      const [letter, sense] = SLICE[face];
      return letter + prime(dir * sense);
    }
    return `${from}${face}${prime(dir)}`;
  }
  if (to === n) return moveName({ face: OPPOSITE[face], from: 1, to: n - from + 1, dir: dir === 1 ? -1 : 1 }, n);
  const wide = (k: number, d: number) => (k === 1 ? face : k === 2 ? `${face}w` : `${k}${face}w`) + prime(d);
  if (from === 1) return wide(to, dir);
  return `${wide(to, dir)} ${wide(from - 1, -dir)}`;
}
