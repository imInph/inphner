/**
 * inphner: inspection alerts. A beep synthesised with WebAudio or a spoken
 * "Eight seconds" via speechSynthesis. Both are off by default. The
 * AudioContext is created on the first user gesture (browsers keep it
 * suspended otherwise); unlockAudio() is called from the timer's press handler.
 */
import { prefs } from '../prefs.ts';

let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  if (prefs().alerts !== 'beep') return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* no WebAudio */
  }
}

/** A short, soft sine blip; `double` for the 12 s call. */
export function beep(double = false, volume = prefs().volume): void {
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    const blips = double ? [0, 0.16] : [0];
    for (const offset of blips) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = double ? 1175 : 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.35 * volume), now + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.13);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.15);
    }
  } catch {
    /* no WebAudio */
  }
}

export function speak(text: string, volume = prefs().volume): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.volume = volume;
    u.rate = 1.1;
    synth.speak(u);
  } catch {
    /* no speech */
  }
}

/** The WCA judge's calls at 8 s and 12 s of inspection. */
export function inspectionAlert(second: 8 | 12): void {
  const mode = prefs().alerts;
  if (mode === 'beep') beep(second === 12);
  else if (mode === 'voice') speak(second === 8 ? 'Eight seconds' : 'Twelve seconds');
}
