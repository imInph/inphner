/**
 * inphner: Google Drive sync. Signing in, keeping the access token fresh, and
 * the sync cycle itself. The merging is pure and lives in merge.ts.
 *
 * A cycle: list the app folder → download only the other devices' files that
 * changed since last time → merge them into this browser → upload this
 * device's file if anything is new since its last upload.
 *
 * - Runs on boot, ~30 s after a local change, every 3 minutes while visible,
 *   on return to the page and on coming back online.
 * - NEVER while offline: no request at all (see "Offline must not touch the
 *   network" in CLAUDE.md), and Google's sign-in script only loads when the
 *   Settings card is shown.
 * - Never applies a merge while a solve or a drill is in progress: it waits.
 * - Cycles are serialised across tabs with a Web Lock.
 */
import { get, write } from '../db/idb.ts';
import { applySync, syncSnapshot, uuid } from '../store.ts';
import { download, DriveError, gzip, listFiles, remove, upload, type DriveFile } from './drive.ts';
import { buildSyncDoc, fingerprint, mergeStates, parseSyncDoc, type SyncDoc } from './merge.ts';

/** Fill these in once the Google Cloud client and the worker exist (see sync-worker/README.md). */
export const GOOGLE_CLIENT_ID = '962636826593-eluo0t25sr51s3hftefemmbra8td7n0b.apps.googleusercontent.com';
export const SYNC_WORKER = 'https://sync.inphner.com';

const SCOPE = 'openid email https://www.googleapis.com/auth/drive.appdata';
const CONFIG_KEY = 'sync:config';

interface Config {
  sealed: string;
  email: string;
  deviceId: string;
  /** fileId → modifiedTime already merged. */
  seen: Record<string, string>;
  /** Fingerprint of what this device last uploaded. */
  uploaded: string;
  ownFileId: string;
  lastSync: number;
  /** At least one cycle completed (merge.ts: firstSync). */
  synced: boolean;
}

export type SyncPhase = 'off' | 'idle' | 'syncing' | 'error' | 'reconnect' | 'unconfigured';
export interface SyncStatus { phase: SyncPhase; email: string; lastSync: number; message: string }

let cfg: Config | null = null;
let status: SyncStatus = { phase: GOOGLE_CLIENT_ID ? 'off' : 'unconfigured', email: '', lastSync: 0, message: '' };
let token = { value: '', exp: 0 };
let busy: () => boolean = () => false;
let applying = false;

export function syncStatus(): SyncStatus {
  return status;
}

function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  window.dispatchEvent(new Event('inphner:sync'));
}

async function saveConfig(): Promise<void> {
  if (cfg) await write([{ store: 'meta', putKeyed: [[CONFIG_KEY, cfg]] }]);
  else await write([{ store: 'meta', del: [CONFIG_KEY] }]);
}

/* ------------------------------------------------------------------ token */

async function worker<T>(path: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(SYNC_WORKER + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => ({})) as T };
}

class NeedsSignIn extends Error {}

async function accessToken(): Promise<string> {
  if (token.value && Date.now() < token.exp - 60_000) return token.value;
  if (!cfg) throw new NeedsSignIn();
  const r = await worker<{ accessToken?: string; expiresIn?: number }>('/refresh', { sealed: cfg.sealed });
  if (r.status === 401) throw new NeedsSignIn();
  if (r.status !== 200 || !r.data.accessToken) throw new Error('The sync service did not answer.');
  token = { value: r.data.accessToken, exp: Date.now() + (r.data.expiresIn ?? 3600) * 1000 };
  return token.value;
}

/* ---------------------------------------------------------------- sign in */

interface CodeClient { requestCode(): void }
interface Gis {
  accounts: { oauth2: { initCodeClient(o: {
    client_id: string; scope: string; ux_mode: 'popup'; prompt?: string;
    callback: (r: { code?: string; error?: string }) => void;
    error_callback?: (e: { type?: string }) => void;
  }): CodeClient } };
}

let gis: Promise<Gis> | null = null;

/**
 * Load Google's sign-in script ahead of the click: the popup has to open
 * inside the click itself or the browser blocks it. Called when the sync
 * card is shown and nobody is signed in.
 */
export function preloadSignIn(): void {
  if (!GOOGLE_CLIENT_ID || cfg || !navigator.onLine) return;
  gis ??= new Promise<Gis>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve((window as unknown as { google: Gis }).google);
    s.onerror = () => { gis = null; reject(new Error('Could not reach Google.')); };
    document.head.append(s);
  });
  gis.catch(() => {});
}

function requestCode(g: Gis, consent: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    g.accounts.oauth2.initCodeClient({
      client_id: GOOGLE_CLIENT_ID, scope: SCOPE, ux_mode: 'popup', ...(consent ? { prompt: 'consent' } : {}),
      callback: (r) => (r.code ? resolve(r.code) : reject(new Error(r.error === 'access_denied' ? 'Sign-in was cancelled.' : 'Google sign-in failed.'))),
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Sign-in was cancelled.' : 'The sign-in window was blocked. Allow pop-ups for inphner and try again.')),
    }).requestCode();
  });
}

/** Sign in with Google (from a click) and run the first sync. */
export async function signIn(consent = false): Promise<void> {
  if (!GOOGLE_CLIENT_ID) return;
  preloadSignIn();
  try {
    if (!gis) throw new Error('You need to be online to sign in.');
    const code = await requestCode(await gis, consent);
    const r = await worker<{ accessToken?: string; expiresIn?: number; sealed?: string; email?: string }>('/exchange', { code });
    // Google sends the long-lived key only on first consent: ask once more, explicitly.
    if (r.status === 409 && !consent) return signIn(true);
    if (r.status !== 200 || !r.data.sealed || !r.data.accessToken) throw new Error('Signing in with Google did not finish.');
    const old = cfg;
    cfg = {
      sealed: r.data.sealed, email: r.data.email ?? '', deviceId: old?.deviceId || uuid(),
      seen: old?.seen ?? {}, uploaded: '', ownFileId: old?.ownFileId ?? '', lastSync: old?.lastSync ?? 0, synced: old?.synced ?? false,
    };
    token = { value: r.data.accessToken, exp: Date.now() + (r.data.expiresIn ?? 3600) * 1000 };
    await saveConfig();
    setStatus({ phase: 'idle', email: cfg.email, message: '' });
    await syncNow();
  } catch (e) {
    setStatus({ message: (e as Error).message });
    throw e;
  }
}

/** Stop syncing on this device. The Drive copy stays, and so do the solves here. */
export async function signOut(): Promise<void> {
  const sealed = cfg?.sealed;
  cfg = null;
  token = { value: '', exp: 0 };
  await saveConfig();
  setStatus({ phase: 'off', email: '', lastSync: 0, message: '' });
  if (sealed && navigator.onLine) await worker('/revoke', { sealed }).catch(() => {});
}

/** Delete every inphner file in Drive, then sign out. Other signed-in devices will upload theirs again. */
export async function deleteDriveCopy(): Promise<void> {
  const t = await accessToken();
  for (const f of await listFiles(t)) await remove(t, f.id);
  await signOut();
}

/** Forget sync on this device without a network call (Erase everything wipes the config with the data). */
export function forgetSync(): void {
  cfg = null;
  token = { value: '', exp: 0 };
  setStatus({ phase: GOOGLE_CLIENT_ID ? 'off' : 'unconfigured', email: '', lastSync: 0, message: '' });
}

/* ------------------------------------------------------------------ cycle */

const fileName = (deviceId: string) => `device-${deviceId}.json.gz`;
const waitIdle = async () => { while (busy()) await new Promise((r) => setTimeout(r, 2000)); };

let running: Promise<void> | null = null;
let again = false;

/** Run a cycle now (or right after the one in progress). */
export function syncNow(): Promise<void> {
  if (!cfg || !navigator.onLine) return Promise.resolve();
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      const locks = (navigator as Navigator & { locks?: LockManager }).locks;
      if (locks) await locks.request('inphner-sync', () => cycle());
      else await cycle();
    } finally {
      running = null;
      if (again) { again = false; void syncNow(); }
    }
  })();
  return running;
}

async function cycle(): Promise<void> {
  const c = cfg;
  if (!c || !navigator.onLine) return;
  // Another tab may have moved things on since we loaded.
  const stored = await get<Config>('meta', CONFIG_KEY);
  if (!stored) { forgetSync(); return; }
  Object.assign(c, { seen: stored.seen, uploaded: stored.uploaded, ownFileId: stored.ownFileId, lastSync: stored.lastSync, synced: stored.synced });
  setStatus({ phase: 'syncing', message: '' });
  try {
    const t = await accessToken();
    const files = await listFiles(t);
    const mine = fileName(c.deviceId);
    const own = files.filter((f) => f.name === mine).sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1));
    // Two tabs racing their first upload can create the file twice: keep the newest.
    for (const dup of own.slice(1)) await remove(t, dup.id).catch(() => {});
    const ownFile: DriveFile | undefined = own[0];
    const changed = files.filter((f) => f.name !== mine && f.name.startsWith('device-') && c.seen[f.id] !== f.modifiedTime);

    const docs: SyncDoc[] = [];
    for (const f of changed) {
      const doc = parseSyncDoc(await download(t, f.id));
      if (doc && doc.deviceId !== c.deviceId) docs.push(doc);
    }

    let snap = await syncSnapshot();
    if (docs.length) {
      const r = mergeStates(snap, docs, !c.synced);
      if (r.changed) {
        await waitIdle();
        applying = true;
        try { await applySync(r); } finally { applying = false; }
        snap = await syncSnapshot();
      }
    }

    const fp = fingerprint(snap);
    if (fp !== c.uploaded || !ownFile) {
      const f = await upload(t, mine, await gzip(JSON.stringify(buildSyncDoc(snap, c.deviceId))), ownFile?.id);
      c.ownFileId = f.id;
      c.uploaded = fp;
    }
    const seen: Record<string, string> = {};
    for (const f of files) if (f.name !== mine) seen[f.id] = changed.includes(f) ? f.modifiedTime : c.seen[f.id] ?? f.modifiedTime;
    c.seen = seen;
    c.synced = true;
    c.lastSync = Date.now();
    if (cfg === c) await saveConfig();
    setStatus({ phase: 'idle', lastSync: c.lastSync, message: '' });
  } catch (e) {
    if (e instanceof NeedsSignIn || (e instanceof DriveError && e.status === 401)) {
      token = { value: '', exp: 0 };
      setStatus({ phase: 'reconnect', message: 'Google signed inphner out. Sign in again to keep syncing.' });
    } else if (navigator.onLine) {
      setStatus({ phase: 'error', message: e instanceof DriveError && e.status === 403 ? 'Google Drive refused the request (full, or access was removed).' : 'Sync failed. It will try again shortly.' });
    } else {
      setStatus({ phase: 'idle' });
    }
  }
}

/* ------------------------------------------------------------------- boot */

let changeTimer = 0;

/** Read the saved sign-in and start syncing. `isBusy`: a solve or drill is in progress. */
export async function initSync(isBusy: () => boolean): Promise<void> {
  busy = isBusy;
  if (!GOOGLE_CLIENT_ID) return;
  // Wired whether or not anyone is signed in yet: every handler checks cfg.
  const onLocalChange = () => {
    if (applying || !cfg) return;
    clearTimeout(changeTimer);
    changeTimer = window.setTimeout(() => void syncNow(), 30_000);
  };
  window.addEventListener('inphner:solves', onLocalChange);
  window.addEventListener('inphner:sessions', onLocalChange);
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (!cfg) return;
    if (document.visibilityState === 'visible' && Date.now() - status.lastSync > 30_000) void syncNow();
    // Leaving with a change not yet uploaded: try now rather than in 30 s.
    if (document.visibilityState === 'hidden' && changeTimer) { clearTimeout(changeTimer); changeTimer = 0; void syncNow(); }
  });
  setInterval(() => { if (document.visibilityState === 'visible') void syncNow(); }, 3 * 60_000);

  cfg = (await get<Config>('meta', CONFIG_KEY)) ?? null;
  if (!cfg) return;
  setStatus({ phase: 'idle', email: cfg.email, lastSync: cfg.lastSync });
  setTimeout(() => void syncNow(), 3000);
}
