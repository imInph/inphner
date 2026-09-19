/**
 * inphner: a tiny promise wrapper over IndexedDB (no ORM).
 *
 * Stores:
 *   sessions  keyPath id
 *   solves    keyPath id · index "session" (sessionId) · index "sessionTime" ([sessionId, createdAt])
 *   meta      key/value (settings that must survive a storage clear of localStorage, backups…)
 *
 * Every record carries a client UUID and updatedAt so a later PHP/MySQL sync
 * can merge ({ok,data}/{ok,error} API, see inphner-prompt.md §A1).
 */

const DB_NAME = 'inphner';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('solves')) {
        const solves = db.createObjectStore('solves', { keyPath: 'id' });
        solves.createIndex('session', 'sessionId');
        solves.createIndex('sessionTime', ['sessionId', 'createdAt']);
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgraded the schema: close so it isn't blocked.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB is unavailable.'));
    req.onblocked = () => reject(new Error('IndexedDB is blocked by another inphner tab.'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted.'));
  });
}

export type StoreName = 'sessions' | 'solves' | 'meta';

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return promisify(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return promisify(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}

/** All records of an index in key order (e.g. a session's solves by time). */
export async function getAllByRange<T>(store: StoreName, index: string, range: IDBKeyRange): Promise<T[]> {
  const db = await openDb();
  return promisify(db.transaction(store).objectStore(store).index(index).getAll(range)) as Promise<T[]>;
}

export async function countByIndex(store: StoreName, index: string, key: IDBValidKey | IDBKeyRange): Promise<number> {
  const db = await openDb();
  return promisify(db.transaction(store).objectStore(store).index(index).count(key));
}

/** The last `limit` records of an index range, newest first. */
export async function lastByRange<T>(store: StoreName, index: string, range: IDBKeyRange, limit: number): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const out: T[] = [];
    const req = db.transaction(store).objectStore(store).index(index).openCursor(range, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || out.length >= limit) return resolve(out);
      out.push(cursor.value as T);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/** Put and delete in one transaction (atomic). */
export async function write(
  ops: { store: StoreName; put?: unknown[]; del?: IDBValidKey[]; putKeyed?: [IDBValidKey, unknown][] }[],
): Promise<void> {
  const db = await openDb();
  const names = [...new Set(ops.map((o) => o.store))];
  const tx = db.transaction(names, 'readwrite');
  for (const op of ops) {
    const os = tx.objectStore(op.store);
    for (const v of op.put ?? []) os.put(v);
    for (const [k, v] of op.putKeyed ?? []) os.put(v, k);
    for (const k of op.del ?? []) os.delete(k);
  }
  await done(tx);
}

export async function clearAll(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['sessions', 'solves', 'meta'], 'readwrite');
  tx.objectStore('sessions').clear();
  tx.objectStore('solves').clear();
  tx.objectStore('meta').clear();
  await done(tx);
}

/** Ask the browser not to evict our data under storage pressure. */
export async function persist(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
