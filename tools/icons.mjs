/**
 * inphner: generate the favicon / app icons.
 *
 * The icon is the logo badge (inphner-prompt.md §B8) as a rounded square: the
 * default blue accent gradient (accent 55% → white, accent, accent-strong 85% →
 * black), the glass sheen over the top half, and a white 3×3 cube-face glyph.
 * PNGs are rasterised with macOS's Quick Look (qlmanage), so no image
 * dependency is needed. Run: npm run icons
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, renameSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

/** @param {{ maskable?: boolean }} opts */
function svg({ maskable = false } = {}) {
  // Precomputed colour-mix() stops for the blue accent (#3d8bff / #2a73e8).
  const a = '#95c1ff'; // color-mix(#3d8bff 55%, #fff)
  const b = '#3d8bff';
  const c = '#2462c5'; // color-mix(#2a73e8 85%, #000)
  const r = maskable ? 0 : 116;
  // Maskable icons keep the glyph inside the 80% safe zone.
  const cell = maskable ? 62 : 78;
  const gap = maskable ? 12 : 15;
  const size = cell * 3 + gap * 2;
  const x0 = (512 - size) / 2;
  let cells = '';
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const x = x0 + j * (cell + gap);
      const y = x0 + i * (cell + gap);
      cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${cell * 0.22}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/><stop offset=".48" stop-color="${b}"/><stop offset="1" stop-color="${c}"/>
    </linearGradient>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".48" stop-color="#fff" stop-opacity=".08"/><stop offset=".52" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="c"><rect width="512" height="512" rx="${r}"/></clipPath>
  </defs>
  <g clip-path="url(#c)">
    <rect width="512" height="512" fill="url(#g)"/>
    <rect width="512" height="512" fill="url(#s)"/>
    <g fill="#fff" fill-opacity=".94">${cells}</g>
  </g>
  ${maskable ? '' : `<rect x="3" y="3" width="506" height="506" rx="${r - 3}" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="6"/>`}
</svg>
`;
}

writeFileSync(join(out, 'favicon.svg'), svg());
writeFileSync(join(out, 'icon-maskable.svg'), svg({ maskable: true }));

const tmp = mkdtempSync(join(tmpdir(), 'inphner-icons-'));
function rasterise(name, source, px) {
  const src = join(tmp, `${name}.svg`);
  writeFileSync(src, source);
  execFileSync('qlmanage', ['-t', '-s', String(px), '-o', tmp, src], { stdio: 'ignore' });
  const png = readdirSync(tmp).find((f) => f.startsWith(`${name}.svg`) && f.endsWith('.png'));
  if (!png) throw new Error(`qlmanage produced no PNG for ${name}`);
  renameSync(join(tmp, png), join(out, `${name}.png`));
}
rasterise('favicon-32', svg(), 32);
rasterise('apple-touch-icon', svg({ maskable: true }), 180); // iOS rounds the corners itself
rasterise('icon-512', svg(), 512);
rasterise('icon-maskable-512', svg({ maskable: true }), 512);
rmSync(tmp, { recursive: true, force: true });
console.log('[inphner] icons written to public/icons');
