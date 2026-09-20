/**
 * inphner: service worker registration and the update prompt.
 *
 * Registration waits for `load` so it never competes with first paint, and the
 * rest of the build is warmed when the browser next goes idle. An update is
 * offered, never forced: reloading mid-solve would be the one unforgivable bug.
 */
import { toast } from '../ui/toast.ts';

function offerUpdate(worker: ServiceWorker): void {
  toast('A new version of inphner is ready.', {
    persistent: true,
    action: {
      label: 'Reload',
      run: () => {
        navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
        worker.postMessage({ type: 'skip-waiting' });
      },
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
    if (navigator.serviceWorker.controller) warmWhenIdle();
    else navigator.serviceWorker.addEventListener('controllerchange', warmWhenIdle, { once: true });
  } catch { /* an unregistered app still works; it just won't run offline */ }
}

export function registerServiceWorker(): void {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (!('serviceWorker' in navigator) || (location.protocol !== 'https:' && !local)) return;
  if (document.readyState === 'complete') void start();
  else window.addEventListener('load', () => { void start(); }, { once: true });
}
