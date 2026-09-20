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

/** MAC addresses we've been given before, by device name. */
function rememberedMacs(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MAC_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function rememberMac(name: string, mac: string): void {
  try {
    localStorage.setItem(MAC_KEY, JSON.stringify({ ...rememberedMacs(), [name]: mac }));
  } catch { /* private mode: it will ask again next time */ }
}

/**
 * The cube's encryption key is derived from its MAC address, which Chrome on
 * macOS won't hand over. `askForMac` is asked only when the library has given
 * up reading it itself.
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
  setState('connecting');
  try {
    const { connectGanCube } = await import('gan-web-bluetooth');
    const conn = await connectGanCube(async (device, isFallbackCall) => {
      const name = device.name ?? 'GAN cube';
      const known = rememberedMacs()[name];
      if (known) return known;
      if (!isFallbackCall) return null;      // let the library try to read it first
      const given = (await askForMac(name))?.trim() ?? '';
      if (!given) return null;
      rememberMac(name, given);
      return given;
    }) as unknown as Connection;
    connection = conn;
    subscription = conn.events$.subscribe((event) => {
      const type = event.type as string;
      if (type === 'MOVE') {
        handlers?.onMove({ move: String(event.move), at: Number(event.localTimestamp) });
      } else if (type === 'FACELETS') {
        const facelets = String(event.facelets);
        const cube = cubeFromFacelets(facelets);
        if (cube) handlers?.onState3(cube, facelets === SOLVED_FACELETS);
      } else if (type === 'BATTERY') {
        handlers?.onBattery?.(Number(event.batteryLevel));
      } else if (type === 'DISCONNECT') {
        disconnectSmartCube();
      }
    });
    setState('connected');
    await conn.sendCubeCommand({ type: 'REQUEST_FACELETS' });
    await conn.sendCubeCommand({ type: 'REQUEST_BATTERY' });
  } catch (err) {
    connection = null;
    const message = err instanceof Error ? err.message : String(err);
    setState('error', /cancell?ed|User cancelled/i.test(message)
      ? 'No cube was chosen.'
      : `Could not connect: ${message}`);
  }
}

/** Tell the cube its current state is solved (used after a scramble is applied). */
export async function resetSmartCube(): Promise<void> {
  await connection?.sendCubeCommand({ type: 'REQUEST_RESET' });
}

export function disconnectSmartCube(): void {
  subscription?.unsubscribe();
  subscription = null;
  void connection?.disconnect().catch(() => {});
  connection = null;
  if (state !== 'off') setState('off');
}
