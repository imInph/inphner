/**
 * inphner: the TPS metronome (A9). WebAudio, scheduled ahead of time — a
 * setInterval click drifts audibly within a few bars.
 */
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

let ctx: AudioContext | null = null;
let timer = 0;
let nextAt = 0;
let beat = 0;
let bpm = 120;
let accent = 4;
let volume = 0.5;
let onBeat: ((beat: number) => void) | null = null;

function click(at: number, strong: boolean): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = strong ? 1600 : 1100;
  gain.gain.setValueAtTime(volume * (strong ? 0.9 : 0.55), at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.06);
}

function tick(): void {
  if (!ctx) return;
  const step = 60 / bpm;
  while (nextAt < ctx.currentTime + SCHEDULE_AHEAD) {
    click(nextAt, accent > 1 && beat % accent === 0);
    const at = nextAt;
    const b = beat;
    if (onBeat) window.setTimeout(() => onBeat?.(b), Math.max(0, (at - ctx!.currentTime) * 1000));
    nextAt += step;
    beat++;
  }
}

export function metronomeRunning(): boolean {
  return timer !== 0;
}

export function startMetronome(opts: { bpm: number; accent: number; volume: number; onBeat?: (beat: number) => void }): void {
  stopMetronome();
  bpm = Math.min(300, Math.max(20, opts.bpm));
  accent = Math.max(1, opts.accent);
  volume = opts.volume;
  onBeat = opts.onBeat ?? null;
  ctx ??= new AudioContext();
  void ctx.resume();
  beat = 0;
  nextAt = ctx.currentTime + 0.06;
  tick();
  timer = window.setInterval(tick, LOOKAHEAD_MS);
}

export function setMetronomeBpm(next: number): void {
  bpm = Math.min(300, Math.max(20, next));
}

export function stopMetronome(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = 0;
  onBeat = null;
}

/** Tap tempo: the BPM implied by the gaps between taps (the last 6). */
export function tapTempo(times: readonly number[]): number | null {
  const taps = times.slice(-6);
  if (taps.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < taps.length; i++) gaps.push(taps[i]! - taps[i - 1]!);
  const usable = gaps.filter((g) => g > 150 && g < 3000);
  if (!usable.length) return null;
  const mean = usable.reduce((a, b) => a + b, 0) / usable.length;
  return Math.round(60000 / mean);
}
