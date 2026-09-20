/**
 * inphner: how the service worker treats a request. PURE (no caches, no
 * fetch), so the routing has tests instead of a "reload and hope" loop.
 *
 * - passthrough: not ours to cache (other methods, other origins, sw.js).
 * - shell:       a navigation; answer with the cached index.html when offline.
 * - fresh:       network first, cache as the fallback (index.html, manifest).
 * - cached:      cache first, then the network (everything content-hashed or
 *                ?v=-stamped: js, css, icons).
 */
export type Strategy = 'passthrough' | 'shell' | 'fresh' | 'cached';

export interface RequestLike {
  method: string;
  /** Fetch request mode; 'navigate' is a page load. */
  mode?: string;
  url: string;
}

/** The names of the app-shell documents, relative to the scope. */
const FRESH = ['', 'index.html', 'manifest.webmanifest'];

export function strategyFor(req: RequestLike, scope: string): Strategy {
  if (req.method !== 'GET') return 'passthrough';
  if (!req.url.startsWith(scope)) return 'passthrough';
  const path = req.url.slice(scope.length).split(/[?#]/)[0]!;
  if (path === 'sw.js') return 'passthrough';
  if (req.mode === 'navigate') return 'shell';
  if (FRESH.includes(path)) return 'fresh';
  return 'cached';
}

export function cacheName(build: string): string {
  return `inphner-${build}`;
}

/** Caches from older builds (and only ours). */
export function staleCaches(names: readonly string[], build: string): string[] {
  return names.filter((n) => n.startsWith('inphner-') && n !== cacheName(build));
}
