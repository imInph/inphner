/**
 * inphner: the AudioWorklet that listens to the Stackmat's audio jack. It runs
 * the 1200-baud decoder on the audio thread and posts bytes, never samples —
 * both polarities at once, because only the timer can tell us which it uses.
 * Built to public/js/stackmat-worklet.js by tools/build.mjs.
 */
import { UartDecoder } from './stackmat.ts';

declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;

class StackmatProcessor extends AudioWorkletProcessor {
  private readonly normal = new UartDecoder(sampleRate, false);
  private readonly inverted = new UartDecoder(sampleRate, true);
  private silence = 0;

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (!channel || !channel.length) return true;
    let peak = 0;
    for (let i = 0; i < channel.length; i++) peak = Math.max(peak, Math.abs(channel[i]!));
    const normal = this.normal.push(channel);
    const inverted = this.inverted.push(channel);
    if (normal.length || inverted.length) {
      this.port.postMessage({ normal, inverted, peak });
      this.silence = 0;
    } else if ((this.silence += channel.length) > sampleRate) {
      // Once a second of quiet, report the level so the UI can say "no signal".
      this.silence = 0;
      this.port.postMessage({ normal: [], inverted: [], peak });
    }
    return true;
  }
}

registerProcessor('stackmat', StackmatProcessor);
