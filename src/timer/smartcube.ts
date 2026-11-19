/**
 * inphner: GAN smart cubes over Web Bluetooth (A5, behind "Experimental").
 *
 * The protocol (service UUIDs, AES keys, packet layout) comes from
 * gan-web-bluetooth (MIT) — those are facts about the hardware, not something
 * to reconstruct from memory. The library is loaded lazily, so its rxjs and
 * aes-js come down only when someone connects a cube.
 *
 * Web Bluetooth needs a user gesture and a secure context (https, or
 * localhost), which is why connecting is always a button.
 */
import type { Cube } from '../tools/cube.ts';
import { cubeFromFacelets } from '../tools/cube.ts';

export type SmartState = 'off' | 'connecting' | 'connected' | 'error';

export interface SmartMove {
  /** The move in normal notation ("R", "U'"). */
  move: string;
  /** Host clock time of the move, in the same units as performance.now(). */
  at: number;
}

export interface SmartHandlers {
  onState(state: SmartState, detail?: string): void;
  onMove(move: SmartMove): void;
  /** The cube's own idea of its state, after a move or on request. */
  onState3(cube: Cube, solved: boolean): void;
  onBattery?(level: number): void;
}

interface Connection {
  deviceName: string;
  events$: { subscribe(fn: (e: Record<string, unknown>) => void): { unsubscribe(): void } };
  sendCubeCommand(command: { type: string }): Promise<void>;
  disconnect(): Promise<void>;
}

const SOLVED_FACELETS = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const MAC_KEY = 'inphner.cubemac';

let connection: Connection | null = null;
let subscription: { unsubscribe(): void } | null = null;
let state: SmartState = 'off';
let handlers: SmartHandlers | null = null;

export function smartState(): SmartState {
  return state;
}

export function smartDeviceName(): string {
  return connection?.deviceName ?? '';
}

export function smartCubeSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

function setState(next: SmartState, detail?: string): void {
  state = next;
  handlers?.onState(next, detail);
}

/** MAC addresses that have worked before, by device name. */
function rememberedMacs(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MAC_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function rememberMac(name: string, mac: string | null): void {
  try {
    const all = rememberedMacs();
    if (mac) all[name] = mac;
    else delete all[name];
    localStorage.setItem(MAC_KEY, JSON.stringify(all));
  } catch { /* private mode: it will ask again next time */ }
}

/**
 * "ab-cd-ef-12-34-56", "ABCDEF123456" or "AB:CD:EF:12:34:56" → the last form,
 * or null when it isn't six hex bytes. The key is salted with these bytes, so a
 * typo can't be let through: the cube would "connect" and send nothing readable.
 */
export function normalizeMac(input: string): string | null {
  const hex = input.replace(/[\s:.-]/g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(hex)) return null;
  return hex.match(/../g)!.join(':');
}

/** Loading the library early keeps the click's user activation for requestDevice(). */
export function preloadSmartCube(): void {
  void import('gan-web-bluetooth').catch(() => {});
}

/** GATT connect has no timeout of its own: a sleeping cube would hang it forever. */
const CONNECT_TIMEOUT_MS = 20_000;
/** A good key gets a readable state back at once; a wrong one never does. */
const VERIFY_TIMEOUT_MS = 6_000;

type GanDevice = { name?: string; gatt?: { disconnect(): void } };

/**
 * Like csTimer: pick the cube, let the library read the MAC from the cube's
 * advertisements (Chrome needs the experimental web platform flag for that),
 * and only ask for it when that fails. The connection counts once the cube has
 * sent a state that decodes to a real cube; only then is the MAC remembered.
 */
export async function connectSmartCube(
  next: SmartHandlers,
  askForMac: (deviceName: string) => Promise<string | null>,
): Promise<void> {
  handlers = next;
  if (state === 'connecting' || state === 'connected') return;
  if (!smartCubeSupported()) {
    setState('error', 'This browser has no Web Bluetooth. Chrome or Edge on desktop and Android do.');
    return;
  }
  setState('connecting', 'Pick your cube in the list');

  let device: GanDevice | null = null;
  let name = 'GAN cube';
  let usedMac = '';
  let watchdog = 0;
  let abandoned = false;
  let giveUp: (err: Error) => void = () => {};
  const timedOut = new Promise<never>((_, reject) => { giveUp = reject; });
  timedOut.catch(() => {});

  const use = (mac: string): string => {
    usedMac = mac;
    setState('connecting', `Connecting to ${name}…`);
    watchdog = window.setTimeout(() => giveUp(new Error('timeout')), CONNECT_TIMEOUT_MS);
    return mac;
  };

  try {
    const { connectGanCube } = await import('gan-web-bluetooth');
    const connecting = connectGanCube(async (dev, isFallbackCall) => {
      device = dev as GanDevice;
      name = dev.name ?? 'GAN cube';
      if (!isFallbackCall) {
        const known = normalizeMac(rememberedMacs()[name] ?? '');
        if (known) return use(known);
        setState('connecting', `Reading the address of ${name}…`);
        return null;                       // the library tries the advertisements next
      }
      setState('connecting', 'Waiting for the MAC address');
      const given = normalizeMac((await askForMac(name)) ?? '');
      return given ? use(given) : null;
    }) as unknown as Promise<Connection>;
    // A connection that arrives after we gave up is closed, not leaked.
    connecting.then((late) => { if (abandoned) void late.disconnect().catch(() => {}); }, () => {});
    const conn = await Promise.race([connecting, timedOut]);
    clearTimeout(watchdog);
    connection = conn;
    setState('connecting', 'Checking the cube…');

    let verified = false;
    const verify = window.setTimeout(() => {
      if (verified || connection !== conn) return;
      teardown();
      rememberMac(name, null);
      setState('error', 'The cube connected but its data made no sense, so the MAC address is probably wrong. Press Connect to enter it again.');
    }, VERIFY_TIMEOUT_MS);

    subscription = conn.events$.subscribe((event) => {
      const type = event.type as string;
      if (type === 'FACELETS') {
        const facelets = String(event.facelets);
        const cube = cubeFromFacelets(facelets);
        if (!cube) return;                 // undecodable: wrong key, or noise
        if (!verified) {
          verified = true;
          clearTimeout(verify);
          rememberMac(name, usedMac);
          setState('connected');
          void conn.sendCubeCommand({ type: 'REQUEST_BATTERY' }).catch(() => {});
        }
        handlers?.onState3(cube, facelets === SOLVED_FACELETS);
      } else if (!verified) {
        return;                            // moves decoded with an unproven key are not trusted
      } else if (type === 'MOVE') {
        handlers?.onMove({ move: String(event.move), at: Number(event.localTimestamp) });
      } else if (type === 'BATTERY') {
        handlers?.onBattery?.(Number(event.batteryLevel));
      } else if (type === 'DISCONNECT') {
        disconnectSmartCube();
      }
    });
    await conn.sendCubeCommand({ type: 'REQUEST_FACELETS' });
  } catch (err) {
    abandoned = true;
    clearTimeout(watchdog);
    (device as GanDevice | null)?.gatt?.disconnect();
    teardown();
    const message = err instanceof Error ? err.message : String(err);
    setState('error',
      /cancell?ed/i.test(message) ? 'No cube was chosen.'
      : message === 'timeout' ? `${name} didn't answer. Turn a face to wake it, then press Connect again.`
      : /MAC address/i.test(message) ? 'No MAC address, so no connection. Press Connect to try again.'
      : `Could not connect: ${message}`);
  }
}

function teardown(): void {
  subscription?.unsubscribe();
  subscription = null;
  void connection?.disconnect().catch(() => {});
  connection = null;
}

/** Tell the cube its current state is solved (used after a scramble is applied). */
export async function resetSmartCube(): Promise<void> {
  await connection?.sendCubeCommand({ type: 'REQUEST_RESET' });
}

export function disconnectSmartCube(): void {
  teardown();
  if (state !== 'off') setState('off');
}
