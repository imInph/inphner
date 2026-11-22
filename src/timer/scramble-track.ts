/**
 * inphner: following a smart cube through a scramble, the way csTimer does.
 * PURE.
 *
 * The plan is a queue of face turns. A turn that matches the next one (or the
 * one after it, when the two are opposite faces and so commute) is taken off;
 * half of a double turn leaves the other half. A wrong turn puts its own
 * inverse at the front of the queue, merged with what's there, so the rest of
 * the scramble still lands on exactly the same state: R instead of R2 leaves
 * R; R' instead of R leaves R2; U instead of R leaves U' R.
 *
 * Smart cubes report quarter turns, so a double turn always arrives as two.
 */

export type StepState = 'done' | 'current' | 'todo' | 'fix';
export interface Step { move: string; state: StepState }

interface Item { face: string; amt: number; orig: number }    // orig -1: a correction

const AXIS: Record<string, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
const SUFFIX = ['', '', '2', "'"];

/** "R" → [R, 1], "R2" → [R, 2], "R'" → [R, 3]; null for anything that isn't a face turn. */
export function parseTurn(move: string): [string, number] | null {
  const m = /^([URFDLB])(2|'|2')?$/.exec(move);
  if (!m) return null;
  return [m[1]!, m[2] === "'" ? 3 : m[2] ? 2 : 1];
}

const name = (face: string, amt: number) => face + SUFFIX[amt];

/** True when every move of the scramble is a plain face turn (what a smart cube can follow). */
export function trackable(scramble: string): boolean {
  const moves = scramble.trim().split(/\s+/).filter(Boolean);
  return moves.length > 0 && moves.every((m) => parseTurn(m) !== null);
}

export class ScrambleTracker {
  readonly moves: string[];
  private queue: Item[];

  constructor(plan: string) {
    this.moves = plan.trim().split(/\s+/).filter(Boolean);
    this.queue = this.moves.map((m, orig) => {
      const [face, amt] = parseTurn(m) ?? ['U', 0];
      return { face, amt, orig };
    }).filter((i) => i.amt);
  }

  get done(): boolean {
    return this.queue.length === 0;
  }

  /** Turns that undo mistakes, still to be done. */
  get fixes(): number {
    return this.queue.reduce((n, i) => n + (i.orig < 0 ? 1 : 0), 0);
  }

  /** Feed one turn from the cube. Returns false when it was a wrong turn. */
  turn(move: string): boolean {
    const t = parseTurn(move);
    if (!t) return false;
    const [face, amt] = t;
    const q = this.queue;
    let at = -1;
    if (q[0]?.face === face) at = 0;
    else if (q[0] && q[1]?.face === face && AXIS[q[0].face] === AXIS[face]) at = 1;
    if (at >= 0) {
      const item = q[at]!;
      const left = (item.amt - amt + 4) % 4;
      if (left === 0) q.splice(at, 1);
      else item.amt = left;
      return true;
    }
    q.unshift({ face, amt: (4 - amt) % 4, orig: -1 });
    return false;
  }

  /** The scramble as it should be shown: what's been done, then what's left. */
  steps(): Step[] {
    const pending = new Set(this.queue.filter((i) => i.orig >= 0).map((i) => i.orig));
    const out: Step[] = [];
    this.moves.forEach((m, i) => { if (!pending.has(i)) out.push({ move: m, state: 'done' }); });
    this.queue.forEach((item, i) => out.push({
      move: name(item.face, item.amt),
      state: item.orig < 0 ? 'fix' : i === 0 ? 'current' : 'todo',
    }));
    return out;
  }
}
