/**
 * inphner: the timer state machine. Pure: no DOM, no clock of its own. The
 * input layer passes timestamps taken in the event handlers themselves
 * (performance.now() in keyup = start, in keydown = stop), and a scheduler is
 * injected for the hold threshold and the inspection alerts, so the whole
 * machine is unit-tested with a fake clock.
 *
 *   phase  idle ─tap→ inspecting ─hold→ … ─release on ready→ running ─press→ idle (+ result)
 *          idle ─hold→ … ─release on ready→ running           (inspection off)
 *   hold   none | tap (pre-inspection press) | armed (amber) | ready (green)
 *
 * Releasing while armed cancels the hold (the inspection keeps counting).
 * After a stop, the key/touch that stopped the timer must be released before
 * anything can arm again, so holding space through the stop never re-arms.
 */
import type { Penalty } from './format.ts';

export type Phase = 'idle' | 'inspecting' | 'running';
export type Hold = 'none' | 'tap' | 'armed' | 'ready';

export interface TimerConfig {
  holdMs: number;
  inspection: boolean;
  /** Number of phases (≥1). With N > 1 every press records a split; the Nth stops. */
  phases: number;
}

export interface SolveResult {
  timeMs: number;
  penalty: Penalty;
  /** Cumulative ms per phase, when phases > 1. */
  splits?: number[];
  /** ms of inspection used, when inspection was on. */
  inspectionMs?: number;
}

export interface Scheduler {
  set(fn: () => void, ms: number): number;
  clear(id: number): void;
}

export interface EngineEvents {
  /** Any phase/hold change (the view repaints colours synchronously). */
  change?: () => void;
  start?: (at: number) => void;
  split?: (splits: number[]) => void;
  stop?: (result: SolveResult) => void;
  alert?: (second: 8 | 12) => void;
}

export const INSPECTION_MS = 15000;
export const INSPECTION_DNF_MS = 17000;

/** WCA A1a4/A1a5: +2 when starting between 15 and 17 s, DNF past 17 s. */
export function inspectionPenalty(inspectionMs: number): Penalty {
  if (inspectionMs > INSPECTION_DNF_MS) return 'DNF';
  if (inspectionMs > INSPECTION_MS) return 2000;
  return 0;
}

export class TimerEngine {
  phase: Phase = 'idle';
  hold: Hold = 'none';
  startedAt = 0;
  inspectionStartedAt = 0;
  splits: number[] = [];
  private awaitRelease = false;
  private holdTimer = 0;
  private alertTimers: number[] = [];

  private config: () => TimerConfig;
  private scheduler: Scheduler;
  private events: EngineEvents;

  constructor(config: () => TimerConfig, scheduler: Scheduler, events: EngineEvents = {}) {
    this.config = config;
    this.scheduler = scheduler;
    this.events = events;
  }

  /** Armed, inspecting or running: every shortcut except "stop" is off. */
  get busy(): boolean {
    return this.phase !== 'idle' || this.hold === 'armed' || this.hold === 'ready' || this.hold === 'tap';
  }

  /** A press: space/both-Ctrl keydown, a touch on the surface, or (while running) any key/click. */
  press(now: number): void {
    if (this.awaitRelease) return;
    if (this.phase === 'running') {
      this.awaitRelease = true;
      const elapsed = now - this.startedAt;
      const phases = Math.max(1, Math.floor(this.config().phases));
      if (phases > 1 && this.splits.length < phases - 1) {
        this.splits = [...this.splits, Math.round(elapsed)];
        this.events.split?.(this.splits);
        this.changed();
        return;
      }
      this.stop(now);
      return;
    }
    if (this.hold !== 'none') return; // already holding
    if (this.phase === 'idle' && this.config().inspection) {
      this.hold = 'tap';
      this.changed();
      return;
    }
    this.startHold();
  }

  /** The matching release (keyup / touch end). */
  release(now: number): void {
    if (this.awaitRelease) {
      this.awaitRelease = false;
      return;
    }
    switch (this.hold) {
      case 'tap':
        this.hold = 'none';
        this.startInspection(now);
        break;
      case 'armed':
        this.clearHold();
        this.hold = 'none';
        this.changed();
        break;
      case 'ready':
        this.hold = 'none';
        this.start(now);
        break;
      default:
        break;
    }
  }

  /** Esc / a cancelled touch: drop a hold or an inspection. Never touches a running solve. */
  cancel(): void {
    if (this.phase === 'running') return;
    this.clearHold();
    this.clearAlerts();
    this.hold = 'none';
    this.phase = 'idle';
    this.changed();
  }

  /** A touch cancelled by the OS: drop the hold but never start. */
  cancelHold(): void {
    if (this.hold === 'none') return;
    this.clearHold();
    this.hold = 'none';
    this.changed();
  }

  /** The window lost focus mid-press: forget pending keys, drop an unfinished hold. */
  interrupt(): void {
    this.awaitRelease = false;
    this.cancelHold();
  }

  /** Remaining inspection in ms (negative past 15 s). */
  inspectionLeft(now: number): number {
    return INSPECTION_MS - (now - this.inspectionStartedAt);
  }

  private startHold(): void {
    this.hold = 'armed';
    const ms = Math.max(0, this.config().holdMs);
    if (ms === 0) {
      this.hold = 'ready';
    } else {
      this.holdTimer = this.scheduler.set(() => {
        this.holdTimer = 0;
        if (this.hold === 'armed') {
          this.hold = 'ready';
          this.changed();
        }
      }, ms);
    }
    this.changed();
  }

  private startInspection(now: number): void {
    this.phase = 'inspecting';
    this.inspectionStartedAt = now;
    this.clearAlerts();
    this.alertTimers = [
      this.scheduler.set(() => this.events.alert?.(8), 8000),
      this.scheduler.set(() => this.events.alert?.(12), 12000),
    ];
    this.changed();
  }

  private start(now: number): void {
    this.clearAlerts();
    const wasInspecting = this.phase === 'inspecting';
    this.inspectionMs = wasInspecting ? now - this.inspectionStartedAt : undefined;
    this.phase = 'running';
    this.startedAt = now;
    this.splits = [];
    this.events.start?.(now);
    this.changed();
  }

  private inspectionMs: number | undefined;

  private stop(now: number): void {
    const timeMs = Math.max(0, Math.round(now - this.startedAt));
    const penalty = this.inspectionMs === undefined ? 0 : inspectionPenalty(this.inspectionMs);
    const result: SolveResult = { timeMs, penalty };
    if (this.splits.length) result.splits = [...this.splits, timeMs];
    if (this.inspectionMs !== undefined) result.inspectionMs = Math.round(this.inspectionMs);
    this.phase = 'idle';
    this.hold = 'none';
    this.splits = [];
    this.inspectionMs = undefined;
    this.events.stop?.(result);
    this.changed();
  }

  private clearHold(): void {
    if (this.holdTimer) this.scheduler.clear(this.holdTimer);
    this.holdTimer = 0;
  }

  private clearAlerts(): void {
    for (const id of this.alertTimers) this.scheduler.clear(id);
    this.alertTimers = [];
  }

  private changed(): void {
    this.events.change?.();
  }
}
