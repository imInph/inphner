/**
 * inphner: copy public/ into XAMPP's htdocs so it is served at
 * http://localhost/inphner/, the same origin as inphub (http://localhost/inphub/).
 * Same origin is what lets the first-run appearance fallback read inphub.* keys.
 *
 * A copy, not a symlink: Apache runs as a different user and cannot traverse
 * the home directory. Override the target with INPHNER_DEPLOY_DIR.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
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
console.log(`[inphner] synced public/ → ${target}`);
