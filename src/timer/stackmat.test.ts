import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  encodeByte, packetBytes, PacketReader, parseStackmatPacket, SolveGate, UartDecoder,
  type StackmatStatus,
} from './stackmat.ts';

const RATE = 44100;

test('a packet is its status, its time and a checksum', () => {
  const packet = parseStackmatPacket(packetBytes('S', 12_345));
  assert.deepEqual(packet, { status: 'stopped', ms: 12_345 });
  assert.deepEqual(parseStackmatPacket(packetBytes('I', 0)), { status: 'reset', ms: 0 });
  assert.deepEqual(parseStackmatPacket(packetBytes(' ', 61_020)), { status: 'running', ms: 61_020 });
  assert.deepEqual(parseStackmatPacket(packetBytes('C', 0))?.status, 'hands');
});

test('a wrong checksum or a stray byte is not a packet', () => {
  const bytes = packetBytes('S', 12_345);
  bytes[7]!++;
  assert.equal(parseStackmatPacket(bytes), null);
  assert.equal(parseStackmatPacket([65, 65, 65, 65, 65, 65, 65, 65, 65]), null);
  assert.equal(parseStackmatPacket(packetBytes('S', 12_345).slice(0, 5)), null);
});

test('the reader finds packets in a stream that starts mid-packet', () => {
  const reader = new PacketReader();
  const noise = [3, 250, 17];
  const stream = [...noise, ...packetBytes('I', 0), ...packetBytes(' ', 1_230), ...packetBytes('S', 9_870)];
  const packets = reader.push(stream);
  assert.deepEqual(packets.map((p) => p.status), ['reset', 'running', 'stopped']);
  assert.deepEqual(packets.map((p) => p.ms), [0, 1_230, 9_870]);
});

test('the reader survives being fed one byte at a time', () => {
  const reader = new PacketReader();
  const out = packetBytes('S', 3_141).flatMap((b) => reader.push([b]));
  assert.deepEqual(out, [{ status: 'stopped', ms: 3_141 }]);
});

test('a 1200-baud line decodes back to the bytes that were sent', () => {
  const decoder = new UartDecoder(RATE);
  const bytes = packetBytes('S', 23_456);
  const audio = [...Array(2000).fill(0.8), ...bytes.flatMap((b) => encodeByte(b, RATE))];
  assert.deepEqual(decoder.push(audio), bytes);
});

test('an inverted line decodes too, which is why both are tried', () => {
  const bytes = packetBytes(' ', 5_000);
  const audio = [...Array(2000).fill(-0.8), ...bytes.flatMap((b) => encodeByte(b, RATE, 1200, true))];
  assert.deepEqual(new UartDecoder(RATE, true).push(audio), bytes);
  assert.notDeepEqual(new UartDecoder(RATE, false).push(audio), bytes);
});

test('audio through the decoder and the reader gives the packet', () => {
  const decoder = new UartDecoder(RATE);
  const reader = new PacketReader();
  const audio = [...Array(500).fill(0.8), ...packetBytes('S', 45_678).flatMap((b) => encodeByte(b, RATE))];
  // In blocks of 128 samples, the way an AudioWorklet delivers them.
  const packets: unknown[] = [];
  for (let i = 0; i < audio.length; i += 128) {
    packets.push(...reader.push(decoder.push(audio.slice(i, i + 128))));
  }
  assert.deepEqual(packets, [{ status: 'stopped', ms: 45_678 }]);
});

test('a solve is the first stop after a run, however often it repeats', () => {
  const gate = new SolveGate();
  const feed = (status: StackmatStatus, ms: number) => gate.accept({ status, ms });
  assert.equal(feed('reset', 0), null);
  assert.equal(feed('hands', 0), null);
  assert.equal(feed('running', 1_200), null);
  assert.equal(feed('running', 8_400), null);
  assert.equal(feed('stopped', 12_340), 12_340, 'the stop is the solve');
  assert.equal(feed('stopped', 12_340), null, 'the timer keeps sending it');
  assert.equal(feed('stopped', 12_340), null);
  // Reset and an identical time again is a new solve.
  assert.equal(feed('reset', 0), null);
  assert.equal(feed('running', 900), null);
  assert.equal(feed('stopped', 12_340), 12_340);
});

test('a stop with no run before it is the display, not a solve', () => {
  const gate = new SolveGate();
  assert.equal(gate.accept({ status: 'stopped', ms: 12_340 }), null);
  assert.equal(gate.accept({ status: 'stopped', ms: 0 }), null);
});
