/**
 * inphner: bundle src/ into public/js/ and cache-bust index.html.
 *
 * esbuild (not bare tsc) because cubing.js imports bare specifiers (three,
 * random-uint-below…) and spawns its search worker from a chunk; an import
 * map can't reach inside a module worker. Output stays plain ES modules with
 * code splitting, so cubing's worker and Chart.js load only when needed.
 *
 * Type checking is `tsc` (run by `npm run build` before this script).
 *
 *   node tools/build.mjs           one build
 *   node tools/build.mjs --watch   rebuild + sync to XAMPP on every change
 */
import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync, watch, readdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const watchMode = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const options = {
  entryPoints: [join(root, 'src/main.ts')],
  outdir: join(pub, 'js'),
  bundle: true,
  splitting: true,
  format: 'esm',
  target: 'es2022',
  // The entry keeps a fixed name (index.html points at it, with ?v=); every
  // chunk is content-hashed, so a new build can never pair with a stale chunk.
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]',
  assetNames: 'assets/[name]-[hash]',
  minify: !watchMode,
  sourcemap: true,
  legalComments: 'linked',
  logLevel: 'warning',
  metafile: true,
};

function hashOf(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 10);
}

/**
 * cubing.js first asks for its worker by the unhashed name
 * (chunks/search-worker-entry.js) and only then falls back; give it that
 * name too so no request fails.
 */
function aliasWorker() {
  const dir = join(pub, 'js', 'chunks');
  const hashed = readdirSync(dir).find((f) => /^search-worker-entry-[A-Z0-9]+\.js$/.test(f));
  if (hashed) copyFileSync(join(dir, hashed), join(dir, 'search-worker-entry.js'));
}

/** Rewrite ?v= on app.css and js/main.js in index.html to the files' content hashes. */
function stamp() {
  const htmlPath = join(pub, 'index.html');
  const before = readFileSync(htmlPath, 'utf8');
  const after = before
    .replace(/(href="app\.css)(\?v=[^"]*)?"/, `$1?v=${hashOf(join(pub, 'app.css'))}"`)
    .replace(/(src="js\/main\.js)(\?v=[^"]*)?"/, `$1?v=${hashOf(join(pub, 'js/main.js'))}"`);
  if (after !== before) writeFileSync(htmlPath, after);
}

/**
 * Build the two extra bundles that are not part of the app's module graph:
 * the Tools solver worker, and the service worker (which gets the build hash
 * and the two file lists it precaches injected).
 */
async function buildWorkers() {
  const jsDir = join(pub, 'js');
  const chunks = readdirSync(join(jsDir, 'chunks'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => `js/chunks/${f}`);
  const shell = [
    './', 'index.html', 'app.css', 'js/main.js', 'js/solver-worker.js', 'js/stackmat-worklet.js',
    'manifest.webmanifest',
    'icons/favicon.svg', 'icons/favicon-32.png', 'icons/apple-touch-icon.png',
    'icons/icon-512.png', 'icons/icon-maskable-512.png',
  ];
  for (const [entry, out] of [
    ['src/tools/solver-worker.ts', 'solver-worker.js'],
    ['src/timer/stackmat-worklet.ts', 'stackmat-worklet.js'],
  ]) {
    await esbuild.build({
      entryPoints: [join(root, entry)],
      outfile: join(jsDir, out),
      bundle: true,
      format: 'iife',
      target: 'es2022',
      minify: !watchMode,
      logLevel: 'warning',
    });
  }

  // One cache per build: the hash covers the entry, the worker, the stylesheet
  // and every chunk name (each of which is content-hashed itself).
  const build = createHash('sha256')
    .update(hashOf(join(jsDir, 'main.js')) + hashOf(join(jsDir, 'solver-worker.js'))
      + hashOf(join(jsDir, 'stackmat-worklet.js')) + hashOf(join(pub, 'app.css')) + chunks.join(','))
    .digest('hex').slice(0, 10);

  await esbuild.build({
    entryPoints: [join(root, 'src/sw.ts')],
    outfile: join(pub, 'sw.js'),
    bundle: true,
    format: 'iife',
    target: 'es2022',
    minify: !watchMode,
    logLevel: 'warning',
    define: {
      __BUILD__: JSON.stringify(build),
      __SHELL__: JSON.stringify(shell),
      __CHUNKS__: JSON.stringify(chunks),
    },
  });
}

function sync() {
  try {
    execFileSync('node', [join(root, 'tools/sync-xampp.mjs')], { stdio: 'inherit' });
  } catch {
    /* sync-xampp prints its own error */
  }
}

if (watchMode) {
  const ctx = await esbuild.context({
    ...options,
    plugins: [{
      name: 'after-build',
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length) return;
          aliasWorker();
          stamp();
          void buildWorkers().then(sync);
          console.log(`[inphner] rebuilt ${new Date().toLocaleTimeString()}`);
        });
      },
    }],
  });
  await ctx.watch();
  // CSS / HTML / static files are not part of the JS graph: watch them directly.
  let t = 0;
  watch(pub, { recursive: true }, (_event, file) => {
    if (!file || file.startsWith('js')) return;
    clearTimeout(t);
    t = setTimeout(() => { stamp(); sync(); }, 80);
  });
  console.log('[inphner] watching src/ and public/…');
} else {
  rmSync(join(pub, 'js'), { recursive: true, force: true });
  await esbuild.build(options);
  aliasWorker();
  stamp();
  await buildWorkers();
  console.log('[inphner] built public/js + workers');
}
