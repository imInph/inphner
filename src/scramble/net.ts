/**
 * inphner: the 2D net of a scrambled N×N cube as SVG. Pure (string out).
 * Faces in a cross (U over F; L F R B; D under F), sticker gap 2px, sticker
 * radius 18% of the sticker size, standard WCA colours (white top, green
 * front) with a 1px rgba(0,0,0,.35) inner stroke so white reads on light glass.
 */
import { applyScramble, faceGrids, solvedCube, type Face } from './nxn.ts';

export const STICKER: Record<Face, string> = {
  U: '#ffffff', D: '#ffd500', F: '#009b48', B: '#0046ad', R: '#b71234', L: '#ff5800',
};

const LAYOUT: Record<Face, [number, number]> = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };

export function netSvg(n: number, scramble: string, width = 232): string {
  const state = solvedCube(n);
  const valid = applyScramble(state, scramble);
  const grids = faceGrids(state);
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
      body += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(s - 1).toFixed(2)}" height="${(s - 1).toFixed(2)}" rx="${r}" fill="${STICKER[c]}"/>`;
    }));
  }
  const label = valid ? `Scrambled ${n}x${n} net` : 'This scramble has moves the preview can\'t show';
  return `<svg class="net" viewBox="0 0 ${width} ${height.toFixed(2)}" width="${width}" height="${height.toFixed(0)}" role="img" aria-label="${label}">
    <g stroke="rgba(0,0,0,.35)" stroke-width="1">${body}</g></svg>`;
}
