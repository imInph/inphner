/**
 * inphner: time formatting and the typing-mode parser. Pure, unit-tested.
 *
 * WCA Regulation 9f (the owner's decision, see CLAUDE.md):
 *   singles are TRUNCATED to the display precision (9f1: 12.349 → 12.34),
 *   averages / means are ROUNDED half-up (9f2: 12.345 → 12.35).
 * Never use toFixed() for times: it rounds.
 */

export type Penalty = 0 | 2000 | 'DNF';
export type Precision = 2 | 3;

/** "12.34", "1:02.34", "1:02:03.45". `ms` must already be quantised. */
function layout(ms: number, precision: Precision): string {
  const totalUnits = Math.round(ms / (precision === 3 ? 1 : 10)); // exact integer after quantising
  const perSecond = precision === 3 ? 1000 : 100;
  const frac = totalUnits % perSecond;
  const totalSeconds = Math.floor(totalUnits / perSecond);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  const fracStr = String(frac).padStart(precision, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${fracStr}`;
  if (m > 0) return `${m}:${String(s).padStart(2, '0')}.${fracStr}`;
  return `${s}.${fracStr}`;
}

/** A single: truncated to 0.01 (or 0.001). */
export function formatSingle(ms: number, precision: Precision = 2): string {
  const unit = precision === 3 ? 1 : 10;
  return layout(Math.floor(Math.max(0, ms) / unit + 1e-9) * unit, precision);
}

/** An average or mean: rounded half-up to 0.01 (or 0.001). */
export function formatAverage(ms: number, precision: Precision = 2): string {
  const unit = precision === 3 ? 1 : 10;
  return layout(Math.floor(Math.max(0, ms) / unit + 0.5 + 1e-9) * unit, precision);
}

/** The time with its penalty applied (Infinity for DNF). */
export function effectiveMs(timeMs: number, penalty: Penalty): number {
  return penalty === 'DNF' ? Infinity : timeMs + penalty;
}

/** List form, csTimer style: "14.34+" for +2 (penalty applied), "DNF". */
export function formatResult(timeMs: number, penalty: Penalty, precision: Precision = 2): string {
  if (penalty === 'DNF') return 'DNF';
  return formatSingle(timeMs + penalty, precision) + (penalty === 2000 ? '+' : '');
}

/** Live display while running, per the "live update" setting. */
export function formatLive(ms: number, mode: 'full' | 'tenths' | 'seconds', precision: Precision): string {
  if (mode === 'full') return formatSingle(ms, precision);
  const whole = Math.floor(ms / 1000);
  if (mode === 'seconds') {
    const m = Math.floor(whole / 60);
    return m > 0 ? `${m}:${String(whole % 60).padStart(2, '0')}` : String(whole);
  }
  const s = formatSingle(Math.floor(ms / 100) * 100, 2);
  return s.slice(0, -1); // "12.3"
}

export interface TypedTime {
  timeMs: number;
  penalty: Penalty;
}

/**
 * Parse a typed time (typing mode), csTimer conventions:
 *   "1234" → 12.34   "12345" → 1:23.45   "5" → 0.05   (digits only: …MMSScc)
 *   "12.34", "12.3", "12.345", "1:02.34", "1:02:03.45"
 *   "12.34+" / "12.34+2" → +2 (timeMs is the raw 12.34)
 *   "DNF" → DNF, "DNF(12.34)" → DNF with its raw time
 * Returns null for anything else, including zero.
 */
export function parseTypedTime(input: string): TypedTime | null {
  let s = input.trim().replace(/\s+/g, '').toUpperCase();
  if (!s) return null;

  if (s.startsWith('DNF')) {
    const rest = s.slice(3);
    if (rest === '') return { timeMs: 0, penalty: 'DNF' };
    const m = /^\((.+)\)$/.exec(rest);
    if (!m) return null;
    const inner = parseClock(m[1]!);
    return inner === null ? null : { timeMs: inner, penalty: 'DNF' };
  }

  let penalty: Penalty = 0;
  if (s.endsWith('+2')) {
    penalty = 2000;
    s = s.slice(0, -2);
  } else if (s.endsWith('+')) {
    penalty = 2000;
    s = s.slice(0, -1);
  }
  const ms = parseClock(s);
  return ms === null || ms <= 0 ? null : { timeMs: ms, penalty };
}

function parseClock(s: string): number | null {
  if (/^\d+$/.test(s)) {
    // Digits only: the last two are hundredths, then seconds, minutes, hours (2 digits each).
    if (s.length > 8) return null;
    const padded = s.padStart(8, '0');
    const h = +padded.slice(0, 2), m = +padded.slice(2, 4), sec = +padded.slice(4, 6), cs = +padded.slice(6, 8);
    if (sec >= 60 && (m > 0 || h > 0)) return null;
    if (m >= 60 && h > 0) return null;
    return ((h * 60 + m) * 60 + sec) * 1000 + cs * 10;
  }
  const m = /^(?:(\d+):)?(?:(\d+):)?(\d+)(?:\.(\d{1,3}))?$/.exec(s);
  if (!m) return null;
  const [, a, b, secStr, fracStr = ''] = m;
  let h = 0, min = 0;
  if (a !== undefined && b !== undefined) { h = +a; min = +b; } else if (a !== undefined) { min = +a; }
  const sec = +secStr!;
  if ((a !== undefined) && sec >= 60) return null;
  if (b !== undefined && min >= 60) return null;
  const frac = fracStr ? Math.round(+fracStr.padEnd(3, '0')) : 0;
  return ((h * 60 + min) * 60 + sec) * 1000 + frac;
}
