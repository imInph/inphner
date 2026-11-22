/**
 * inphner: copy public/ into XAMPP's htdocs so it is served at
 * http://localhost/inphner/, the same origin as inphub (http://localhost/inphub/).
 * Same origin is what lets the first-run appearance fallback read inphub.* keys.
 *
 * A copy, not a symlink: Apache runs as a different user and cannot traverse
 * the home directory. Override the target with INPHNER_DEPLOY_DIR.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.env.INPHNER_DEPLOY_DIR || '/Applications/XAMPP/htdocs/inphner';

if (!existsSync(dirname(target))) {
  console.warn(`[inphner] ${dirname(target)} not found, skipping the XAMPP sync.`);
  process.exit(0);
}
mkdirSync(target, { recursive: true });
execFileSync('rsync', ['-a', '--delete', join(root, 'public') + '/', target + '/'], { stdio: 'inherit' });

// rsync -a copies the source's modes, and on an external drive those can be
// 600/700, which Apache (another user) can't read. macOS's rsync ignores
// --chmod, so open the copy up here: directories 755, files 644.
(function openUp(dir) {
  chmodSync(dir, 0o755);
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) openUp(p);
    else if (e.isFile()) chmodSync(p, 0o644);
  }
})(target);
console.log(`[inphner] synced public/ → ${target}`);
