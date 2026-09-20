/**
 * inphner: drive the BUILT service worker (public/sw.js) through install,
 * warm-up, activate and an offline reload. The browser pane can't register a
 * service worker, so this harness gives it the few globals it uses — a
 * CacheStorage in a Map and a fetch that can be switched off — and checks that
 * a page load with the network gone is still answered from the cache.
 */
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { test } from 'node:test';

const SW = new URL('../../public/sw.js', import.meta.url).pathname;
const SCOPE = 'http://localhost/inphner/';

interface FakeEvent { waitUntil(p: Promise<unknown>): void }

function harness() {
  const server = new Map<string, string>();     // url -> body
  const store = new Map<string, Map<string, Response>>();
  let online = true;

  const cacheFor = (name: string) => {
    let c = store.get(name);
    if (!c) { c = new Map(); store.set(name, c); }
    return c;
  };
  // Relative URLs resolve against the worker's location, as they do in a browser.
  const key = (r: string | { url: string }) => new URL(typeof r === 'string' ? r : r.url, SCOPE).href;
  const caches = {
    open: async (name: string) => {
      const c = cacheFor(name);
      return {
        match: async (r: string | { url: string }, o?: { ignoreSearch?: boolean }) => {
          const k = key(r);
          if (c.has(k)) return c.get(k);
          if (!o?.ignoreSearch) return undefined;
          const bare = k.split('?')[0]!;
          return c.get(bare);
        },
        put: async (r: string | { url: string }, res: Response) => { c.set(key(r), res); },
      };
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
  };
  let fetches = 0;
  const fetchMock = async (r: string | { url: string }): Promise<Response> => {
    fetches++;
    if (!online) throw new TypeError('Failed to fetch');
    const url = key(r);
    const body = server.get(url.split('?')[0]!);
    return body === undefined ? new Response('missing', { status: 404 }) : new Response(body, { status: 200 });
  };

  const listeners = new Map<string, (e: unknown) => void>();
  const self = {
    addEventListener: (type: string, cb: (e: unknown) => void) => listeners.set(type, cb),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    registration: { scope: SCOPE },
    // Airplane mode: the worker reads this to stay off the network entirely.
    navigator: { get onLine() { return online; } },
  };
  const ctx = createContext({
    self, caches, fetch: fetchMock, Response, URL, console,
    Request: class { url: string; method = 'GET'; constructor(url: string) { this.url = url; } },
  });
  runInContext(readFileSync(SW, 'utf8'), ctx);

  const waited: Promise<unknown>[] = [];
  const event = (): FakeEvent => ({ waitUntil: (p) => { waited.push(p); } });

  return {
    server,
    store,
    setOnline: (v: boolean) => { online = v; },
    fetches: () => fetches,
    resetFetches: () => { fetches = 0; },
    async fire(type: 'install' | 'activate'): Promise<void> {
      const e = event();
      listeners.get(type)!(e);
      await Promise.all(waited.splice(0));
    },
    async message(data: unknown): Promise<void> {
      const e = { ...event(), data };
      listeners.get('message')!(e);
      await Promise.all(waited.splice(0));
    },
    /** The response the worker answers with, or null when it doesn't handle the request. */
    async request(url: string, init: { method?: string; mode?: string } = {}): Promise<Response | null> {
      let answer: Promise<Response> | Response | null = null;
      listeners.get('fetch')!({
        request: { url, method: init.method ?? 'GET', mode: init.mode ?? 'no-cors' },
        waitUntil: () => {},
        respondWith: (r: Promise<Response> | Response) => { answer = r; },
      });
      return answer === null ? null : await answer;
    },
    cacheNames: () => [...store.keys()],
  };
}

function seeded() {
  const h = harness();
  for (const path of ['', 'index.html', 'app.css', 'js/main.js', 'manifest.webmanifest',
    'icons/favicon.svg', 'icons/favicon-32.png', 'icons/apple-touch-icon.png',
    'icons/icon-512.png', 'icons/icon-maskable-512.png']) {
    h.server.set(SCOPE + path, `body:${path || 'root'}`);
  }
  // Serve the real chunk names, so the warm-up list is the one the build wrote.
  for (const f of readdirSync(new URL('../../public/js/chunks', import.meta.url).pathname)) {
    if (f.endsWith('.js')) h.server.set(`${SCOPE}js/chunks/${f}`, `body:${f}`);
  }
  return h;
}

test('the built service worker exists', () => {
  assert.ok(existsSync(SW), 'run `npm run build` first');
});

test('install precaches the shell, and warming adds the rest of the build', async () => {
  const h = seeded();
  await h.fire('install');

  const cache = h.store.get(h.cacheNames()[0]!)!;
  assert.ok(cache.has(`${SCOPE}index.html`), 'index.html is precached');
  assert.ok(cache.has(`${SCOPE}js/main.js`), 'the entry is precached');
  assert.ok(![...cache.keys()].some((k) => k.includes('/chunks/')), 'chunks wait for the warm-up');

  await h.message({ type: 'warm' });
  assert.ok([...cache.keys()].some((k) => k.includes('/chunks/')), 'warming caches the chunks');
});

test('activate drops caches from other builds', async () => {
  const h = seeded();
  h.store.set('inphner-old', new Map());
  h.store.set('inphub-assets', new Map());
  await h.fire('install');
  await h.fire('activate');
  assert.ok(!h.cacheNames().includes('inphner-old'), 'the previous build is gone');
  assert.ok(h.cacheNames().includes('inphub-assets'), "someone else's cache is left alone");
});

test('offline, a reload is answered from the cache', async () => {
  const h = seeded();
  await h.fire('install');
  await h.fire('activate');
  h.setOnline(false);

  const page = await h.request(SCOPE, { mode: 'navigate' });
  assert.equal(await page!.text(), 'body:root');

  const deepLink = await h.request(`${SCOPE}#timer`, { mode: 'navigate' });
  assert.equal(await deepLink!.text(), 'body:index.html', 'an unknown path falls back to the shell');

  const css = await h.request(`${SCOPE}app.css?v=abc123`);
  assert.equal(await css!.text(), 'body:app.css', 'the ?v= stamp still hits the cached file');

  const js = await h.request(`${SCOPE}js/main.js?v=abc123`);
  assert.equal(await js!.text(), 'body:js/main.js');
});

test('offline, a cached launch never touches the network', async () => {
  // The bug this guards: every launch asked the network first, so an iPhone in
  // airplane mode raised "Turn Off Airplane Mode or Use Wi-Fi to Access Data"
  // over a home-screen app that was about to work perfectly from the cache.
  const h = seeded();
  await h.fire('install');
  await h.fire('activate');
  await h.message({ type: 'warm' });
  h.setOnline(false);
  h.resetFetches();

  const page = await h.request(SCOPE, { mode: 'navigate' });
  assert.equal(await page!.text(), 'body:root');
  const manifest = await h.request(`${SCOPE}manifest.webmanifest`);
  assert.equal(await manifest!.text(), 'body:manifest.webmanifest');
  await h.request(`${SCOPE}app.css?v=abc123`);
  await h.message({ type: 'warm' });

  assert.equal(h.fetches(), 0, 'not one request left the device');
});

test('offline with nothing cached, the network is still the last resort', async () => {
  const h = seeded();
  await h.fire('install');
  h.setOnline(false);
  h.resetFetches();
  // Never cached, so failing loudly beats answering with nothing.
  await assert.rejects(() => h.request(`${SCOPE}js/chunks/never-seen.js`) as Promise<unknown>);
  assert.equal(h.fetches(), 1);
});

test('a broken server is treated like no server at all', async () => {
  const h = seeded();
  await h.fire('install');
  h.server.delete(`${SCOPE}index.html`);   // a half-deployed build: 404s
  const page = await h.request(`${SCOPE}index.html`);
  assert.equal(await page!.text(), 'body:index.html', 'the cached shell wins over a 404');
});

test('what the worker leaves alone', async () => {
  const h = seeded();
  await h.fire('install');
  assert.equal(await h.request(`${SCOPE}api`, { method: 'POST' }), null, 'writes are never touched');
  assert.equal(await h.request('https://example.com/x.js'), null, 'other origins are never touched');
  assert.equal(await h.request(`${SCOPE}sw.js`), null, 'the worker never caches itself');
});
