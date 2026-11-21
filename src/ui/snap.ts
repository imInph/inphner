/**
 * inphner: PURE geometry for the floating tool windows (views/tools.ts).
 * Snapping to the screen and to each other, which windows touch (and so stick
 * together), keeping a dragged group on screen, and pushing the windows below
 * or beside one that grew. No DOM: rects in, offsets out.
 */

export interface Rect { x: number; y: number; w: number; h: number }
export interface View { w: number; h: number }

/** The space between two windows stuck together. */
export const GAP = 6;
/** How close an edge must come before it snaps. */
export const SNAP = 12;

const shift = (r: Rect, dx: number, dy: number): Rect => ({ ...r, x: r.x + dx, y: r.y + dy });

/** Whether two ranges overlap, or come within `slack` of it. */
function near(a0: number, a1: number, b0: number, b1: number, slack: number): boolean {
  return a0 < b1 + slack && b0 < a1 + slack;
}

/** The smallest of the candidate corrections within SNAP, or 0. */
function best(candidates: number[]): number {
  let pick = 0;
  let size = Infinity;
  for (const c of candidates) {
    if (Math.abs(c) <= SNAP && Math.abs(c) < size) { pick = c; size = Math.abs(c); }
  }
  return pick;
}

/**
 * The correction that snaps a moving group (already at its dragged position)
 * to the screen's margins and to the edges of the windows around it: beside
 * one (GAP apart) or lined up with it. Each axis snaps on its own.
 */
export function snapOffset(moving: readonly Rect[], others: readonly Rect[], view: View, margin: number): { dx: number; dy: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const m of moving) {
    xs.push(margin - m.x, view.w - margin - (m.x + m.w));
    ys.push(margin - m.y, view.h - margin - (m.y + m.h));
    for (const o of others) {
      // Only windows that are (nearly) beside or above/below count, so a window
      // across the screen never tugs at this one.
      if (near(m.y, m.y + m.h, o.y, o.y + o.h, GAP + SNAP)) {
        xs.push(o.x + o.w + GAP - m.x, o.x - GAP - (m.x + m.w), o.x - m.x, o.x + o.w - (m.x + m.w));
      }
      if (near(m.x, m.x + m.w, o.x, o.x + o.w, GAP + SNAP)) {
        ys.push(o.y + o.h + GAP - m.y, o.y - GAP - (m.y + m.h), o.y - m.y, o.y + o.h - (m.y + m.h));
      }
    }
  }
  return { dx: best(xs), dy: best(ys) };
}

/** Two windows stuck together: side by side GAP apart, overlapping along that side. */
export function touching(a: Rect, b: Rect, tolerance = 1): boolean {
  const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
  const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
  const side = Math.abs(a.x + a.w + GAP - b.x) <= tolerance || Math.abs(b.x + b.w + GAP - a.x) <= tolerance;
  const stack = Math.abs(a.y + a.h + GAP - b.y) <= tolerance || Math.abs(b.y + b.h + GAP - a.y) <= tolerance;
  return (side && overlapY) || (stack && overlapX);
}

/**
 * Limits a drag so the group stays reachable: inside the screen's margins left,
 * right and top, and its top never lower than `keep` above the bottom (so a
 * header is always there to grab). A group wider than the screen keeps its left.
 */
export function clampOffset(moving: readonly Rect[], dx: number, dy: number, view: View, margin: number, keep: number): { dx: number; dy: number } {
  if (!moving.length) return { dx, dy };
  const left = Math.min(...moving.map((r) => r.x)) + dx;
  const right = Math.max(...moving.map((r) => r.x + r.w)) + dx;
  const top = Math.min(...moving.map((r) => r.y)) + dy;
  let cx = 0;
  if (right > view.w - margin) cx = view.w - margin - right;
  if (left + cx < margin) cx = margin - left;
  let cy = 0;
  const maxTop = Math.max(margin, view.h - keep);
  if (top > maxTop) cy = maxTop - top;
  if (top + cy < margin) cy = margin - top;
  return { dx: dx + cx, dy: dy + cy };
}

/**
 * One window of a group changed size from `before` to `after`: the windows
 * beyond its old bottom edge move down (or up) by the change in height, and
 * those beyond its old right edge move across by the change in width, so a
 * stack stays a stack when one of its windows folds or is resized.
 */
export function reflow(before: Rect, after: Rect, rest: readonly Rect[]): Rect[] {
  const dh = after.h - before.h;
  const dw = after.w - before.w;
  const bottom = before.y + before.h;
  const right = before.x + before.w;
  return rest.map((r) => shift(r, r.x >= right - 1 ? dw : 0, r.y >= bottom - 1 ? dh : 0));
}

/** Groups as lists of indexes, given which pairs are linked (union–find). */
export function components(count: number, links: readonly [number, number][]): number[][] {
  const parent = Array.from({ length: count }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (const [a, b] of links) parent[find(a)] = find(b);
  const out = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    const root = find(i);
    out.set(root, [...(out.get(root) ?? []), i]);
  }
  return [...out.values()];
}

/* ------------------------------------------------------------- anchors */

export type Side = 'left' | 'right' | 'above' | 'below';
/** Which edges of an anchor a stuck window keeps its distance from. */
export interface Edges { ax: 'l' | 'r'; ay: 't' | 'b' }

/** Which side of `b` the window `a` is stuck to, or null if it isn't. */
export function attachSide(a: Rect, b: Rect, tolerance = 1): Side | null {
  const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
  const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
  if (overlapY && Math.abs(a.x + a.w + GAP - b.x) <= tolerance) return 'left';
  if (overlapY && Math.abs(b.x + b.w + GAP - a.x) <= tolerance) return 'right';
  if (overlapX && Math.abs(a.y + a.h + GAP - b.y) <= tolerance) return 'above';
  if (overlapX && Math.abs(b.y + b.h + GAP - a.y) <= tolerance) return 'below';
  return null;
}

/**
 * The edges to measure from, so a window keeps to the side it is stuck on: one
 * under a card follows its bottom as the card grows, one on its right follows
 * its right edge as it widens.
 */
export function edgesFor(side: Side): Edges {
  return { ax: side === 'right' ? 'r' : 'l', ay: side === 'below' ? 'b' : 't' };
}

export function offsetFrom(anchor: Rect, at: { x: number; y: number }, e: Edges): { dx: number; dy: number } {
  return {
    dx: at.x - (e.ax === 'r' ? anchor.x + anchor.w : anchor.x),
    dy: at.y - (e.ay === 'b' ? anchor.y + anchor.h : anchor.y),
  };
}

export function positionFrom(anchor: Rect, off: { dx: number; dy: number }, e: Edges): { x: number; y: number } {
  return {
    x: (e.ax === 'r' ? anchor.x + anchor.w : anchor.x) + off.dx,
    y: (e.ay === 'b' ? anchor.y + anchor.h : anchor.y) + off.dy,
  };
}

/* ------------------------------------------------------- attach while dragging */

/** How close a window must come, in px, before it jumps into place to stick. */
export const REACH = 32;

export interface Attach {
  /** Which target (index into the list given). */
  index: number;
  /** The side of the target the group will sit on. */
  side: Side;
  /** The shift that puts the group exactly there: GAP apart, lined up when close. */
  dx: number;
  dy: number;
}

/**
 * The target a dragged group would stick to, and how far it must move to sit
 * exactly beside it. Generous on purpose: an edge within `reach` counts. But
 * the two must really overlap along that edge, so a window that is below a
 * card is never read as beside it. The nearest wins; within 4px, the one
 * sharing the longer edge. The shift also lines up the nearer pair of edges
 * (left or right, top or bottom) when they're within `reach`.
 */
export function findAttach(moving: readonly Rect[], targets: readonly Rect[], reach = REACH): Attach | null {
  let best: (Attach & { dist: number; shared: number }) | null = null;
  const better = (dist: number, shared: number): boolean =>
    !best || dist < best.dist - 4 || (Math.abs(dist - best.dist) <= 4 && shared > best.shared);
  const consider = (a: Attach, dist: number, shared: number): void => {
    if (dist <= reach && better(dist, shared)) best = { ...a, dist, shared };
  };
  /** The smaller of two alignments within reach, or 0. */
  const align = (a: number, b: number): number => {
    const ok = [a, b].filter((d) => Math.abs(d) <= reach);
    return ok.length ? ok.reduce((x, y) => (Math.abs(y) < Math.abs(x) ? y : x)) : 0;
  };
  moving.forEach((m) => {
    targets.forEach((t, index) => {
      const sharedY = Math.min(m.y + m.h, t.y + t.h) - Math.max(m.y, t.y);
      const sharedX = Math.min(m.x + m.w, t.x + t.w) - Math.max(m.x, t.x);
      if (sharedY > 0) {
        const dy = align(t.y - m.y, t.y + t.h - (m.y + m.h));
        const toLeft = t.x - GAP - (m.x + m.w);
        const toRight = t.x + t.w + GAP - m.x;
        consider({ index, side: 'left', dx: toLeft, dy }, Math.abs(toLeft), sharedY);
        consider({ index, side: 'right', dx: toRight, dy }, Math.abs(toRight), sharedY);
      }
      if (sharedX > 0) {
        const dx = align(t.x - m.x, t.x + t.w - (m.x + m.w));
        const above = t.y - GAP - (m.y + m.h);
        const below = t.y + t.h + GAP - m.y;
        consider({ index, side: 'above', dx, dy: above }, Math.abs(above), sharedX);
        consider({ index, side: 'below', dx, dy: below }, Math.abs(below), sharedX);
      }
    });
  });
  if (!best) return null;
  const { dist: _d, shared: _s, ...attach } = best as Attach & { dist: number; shared: number };
  return attach;
}
