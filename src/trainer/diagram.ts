/**
 * inphner: case diagrams as SVG, sharp from 48 px to 160 px (vector, no
 * hairlines below 1 unit of a 100-unit viewBox).
 *
 *   LL (PLL/OLL): the standard top view: U face 3×3 with the side stickers as
 *   thin strips around it. PLL uses the WCA colours with yellow on top and
 *   arrows showing where each piece goes; OLL shows yellow vs grey only.
 *   F2L: a small front-right view (U on top, F and R below), last-layer
 *   pieces grey.
 */
import type { Face } from '../scramble/nxn.ts';
import { facelets, type LL } from './ll.ts';
import { f2lGrids, type Sticker } from './f2l.ts';
import type { State } from './cube3.ts';

/** Yellow on top, green in front (the usual solving view). */
const COLOUR: Record<Face, string> = {
  U: '#ffd500', D: '#ffffff', F: '#009b48', R: '#ff5800', B: '#0046ad', L: '#b71234',
};
const GREY = 'var(--fill-3)';
const STROKE = 'rgba(0,0,0,.35)';

let uid = 0;

export function llDiagram(s: LL, style: 'pll' | 'oll', label: string): string {
  const f = facelets(s);
  const colour = (x: Face) => (style === 'oll' ? (x === 'U' ? COLOUR.U : GREY) : COLOUR[x]);
  const cell = 22;
  const gap = 2;
  const x0 = 17;
  const strip = 7;
  const at = (i: number) => x0 + i * (cell + gap);
  const rect = (x: number, y: number, w: number, h: number, fill: string, r = 3.5) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${STROKE}" stroke-width=".8"/>`;
  let body = '';
  f.u.forEach((row, r) => row.forEach((x, c) => { body += rect(at(c), at(r), cell, cell, colour(x)); }));
  // Strips: B above, F below, L left, R right (left→right / top→bottom as seen from above).
  f.B.forEach((x, i) => { body += rect(at(i), x0 - strip - gap - 1, cell, strip, colour(x), 2); });
  f.F.forEach((x, i) => { body += rect(at(i), at(3) - gap + gap + 1, cell, strip, colour(x), 2); });
  f.L.forEach((x, i) => { body += rect(x0 - strip - gap - 1, at(i), strip, cell, colour(x), 2); });
  f.R.forEach((x, i) => { body += rect(at(3) + 1, at(i), strip, cell, colour(x), 2); });

  if (style === 'pll') {
    // Arrows: the piece at a position goes to its home position when the alg is done.
    const cornerCell = [[2, 2], [0, 2], [0, 0], [2, 0]]; // UFR URB UBL ULF → [row, col]
    const edgeCell = [[2, 1], [1, 2], [0, 1], [1, 0]]; // UF UR UB UL
    const centre = ([r, c]: number[]) => [at(c!) + cell / 2, at(r!) + cell / 2] as const;
    const id = `ah${++uid}`;
    const pairs = new Set<string>();
    const lines: string[] = [];
    const arrow = (from: number[], to: number[], both: boolean) => {
      const [x1, y1] = centre(from);
      const [x2, y2] = centre(to);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      const k = 7 / len; // stop short of the sticker centres
      lines.push(`<line x1="${(x1 + dx * k).toFixed(1)}" y1="${(y1 + dy * k).toFixed(1)}" x2="${(x2 - dx * k).toFixed(1)}" y2="${(y2 - dy * k).toFixed(1)}"
        marker-end="url(#${id})" ${both ? `marker-start="url(#${id})"` : ''}/>`);
    };
    const add = (perm: number[], cells: number[][], kind: string) => {
      perm.forEach((piece, pos) => {
        if (piece === pos) return;
        const swap = perm[piece] === pos;
        const key = `${kind}${Math.min(pos, piece)}-${Math.max(pos, piece)}`;
        if (swap) {
          if (pairs.has(key)) return;
          pairs.add(key);
        }
        arrow(cells[pos]!, cells[piece]!, swap);
      });
    };
    add(s.cp, cornerCell, 'c');
    add(s.ep, edgeCell, 'e');
    body += `<defs><marker id="${id}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse">
      <path d="M0 0L10 5L0 10z" fill="rgba(16,19,26,.85)"/></marker></defs>
      <g stroke="rgba(16,19,26,.85)" stroke-width="2.2" stroke-linecap="round">${lines.join('')}</g>`;
  }
  return `<svg class="case-diagram" viewBox="0 0 106 106" role="img" aria-label="${label}">${body}</svg>`;
}

export function f2lDiagram(state: State, label: string): string {
  const g = f2lGrids(state);
  // Face letters are home faces: 'U' (last layer) draws yellow, 'D' (cross) white.
  const colour = (x: Sticker) => (x === 'X' ? GREY : COLOUR[x]);
  const cell = 14;
  const gap = 1.6;
  const rect = (x: number, y: number, fill: string) =>
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cell}" height="${cell}" rx="2.5" fill="${fill}" stroke="${STROKE}" stroke-width=".7"/>`;
  let body = '';
  const ox = 8;
  const uy = 4;
  const fy = uy + 3 * (cell + gap) + 3;
  const rx = ox + 3 * (cell + gap) + 3;
  g.U.forEach((row, r) => row.forEach((x, c) => { body += rect(ox + c * (cell + gap), uy + r * (cell + gap), colour(x)); }));
  g.F.forEach((row, r) => row.forEach((x, c) => { body += rect(ox + c * (cell + gap), fy + r * (cell + gap), colour(x)); }));
  g.R.forEach((row, r) => row.forEach((x, c) => { body += rect(rx + c * (cell + gap), fy + r * (cell + gap), colour(x)); }));
  return `<svg class="case-diagram" viewBox="0 0 106 106" role="img" aria-label="${label}">${body}</svg>`;
}
