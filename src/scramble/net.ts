/**
 * inphner: the 2D net of a scrambled N×N cube as SVG. Pure (string out).
 * Faces in a cross (U over F; L F R B; D under F), sticker gap 2px, sticker
 * radius 18% of the sticker size, standard WCA colours (white top, green
 * front) with a 1px rgba(0,0,0,.35) inner stroke so white reads on light glass.
 */
import { applyScramble, faceGrids, solvedCube, type Face } from './nxn.ts';
import { PIECE_LAYOUT } from './pieces.ts';
import { OPPOSITE } from './states.ts';

/** A practice step and the colour its solver holds on the bottom. */
export interface NetFocus { step: 'cross' | 'f2l'; colour: Face }

/**
 * Which stickers matter for a practice step (true = keep, false = dim). Pieces
 * are judged by their colours, wherever they are now: for the cross, the four
 * edges carrying the cross colour; for F2L, those plus the corners carrying it
 * and the edges carrying neither it nor the last-layer colour. Centres always
 * stay, they're how you orient.
 */
export function importantStickers(grids: Record<Face, Face[][]>, focus: NetFocus): Record<Face, boolean[][]> {
  const colours = new Map<string, Face[]>();
  for (const [face, cells] of Object.entries(PIECE_LAYOUT) as [Face, (string | null)[]][]) {
    cells.forEach((slot, i) => {
      if (slot) colours.set(slot, [...(colours.get(slot) ?? []), grids[face][Math.floor(i / 3)]![i % 3]!]);
    });
  }
  const x = focus.colour;
  const ll = OPPOSITE[x];
  const keep = (slot: string): boolean => {
    const c = colours.get(slot)!;
    if (c.length === 2) return c.includes(x) || (focus.step === 'f2l' && !c.includes(ll));
    return focus.step === 'f2l' && c.includes(x);
  };
  const out = {} as Record<Face, boolean[][]>;
  for (const [face, cells] of Object.entries(PIECE_LAYOUT) as [Face, (string | null)[]][]) {
    out[face] = [0, 1, 2].map((r) => [0, 1, 2].map((c) => {
      const slot = cells[r * 3 + c];
      return !slot || keep(slot);
    }));
  }
  return out;
}

export const STICKER: Record<Face, string> = {
  U: '#ffffff', D: '#ffd500', F: '#009b48', B: '#0046ad', R: '#b71234', L: '#ff5800',
};

const LAYOUT: Record<Face, [number, number]> = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };

export function netSvg(n: number, scramble: string, width = 232, focus?: NetFocus): string {
  const state = solvedCube(n);
  const valid = applyScramble(state, scramble);
  const grids = faceGrids(state);
  const kept = focus && n === 3 && valid ? importantStickers(grids, focus) : null;
  const gap = 2;
  const faceGap = 5;
  const face = (width - 3 * faceGap) / 4;
  const s = (face - (n - 1) * gap) / n;
  const r = +(s * 0.18).toFixed(2);
  const height = face * 3 + faceGap * 2;
  let body = '';
  for (const f of Object.keys(LAYOUT) as Face[]) {
    const [fx, fy] = LAYOUT[f];
    const ox = fx * (face + faceGap);
    const oy = fy * (face + faceGap);
    grids[f].forEach((row, ri) => row.forEach((c, ci) => {
      const x = ox + ci * (s + gap) + 0.5;
      const y = oy + ri * (s + gap) + 0.5;
      body += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(s - 1).toFixed(2)}" height="${(s - 1).toFixed(2)}" rx="${r}" fill="${STICKER[c]}"${kept && !kept[f][ri]![ci] ? ' class="dim"' : ''}/>`;
    }));
  }
  const label = valid ? `Scrambled ${n}x${n} net` : 'This scramble has moves the preview can\'t show';
  return `<svg class="net" viewBox="0 0 ${width} ${height.toFixed(2)}" width="${width}" height="${height.toFixed(0)}" role="img" aria-label="${label}">
    <g stroke="rgba(0,0,0,.35)" stroke-width="1">${body}</g></svg>`;
}
