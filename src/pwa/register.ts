/**
 * inphner: service worker registration and the update prompt.
 *
 * Registration waits for `load` so it never competes with first paint, and the
 * rest of the build is warmed when the browser next goes idle. An update is
 * offered, never forced: reloading mid-solve would be the one unforgivable bug.
 *
 * The one exception is a page nobody has touched yet. Opening inphner from a
 * search result used to greet you with "a new version is ready": the old worker
 * served the old build, and the update check that followed found the new one.
 * Before the first key or tap there is nothing to lose, so the update is taken
 * then and there, and the page reloads straight into the new build.
 */
import { toast } from '../ui/toast.ts';

let touched = false;
let reloading = false;
let busy: () => boolean = () => false;
for (const type of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(type, () => { touched = true; }, { capture: true, once: true, passive: true });
}

const RELOADED = 'inphner.sw-reloaded';

/** A reload we made in the last 30 s, so an update that somehow reappears on every load can't loop. */
function reloadedRecently(): boolean {
  try { return Date.now() - Number(sessionStorage.getItem(RELOADED) ?? 0) < 30_000; } catch { return true; }
}

function reload(): void {
  try { sessionStorage.setItem(RELOADED, String(Date.now())); } catch { /* the guard just won't apply */ }
  location.reload();
}

/** Nothing typed, tapped or timing yet: a reload costs this page nothing. */
const untouched = (): boolean => !touched && !busy() && !reloadedRecently();

/** Activate the waiting worker and reload once it controls the page. */
function apply(worker: ServiceWorker): void {
  reloading = true;
  navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
  worker.postMessage({ type: 'skip-waiting' });
}

function offerUpdate(worker: ServiceWorker | null): void {
  if (untouched()) {
    if (worker) apply(worker); else reload();
    return;
  }
  toast('A new version of inphner is ready.', {
    persistent: true,
    action: {
      label: 'Reload',
      run: () => { if (worker) apply(worker); else reload(); },
    },
  });
}

function warmWhenIdle(): void {
  const send = () => {
    if (!navigator.onLine) return; // Nothing to warm with, and iOS would say so loudly.
    navigator.serviceWorker.controller?.postMessage({ type: 'warm' });
  };
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(send, { timeout: 8000 });
  else window.setTimeout(send, 3000);
}

async function start(): Promise<void> {
  // register() runs an update check, which offline can only fail — and on iOS
  // that raises a system "Turn Off Airplane Mode" alert over the running app.
  // A worker that already controls this page keeps serving it either way, so
  // we wait until there is a network to check against.
  if (!navigator.onLine && navigator.serviceWorker.controller) {
    window.addEventListener('online', () => { void start(); }, { once: true });
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const next = reg.installing;
      if (!next) return;
      next.addEventListener('statechange', () => {
        // Without a controller this is the very first install, not an update.
        if (next.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(next);
      });
    });
    if (navigator.serviceWorker.controller) {
      warmWhenIdle();
      // Another tab took the update: this one is still running the old build,
      // whose chunks were just dropped from the cache. Reload it, or ask if it's in use.
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloading) offerUpdate(null);
      }, { once: true });
    } else navigator.serviceWorker.addEventListener('controllerchange', warmWhenIdle, { once: true });
  } catch { /* an unregistered app still works; it just won't run offline */ }
}

/** `isBusy` reports a solve or drill in progress (a Stackmat or smart cube can start one untouched). */
export function registerServiceWorker(isBusy: () => boolean): void {
  busy = isBusy;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (!('serviceWorker' in navigator) || (location.protocol !== 'https:' && !local)) return;
  if (document.readyState === 'complete') void start();
  else window.addEventListener('load', () => { void start(); }, { once: true });
}
