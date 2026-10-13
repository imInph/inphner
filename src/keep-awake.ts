/** Keep every visible page awake, independently of routes and timer state. */
let initialized = false;

export function initKeepAwake(): void {
  if (initialized || !navigator.wakeLock) return;
  initialized = true;
  let lock: WakeLockSentinel | null = null;
  let pending = false;
  let pageActive = true;
  let generation = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const visible = () => pageActive && document.visibilityState === 'visible';

  const release = (sentinel: WakeLockSentinel) => {
    void sentinel.release().catch(() => { /* Already released by the browser. */ });
  };

  const acquire = async () => {
    if (!visible() || lock || pending) return;
    clearTimeout(retry);
    pending = true;
    const requestedGeneration = generation;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      // A request can finish after the page was hidden or put in the back/forward cache.
      if (!visible() || requestedGeneration !== generation) {
        release(sentinel);
        return;
      }
      if (sentinel.released) return;
      lock = sentinel;
      sentinel.addEventListener('release', () => {
        if (lock !== sentinel) return;
        lock = null;
        // Avoid a tight loop if the OS repeatedly revokes the lock. A denied
        // request waits for a return to the page or a user gesture to try again.
        if (visible()) retry = setTimeout(() => { void acquire(); }, 1000);
      }, { once: true });
    } catch {
      // Unsupported policy, low power mode, or a denied request must not interrupt a solve.
    } finally {
      pending = false;
      if (requestedGeneration !== generation && visible()) void acquire();
    }
  };

  const suspend = () => {
    generation++;
    clearTimeout(retry);
    const previous = lock;
    lock = null;
    if (previous) release(previous);
  };

  document.addEventListener('visibilitychange', () => {
    if (visible()) void acquire();
    else suspend();
  });
  window.addEventListener('pagehide', () => {
    pageActive = false;
    suspend();
  });
  window.addEventListener('pageshow', () => {
    pageActive = true;
    void acquire();
  });
  // Also recover from an initial denial on browsers requiring interaction.
  document.addEventListener('pointerdown', () => { void acquire(); }, { capture: true, passive: true });
  document.addEventListener('keydown', () => { void acquire(); }, { capture: true });
  void acquire();
}
