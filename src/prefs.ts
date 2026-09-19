/**
 * inphner: user preferences (timer, inspection, stats display, sounds).
 * Stored in localStorage['inphner.prefs'] because they're needed synchronously
 * at boot and are tiny. Appearance lives separately (appearance.ts).
 * parsePrefs() is pure and validates field by field.
 */

export type LiveMode = 'full' | 'tenths' | 'seconds' | 'off';
export type InputMethod = 'keyboard' | 'typing' | 'stackmat' | 'smartcube';
export type AlertMode = 'off' | 'beep' | 'voice';

export interface Prefs {
  holdMs: number;
  precision: 2 | 3;
  live: LiveMode;
  input: InputMethod;
  phases: number;
  focusMode: boolean;
  confirmDelete: boolean;
  /** Inspection overrides per event id; events not listed use inspectionDefault(). */
  inspection: Record<string, boolean>;
  alerts: AlertMode;
  volume: number;
  /** Averages shown in the Timer's stat strip. */
  strip: number[];
  dnfInMean: boolean;
  lastExportAt: number;
  /** Moves in a '3x3 · custom length' scramble. */
  customLength: number;
  /** Cubes in a Multi-BLD attempt (scrambles generated per attempt). */
  multiCubes: number;
}

export const DEFAULT_PREFS: Prefs = {
  holdMs: 300,
  precision: 2,
  live: 'full',
  input: 'keyboard',
  phases: 1,
  focusMode: true,
  confirmDelete: false,
  inspection: {},
  alerts: 'off',
  volume: 0.7,
  strip: [5, 12, 100],
  dnfInMean: false,
  lastExportAt: 0,
  customLength: 25,
  multiCubes: 5,
};

/** WCA: inspection is on for everything except blindfolded events and FMC. */
const NO_INSPECTION = new Set(['333bf', '444bf', '555bf', '333mbf', '333fm', 'none']);
export function inspectionDefault(event: string): boolean {
  return !NO_INSPECTION.has(event);
}

export function inspectionFor(prefs: Prefs, event: string): boolean {
  return prefs.inspection[event] ?? inspectionDefault(event);
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, fallback: number, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

export function parsePrefs(raw: string | null): Prefs {
  let o: Record<string, unknown> = {};
  try {
    const p: unknown = raw ? JSON.parse(raw) : null;
    if (p && typeof p === 'object' && !Array.isArray(p)) o = p as Record<string, unknown>;
  } catch {
    /* defaults */
  }
  const d = DEFAULT_PREFS;
  const inspection: Record<string, boolean> = {};
  if (o.inspection && typeof o.inspection === 'object') {
    for (const [k, v] of Object.entries(o.inspection as Record<string, unknown>)) {
      if (typeof v === 'boolean' && /^[a-z0-9_-]{1,32}$/i.test(k)) inspection[k] = v;
    }
  }
  const strip = Array.isArray(o.strip)
    ? [...new Set(o.strip.filter((n): n is number => [5, 12, 25, 50, 100, 200, 500, 1000].includes(n as number)))].sort((a, b) => a - b)
    : d.strip;
  return {
    holdMs: Math.round(num(o.holdMs, d.holdMs, 0, 1000)),
    precision: o.precision === 3 ? 3 : 2,
    live: oneOf(o.live, ['full', 'tenths', 'seconds', 'off'] as const, d.live),
    input: oneOf(o.input, ['keyboard', 'typing', 'stackmat', 'smartcube'] as const, d.input),
    phases: Math.round(num(o.phases, d.phases, 1, 10)),
    focusMode: bool(o.focusMode, d.focusMode),
    confirmDelete: bool(o.confirmDelete, d.confirmDelete),
    inspection,
    alerts: oneOf(o.alerts, ['off', 'beep', 'voice'] as const, d.alerts),
    volume: num(o.volume, d.volume, 0, 1),
    strip: strip.length ? strip : d.strip,
    dnfInMean: bool(o.dnfInMean, d.dnfInMean),
    lastExportAt: num(o.lastExportAt, 0, 0, 8.64e15),
    customLength: Math.round(num(o.customLength, d.customLength, 1, 100)),
    multiCubes: Math.round(num(o.multiCubes, d.multiCubes, 2, 60)),
  };
}

/* ------------------------------------------------------------- live store */

const KEY = 'inphner.prefs';
let current: Prefs | null = null;

export function prefs(): Prefs {
  if (!current) {
    let raw: string | null = null;
    try {
      raw = globalThis.localStorage?.getItem(KEY) ?? null;
    } catch {
      /* storage blocked */
    }
    current = parsePrefs(raw);
  }
  return current;
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  current = parsePrefs(JSON.stringify({ ...prefs(), ...patch }));
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage blocked: the change holds for this session */
  }
  globalThis.dispatchEvent?.(new Event('inphner:prefs'));
  return current;
}
