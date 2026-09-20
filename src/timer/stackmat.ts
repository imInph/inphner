/**
 * inphner: decoding a Speedstacks / QiYi timer from its audio jack (A5).
 * PURE: samples in, packets out, so it can be tested without a microphone.
 *
 * The timer sends a 1200-baud serial line on the audio channel: one start bit
 * (low), eight data bits (LSB first), one stop bit (high). Every packet is
 * nine printable bytes — a status character, six digits (m ss mmm) and a
 * checksum of 64 + the digit sum — usually followed by CR/LF.
 *
 * Two things we cannot know without the timer in front of us are the line's
 * polarity and its idle level, so nothing is assumed: both polarities are
 * decoded at once and only packets whose checksum adds up are believed.
 */

export type StackmatStatus = 'reset' | 'ready' | 'running' | 'stopped' | 'hands' | 'unknown';

export interface StackmatPacket {
  status: StackmatStatus;
  /** Displayed time in milliseconds. */
  ms: number;
}

const STATUS: Record<string, StackmatStatus> = {
  I: 'reset', ' ': 'running', S: 'stopped', A: 'ready', L: 'hands', R: 'hands', C: 'hands',
};

export const PACKET_LENGTH = 9;

/** A nine-byte frame, or null when it isn't one (bad digits or checksum). */
export function parseStackmatPacket(bytes: readonly number[]): StackmatPacket | null {
  if (bytes.length < PACKET_LENGTH) return null;
  const head = String.fromCharCode(bytes[0]!);
  const status = STATUS[head];
  if (!status) return null;
  const digits: number[] = [];
  for (let i = 1; i <= 6; i++) {
    const d = bytes[i]! - 48;
    if (d < 0 || d > 9) return null;
    digits.push(d);
  }
  const sum = digits.reduce((a, b) => a + b, 0);
  if (bytes[7] !== sum + 64) return null;
  const [m, s1, s2, h1, h2, h3] = digits as [number, number, number, number, number, number];
  const ms = m * 60_000 + (s1 * 10 + s2) * 1000 + h1 * 100 + h2 * 10 + h3;
  return { status, ms };
}

/** Bytes in, packets out: keeps the tail that hasn't made a packet yet. */
export class PacketReader {
  private buffer: number[] = [];

  push(bytes: readonly number[]): StackmatPacket[] {
    const out: StackmatPacket[] = [];
    for (const byte of bytes) {
      this.buffer.push(byte);
      while (this.buffer.length >= PACKET_LENGTH) {
        const packet = parseStackmatPacket(this.buffer);
        if (packet) {
          out.push(packet);
          this.buffer = this.buffer.slice(PACKET_LENGTH);
        } else {
          this.buffer.shift();
        }
      }
      if (this.buffer.length > 64) this.buffer = this.buffer.slice(-PACKET_LENGTH);
    }
    return out;
  }

  reset(): void {
    this.buffer = [];
  }
}

/**
 * A 1200-baud UART on an audio line. The threshold follows the signal's own
 * slow average, so it doesn't matter how loud the timer is plugged in.
 */
export class UartDecoder {
  private readonly samplesPerBit: number;
  private level = false;
  private since = 0;        // samples since the falling edge that started a byte
  private reading = false;
  private bit = 0;
  private byte = 0;
  private dc = 0;
  private readonly invert: boolean;

  constructor(sampleRate: number, invert = false, baud = 1200) {
    this.samplesPerBit = sampleRate / baud;
    this.invert = invert;
  }

  /** Feed a block of samples; returns whatever bytes completed inside it. */
  push(samples: ArrayLike<number>): number[] {
    const out: number[] = [];
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i]!;
      this.dc += (sample - this.dc) * 0.0005;
      const value = sample - this.dc;
      // Hysteresis around the running average: audio noise shouldn't retrigger.
      if (value > 0.06) this.level = !this.invert;
      else if (value < -0.06) this.level = this.invert;

      if (!this.reading) {
        // Idle is high; a low means a start bit has begun.
        if (!this.level) { this.reading = true; this.since = 0; this.bit = 0; this.byte = 0; }
        continue;
      }
      this.since++;
      const centre = this.samplesPerBit * (this.bit + 1.5);
      if (this.since < centre) continue;
      if (this.bit < 8) {
        if (this.level) this.byte |= 1 << this.bit;
        this.bit++;
        continue;
      }
      // The stop bit must be high, or the byte was noise.
      if (this.level) out.push(this.byte);
      this.reading = false;
    }
    return out;
  }
}

/** The audio for a byte, for tests and for checking a decoder end to end. */
export function encodeByte(byte: number, sampleRate: number, baud = 1200, invert = false): number[] {
  const perBit = Math.round(sampleRate / baud);
  const bits = [false, ...Array.from({ length: 8 }, (_, i) => Boolean((byte >> i) & 1)), true];
  const out: number[] = [];
  for (const bit of bits) {
    const high = invert ? !bit : bit;
    for (let i = 0; i < perBit; i++) out.push(high ? 0.8 : -0.8);
  }
  return out;
}

/** The nine bytes of a packet, ready to be encoded. */
export function packetBytes(status: string, ms: number): number[] {
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const h = ms % 1000;
  const digits = [m, Math.floor(s / 10), s % 10, Math.floor(h / 100), Math.floor((h % 100) / 10), h % 10];
  const sum = digits.reduce((a, b) => a + b, 0);
  return [status.charCodeAt(0), ...digits.map((d) => d + 48), sum + 64, 10, 13];
}

/**
 * The timer repeats its "stopped" packet for as long as the time is on the
 * display, and it can send the same time again after a reset. A solve is only
 * the first stop that follows a run.
 */
export class SolveGate {
  private ran = false;
  private last = -1;

  /** The time to record, or null when this packet is not a new solve. */
  accept(packet: StackmatPacket): number | null {
    if (packet.status === 'running') {
      this.ran = true;
      return null;
    }
    if (packet.status === 'reset') {
      this.ran = false;
      this.last = -1;
      return null;
    }
    if (packet.status !== 'stopped' || !packet.ms) return null;
    if (!this.ran || packet.ms === this.last) return null;
    this.ran = false;
    this.last = packet.ms;
    return packet.ms;
  }

  reset(): void {
    this.ran = false;
    this.last = -1;
  }
}
