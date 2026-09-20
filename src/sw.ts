/**
 * inphner: the service worker (built to public/sw.js by tools/build.mjs, which
 * injects the build hash and the file lists below).
 *
 * The shell is precached on install, so a reload works offline straight away.
 * The rest of the build (cubing.js's scramblers and worker, Chart.js, the
 * trainer) is warmed in the background once the page tells us it's idle —
 * timing a solve offline needs a scrambler, and those chunks are megabytes we
 * don't want competing with first paint.
 *
 * A new build lands in a new cache and waits: the page shows "A new version is
 * ready" and only then sends 'skip-waiting'. Taking over silently would leave
 * the open page asking for chunks that no longer exist.
 */
import { cacheName, staleCaches, strategyFor } from './pwa/strategy.ts';

declare const __BUILD__: string;
declare const __SHELL__: string[];
declare const __CHUNKS__: string[];

interface SwEvent extends Event { waitUntil(p: Promise<unknown>): void }
interface SwFetchEvent extends SwEvent { request: Request; respondWith(r: Response | Promise<Response>): void }
interface SwMessageEvent extends SwEvent { data: unknown }

declare const self: {
  addEventListener(type: 'install' | 'activate', cb: (e: SwEvent) => void): void;
  addEventListener(type: 'fetch', cb: (e: SwFetchEvent) => void): void;
  addEventListener(type: 'message', cb: (e: SwMessageEvent) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  registration: { scope: string };
};

const CACHE = cacheName(__BUILD__);
const SHELL = __SHELL__;
const CHUNKS = __CHUNKS__;
const scope = self.registration.scope;
const shellDoc = `${scope}index.html`;

/** cache.addAll() is all-or-nothing; one missing file shouldn't cost us the install. */
async function fill(urls: readonly string[], concurrency = 6): Promise<void> {
  const cache = await caches.open(CACHE);
  const queue = [...urls];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      if (await cache.match(url, { ignoreSearch: true })) continue;
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res.ok) await cache.put(url, res);
      } catch { /* offline or gone: the fetch handler will try again later */ }
    }
  });
  await Promise.all(workers);
}

async function fromCache(request: Request): Promise<Response | undefined> {
  const cache = await caches.open(CACHE);
  return cache.match(request, { ignoreSearch: true });
}

async function store(request: Request, res: Response): Promise<void> {
  if (!res.ok || res.status === 206) return;
  const cache = await caches.open(CACHE);
  await cache.put(request, res.clone());
}

/** Cache first: these URLs are content-hashed or ?v=-stamped, so a hit is never stale. */
async function cacheFirst(request: Request): Promise<Response> {
  const hit = await fromCache(request);
  if (hit) return hit;
  const res = await fetch(request);
  void store(request, res).catch(() => {});
  return res;
}

/**
 * Network first: the shell documents, so a new build is picked up at once.
 * A 404 or a 500 counts as a failure too — a server that is up but broken
 * shouldn't take the app down when we hold a good copy.
 */
async function networkFirst(request: Request, fallback?: string): Promise<Response> {
  const cached = async () => await fromCache(request)
    ?? (fallback ? await fromCache(new Request(fallback)) : undefined);
  try {
    const res = await fetch(request);
    if (res.ok) {
      void store(request, res).catch(() => {});
      return res;
    }
    return (await cached()) ?? res;
  } catch (err) {
    const hit = await cached();
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil(fill(SHELL));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(staleCaches(names, __BUILD__).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const strategy = strategyFor(e.request, scope);
  if (strategy === 'passthrough') return;
  if (strategy === 'cached') e.respondWith(cacheFirst(e.request));
  else if (strategy === 'shell') e.respondWith(networkFirst(e.request, shellDoc));
  else e.respondWith(networkFirst(e.request));
});

self.addEventListener('message', (e) => {
  const type = (e.data as { type?: string } | null)?.type;
  if (type === 'warm') e.waitUntil(fill(CHUNKS));
  else if (type === 'skip-waiting') void self.skipWaiting();
});
