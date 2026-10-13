/** Lifecycle regression harness: no real screen or browser permissions needed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

const code = transformSync(readFileSync(new URL('./keep-awake.ts', import.meta.url), 'utf8'), {
  loader: 'ts', format: 'cjs',
}).code;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function harness(request?: () => Promise<Sentinel>) {
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const window = new EventTarget();
  const locks: Sentinel[] = [];
  let requests = 0;
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const module = { exports: {} as { initKeepAwake: () => void } };
  runInNewContext(code, {
    exports: module.exports, module, document, window,
    navigator: { wakeLock: { request: (type: string) => {
      assert.equal(type, 'screen');
      requests++;
      if (request) return request();
      const lock = new Sentinel(); locks.push(lock); return Promise.resolve(lock);
    } } },
    setTimeout: (fn: () => void) => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const emit = (target: EventTarget, name: string) => target.dispatchEvent(new Event(name));
  return { document, window, locks, init: module.exports.initKeepAwake, emit,
    requests: () => requests,
    visibility: (state: string) => { document.visibilityState = state; emit(document, 'visibilitychange'); },
    retry: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); },
  };
}
class Sentinel extends EventTarget {
  released = false;
  releaseCalls = 0;
  async release() {
    this.releaseCalls++;
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
}

test('one lock survives navigation and repeated initialization / interaction', async () => {
  const h = harness(); h.init(); h.init(); await flush();
  h.emit(h.window, 'hashchange'); h.emit(h.document, 'pointerdown'); h.emit(h.document, 'keydown');
  await flush(); assert.equal(h.requests(), 1); assert.equal(h.locks[0].released, false);
});
test('hide releases the lock; returning and restoring from page cache reacquire', async () => {
  const h = harness(); h.init(); await flush(); h.visibility('hidden'); await flush();
  assert.equal(h.locks[0].released, true);
  h.visibility('visible'); await flush(); assert.equal(h.requests(), 2);
  h.emit(h.window, 'pagehide'); await flush(); assert.equal(h.locks[1].released, true);
  h.emit(h.document, 'pointerdown'); await flush(); assert.equal(h.requests(), 2);
  h.emit(h.window, 'pageshow'); await flush(); assert.equal(h.requests(), 3);
});
test('spontaneous release retries; denial waits for interaction instead of looping', async () => {
  const lock = new Sentinel(); let attempts = 0;
  const h = harness(() => ++attempts === 1 ? Promise.resolve(lock) : Promise.reject(new Error('low power')));
  h.init(); await flush(); await lock.release(); h.retry(); await flush();
  assert.equal(h.requests(), 2); h.retry(); await flush(); assert.equal(h.requests(), 2);
  h.emit(h.document, 'keydown'); await flush(); assert.equal(h.requests(), 3);
});
test('pending requests are deduplicated and late locks are released after hiding', async () => {
  let resolve!: (lock: Sentinel) => void;
  const h = harness(() => new Promise(r => { resolve = r; })); h.init();
  h.emit(h.document, 'pointerdown'); h.emit(h.document, 'keydown'); assert.equal(h.requests(), 1);
  h.visibility('hidden'); const lock = new Sentinel(); resolve(lock); await flush();
  assert.equal(lock.released, true); assert.equal(h.requests(), 1);
});
test('hide and show during a pending request discard the stale lock and request a fresh one', async () => {
  let resolve!: (lock: Sentinel) => void;
  const h = harness(() => new Promise(r => { resolve = r; })); h.init();
  h.visibility('hidden'); h.visibility('visible');
  const stale = new Sentinel(); resolve(stale); await flush();
  assert.equal(stale.released, true); assert.equal(h.requests(), 2);
  const current = new Sentinel(); resolve(current); await flush();
  h.emit(h.document, 'pointerdown'); await flush(); assert.equal(h.requests(), 2);
});
