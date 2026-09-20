/**
 * inphner: the web manifest is hand-written, so check the things a typo would
 * break silently: valid JSON, relative paths (the app lives under /inphner/),
 * and icons that are actually on disk.
 */
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const dir = new URL('../../public/', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(`${dir}manifest.webmanifest`, 'utf8')) as {
  name: string; start_url: string; scope: string; display: string;
  background_color: string; theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
  shortcuts: { name: string; url: string }[];
};

test('it installs under whatever path the app is served from', () => {
  assert.equal(manifest.start_url, '.');
  assert.equal(manifest.scope, '.');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.name, 'inphner');
  for (const icon of manifest.icons) assert.ok(!icon.src.startsWith('/'), `${icon.src} is absolute`);
  for (const s of manifest.shortcuts) assert.ok(s.url.startsWith('#'), `${s.url} is not a hash route`);
});

test('every icon it promises exists, including a maskable one', () => {
  for (const icon of manifest.icons) assert.ok(existsSync(dir + icon.src), `missing ${icon.src}`);
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'), 'no maskable icon');
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512'), 'no 512px icon');
});

test('the splash colours are the ones the page itself uses in the dark theme', () => {
  const css = readFileSync(`${dir}app.css`, 'utf8');
  const html = readFileSync(`${dir}index.html`, 'utf8');
  // The splash screen is the page's own background, B4's dark --bg.
  assert.match(css, new RegExp(`--bg:\\s*${manifest.background_color};`));
  // The browser chrome matches <meta name="theme-color"> (B3.4), which is not --bg.
  assert.ok(html.includes(`content="${manifest.theme_color}"`), 'theme_color differs from the meta tag');
});
