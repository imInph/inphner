import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { cacheName, staleCaches, strategyFor, orderFor } from './strategy.ts';

const SCOPE = 'http://localhost/inphner/';
const at = (url: string, extra: { method?: string; mode?: string } = {}) =>
  strategyFor({ method: extra.method ?? 'GET', mode: extra.mode ?? 'no-cors', url }, SCOPE);

test('only same-origin GETs inside the scope are ours', () => {
  assert.equal(at(`${SCOPE}app.css`, { method: 'POST' }), 'passthrough');
  assert.equal(at('https://example.com/app.css'), 'passthrough');
  assert.equal(at('http://localhost/inphub/app.css'), 'passthrough');
});

test('the service worker never caches itself', () => {
  assert.equal(at(`${SCOPE}sw.js`), 'passthrough');
});

test('a page load is answered from the shell', () => {
  assert.equal(at(SCOPE, { mode: 'navigate' }), 'shell');
  assert.equal(at(`${SCOPE}#timer`, { mode: 'navigate' }), 'shell');
});

test('the shell documents are network first, the hashed assets cache first', () => {
  assert.equal(at(SCOPE), 'fresh');
  assert.equal(at(`${SCOPE}index.html`), 'fresh');
  assert.equal(at(`${SCOPE}manifest.webmanifest`), 'fresh');
  assert.equal(at(`${SCOPE}app.css?v=7ee1c9ae43`), 'cached');
  assert.equal(at(`${SCOPE}js/chunks/chart-267ADA5B.js`), 'cached');
  assert.equal(at(`${SCOPE}icons/icon-512.png`), 'cached');
});

test('a query string never changes the decision', () => {
  assert.equal(at(`${SCOPE}index.html?v=1`), 'fresh');
  assert.equal(at(`${SCOPE}?utm=1`), 'fresh');
});

test('only our own caches from other builds are stale', () => {
  const names = ['inphner-aaa', 'inphner-bbb', 'inphub-assets', 'workbox'];
  assert.deepEqual(staleCaches(names, 'bbb'), ['inphner-aaa']);
  assert.equal(cacheName('bbb'), 'inphner-bbb');
});

test('offline, only content-hashed files were already cache-first; now the shell is too', () => {
  assert.equal(orderFor('cached', true), 'cache-first');
  assert.equal(orderFor('cached', false), 'cache-first');
  assert.equal(orderFor('shell', true), 'network-first');
  assert.equal(orderFor('fresh', true), 'network-first');
  // Offline these must not reach out: on iOS a doomed fetch raises a system alert.
  assert.equal(orderFor('shell', false), 'cache-first');
  assert.equal(orderFor('fresh', false), 'cache-first');
});
