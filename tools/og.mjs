/**
 * inphner: render the link-preview card (tools/og.html) to public/og.png (1200×630).
 *
 * macOS's Quick Look (qlmanage, as in icons.mjs) renders the page with WebKit,
 * glass and all, but always onto a square 1200×1200 canvas. The card is
 * centred vertically in it, so a centred 630px crop (sips) is exactly the card.
 * Run: node tools/og.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'inphner-og-'));
try {
  execFileSync('qlmanage', ['-t', '-s', '1200', '-o', tmp, join(root, 'tools', 'og.html')], { stdio: 'ignore' });
  const png = join(tmp, 'og.html.png');
  execFileSync('sips', ['-c', '630', '1200', png], { stdio: 'ignore' });
  renameSync(png, join(root, 'public', 'og.png'));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log('[inphner] wrote public/og.png');
