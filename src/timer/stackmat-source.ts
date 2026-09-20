/**
 * inphner: the live Stackmat connection — microphone in, packets out.
 *
 * The decoding itself is in stackmat.ts (pure, tested); this file is only the
 * plumbing: permission, the AudioWorklet, and deciding which polarity of the
 * line is the real one by seeing whose checksums add up.
 */
import { PacketReader, type StackmatPacket } from './stackmat.ts';

export type StackmatState = 'off' | 'connecting' | 'waiting' | 'live' | 'error';

export interface StackmatHandlers {
  onPacket(packet: StackmatPacket): void;
  onState(state: StackmatState, detail?: string): void;
}

let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let node: AudioWorkletNode | null = null;
let state: StackmatState = 'off';
let handlers: StackmatHandlers | null = null;
let polarity: 'normal' | 'inverted' | null = null;
const readers = { normal: new PacketReader(), inverted: new PacketReader() };

export function stackmatState(): StackmatState {
  return state;
}

function setState(next: StackmatState, detail?: string): void {
  state = next;
  handlers?.onState(next, detail);
}

export async function connectStackmat(next: StackmatHandlers): Promise<void> {
  handlers = next;
  if (state === 'connecting' || state === 'live' || state === 'waiting') return;
  setState('connecting');
  try {
    // Every "helpful" processing step mangles a data signal.
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    ctx = new AudioContext();
    await ctx.resume();
    await ctx.audioWorklet.addModule('js/stackmat-worklet.js');
    node = new AudioWorkletNode(ctx, 'stackmat');
    node.port.onmessage = (e: MessageEvent<{ normal: number[]; inverted: number[] }>) => {
      const fromNormal = readers.normal.push(e.data.normal);
      const fromInverted = readers.inverted.push(e.data.inverted);
      const packets = polarity === 'inverted' ? fromInverted
        : polarity === 'normal' ? fromNormal
        : fromNormal.length ? fromNormal : fromInverted;
      if (!packets.length) return;
      polarity ??= fromNormal.length ? 'normal' : 'inverted';
      if (state !== 'live') setState('live');
      for (const packet of packets) handlers?.onPacket(packet);
    };
    ctx.createMediaStreamSource(stream).connect(node);
    setState('waiting');
  } catch (err) {
    disconnectStackmat();
    setState('error', err instanceof Error && err.name === 'NotAllowedError'
      ? 'inphner needs the microphone to hear the timer.'
      : 'That audio input could not be opened.');
  }
}

export function disconnectStackmat(): void {
  node?.port.close();
  node?.disconnect();
  node = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  void ctx?.close();
  ctx = null;
  polarity = null;
  readers.normal.reset();
  readers.inverted.reset();
  if (state !== 'off') setState('off');
}
