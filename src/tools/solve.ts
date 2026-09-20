/**
 * inphner: optimal solvers for the Tools hints (A9) — the cross, ZZ's EOLine
 * and Roux's first block. PURE, and meant to run in a worker.
 *
 * The spec suggests IDA*; a breadth-first table over the same tiny state space
 * is simpler and gives the *optimal* solution outright (the cross is at most 8
 * moves, and the table answers every later scramble instantly). The table is
 * built once, on the first request for that hint.
 */
import { solved as solvedCube, TABLE, turn, TURNS, type Cube } from './cube.ts';

/** Per move: where the edge in each slot goes, and whether it flips on the way. */
const EDGE_TO: Int8Array[] = [];
const EDGE_FLIP: Int8Array[] = [];
/** The same for corners, with the twist it picks up. */
const CORNER_TO: Int8Array[] = [];
const CORNER_TWIST: Int8Array[] = [];
for (const move of TURNS) {
  const t = TABLE[move]!;
  const eTo = new Int8Array(12);
  const eFlip = new Int8Array(12);
  for (let to = 0; to < 12; to++) { eTo[t.ep[to]!] = to; eFlip[t.ep[to]!] = t.eo[to]!; }
  EDGE_TO.push(eTo); EDGE_FLIP.push(eFlip);
  const cTo = new Int8Array(8);
  const cTwist = new Int8Array(8);
  for (let to = 0; to < 8; to++) { cTo[t.cp[to]!] = to; cTwist[t.cp[to]!] = t.co[to]!; }
  CORNER_TO.push(cTo); CORNER_TWIST.push(cTwist);
}

/** (slot, orientation) packed as slot*2+ori for edges, slot*3+ori for corners,
 *  so one move is one table lookup per tracked piece. */
const EDGE_PAIR: Int8Array[] = EDGE_TO.map((to, m) => {
  const t = new Int8Array(24);
  for (let slot = 0; slot < 12; slot++) {
    for (let ori = 0; ori < 2; ori++) t[slot * 2 + ori] = to[slot]! * 2 + ((ori + EDGE_FLIP[m]![slot]!) % 2);
  }
  return t;
});
const CORNER_PAIR: Int8Array[] = CORNER_TO.map((to, m) => {
  const t = new Int8Array(24);
  for (let slot = 0; slot < 8; slot++) {
    for (let ori = 0; ori < 3; ori++) t[slot * 3 + ori] = to[slot]! * 3 + ((ori + CORNER_TWIST[m]![slot]!) % 3);
  }
  return t;
});

const UNSEEN = 255;

export interface Solver {
  /** The optimal solution for this cube, as moves. */
  solve(cube: Cube): string[];
  /** How many moves that solution will be, without building it. */
  distance(cube: Cube): number;
  /** States in the table (built on the first solve). */
  size(): number;
}

/**
 * A solver for "get these pieces home", ignoring everything else: the cross is
 * the four D edges, Roux's first block is three edges and two corners.
 */
export function trackedSolver(edges: readonly number[], corners: readonly number[]): Solver {
  const count = edges.length + corners.length;
  const size = 24 ** count;
  let dist: Uint8Array | null = null;

  /** The index is `count` base-24 digits, one packed (slot, orientation) each. */
  const digits = new Int8Array(count);
  const split = (idx: number): void => {
    for (let i = count - 1; i >= 0; i--) {
      const v = idx % 24;
      idx = (idx - v) / 24;
      digits[i] = v;
    }
  };
  const join = (): number => {
    let idx = 0;
    for (let i = 0; i < count; i++) idx = idx * 24 + digits[i]!;
    return idx;
  };
  const step = (idx: number, move: number): number => {
    split(idx);
    for (let i = 0; i < count; i++) {
      digits[i] = i < edges.length ? EDGE_PAIR[move]![digits[i]!]! : CORNER_PAIR[move]![digits[i]!]!;
    }
    return join();
  };

  const goal = (): number => {
    edges.forEach((piece, i) => { digits[i] = piece * 2; });
    corners.forEach((piece, i) => { digits[edges.length + i] = piece * 3; });
    return join();
  };

  const build = (): Uint8Array => {
    const d = new Uint8Array(size).fill(UNSEEN);
    const queue = new Int32Array(size);
    let head = 0;
    let tail = 0;
    const start = goal();
    d[start] = 0;
    queue[tail++] = start;
    while (head < tail) {
      const idx = queue[head++]!;
      const next = d[idx]! + 1;
      for (let m = 0; m < TURNS.length; m++) {
        const to = step(idx, m);
        if (d[to] !== UNSEEN) continue;
        d[to] = next;
        queue[tail++] = to;
      }
    }
    return d;
  };

  const indexOf = (cube: Cube): number => {
    edges.forEach((piece, i) => {
      const slot = cube.ep.indexOf(piece);
      digits[i] = slot * 2 + cube.eo[slot]!;
    });
    corners.forEach((piece, i) => {
      const slot = cube.cp.indexOf(piece);
      digits[edges.length + i] = slot * 3 + cube.co[slot]!;
    });
    return join();
  };

  return {
    size: () => size,
    distance(cube: Cube): number {
      dist ??= build();
      return dist[indexOf(cube)]!;
    },
    solve(cube: Cube): string[] {
      dist ??= build();
      let idx = indexOf(cube);
      const out: string[] = [];
      let left = dist[idx]!;
      while (left > 0) {
        for (let m = 0; m < TURNS.length; m++) {
          const to = step(idx, m);
          if (dist[to] !== left - 1) continue;
          out.push(TURNS[m]!);
          idx = to;
          left--;
          break;
        }
      }
      return out;
    },
  };
}

/**
 * ZZ's EOLine: every edge oriented, DF and DB home. Orientation is our (and
 * cubing.js's) convention, in which only F and B quarter turns flip edges.
 */
export function eolineSolver(): Solver {
  const SIZE = 4096 * 144;
  let dist: Uint8Array | null = null;

  const pack = (eo: number, df: number, db: number) => eo * 144 + df * 12 + db;
  const step = (idx: number, move: number): number => {
    const eo = Math.floor(idx / 144);
    const rest = idx % 144;
    let df = Math.floor(rest / 12);
    let db = rest % 12;
    let next = 0;
    for (let slot = 0; slot < 12; slot++) {
      const bit = (eo >> slot) & 1;
      const to = EDGE_TO[move]![slot]!;
      next |= (bit ^ EDGE_FLIP[move]![slot]!) << to;
    }
    df = EDGE_TO[move]![df]!;
    db = EDGE_TO[move]![db]!;
    return pack(next, df, db);
  };

  const build = (): Uint8Array => {
    const d = new Uint8Array(SIZE).fill(UNSEEN);
    const start = pack(0, 4, 6);
    d[start] = 0;
    let frontier = [start];
    for (let depth = 0; frontier.length; depth++) {
      const next: number[] = [];
      for (const idx of frontier) {
        for (let m = 0; m < TURNS.length; m++) {
          const to = step(idx, m);
          if (d[to] !== UNSEEN) continue;
          d[to] = depth + 1;
          next.push(to);
        }
      }
      frontier = next;
    }
    return d;
  };

  const indexOf = (cube: Cube): number => {
    let eo = 0;
    for (let slot = 0; slot < 12; slot++) eo |= cube.eo[slot]! << slot;
    return pack(eo, cube.ep.indexOf(4), cube.ep.indexOf(6));
  };

  return {
    size: () => SIZE,
    distance(cube: Cube): number {
      dist ??= build();
      return dist[indexOf(cube)]!;
    },
    solve(cube: Cube): string[] {
      dist ??= build();
      let idx = indexOf(cube);
      const out: string[] = [];
      let left = dist[idx]!;
      while (left > 0) {
        for (let m = 0; m < TURNS.length; m++) {
          const to = step(idx, m);
          if (dist[to] !== left - 1) continue;
          out.push(TURNS[m]!);
          idx = to;
          left--;
          break;
        }
      }
      return out;
    },
  };
}

/** The cross: the four D-layer edges. */
export const crossSolver = (): Solver => trackedSolver([4, 5, 6, 7], []);
/** Roux's first block: the DL edge with FL and BL, and the DFL and DLB corners. */
export const firstBlockSolver = (): Solver => trackedSolver([7, 9, 11], [5, 6]);

/* ------------------------------------------------------------------ XCross */

/**
 * XCross: the cross **and** one F2L pair, solved together. Six pieces is far
 * too many for one table (24^6 states), so this is IDA* guided by two tables
 * that each leave one piece out — the cross with the pair's corner, and the
 * cross with the pair's edge. Both are exact for their own subproblem, so the
 * larger of the two is a safe lower bound, and the answer is still optimal.
 *
 * The pair solved is always the front-right slot of whatever orientation the
 * cube is handed over in, so the four F2L slots come from the caller turning
 * the cube (y, y2, y') — the same trick the other hints use for the front.
 */
export interface MultiSolver {
  /** The shortest solution among these cubes, and which one it belongs to. */
  solveBest(cubes: readonly Cube[]): { index: number; moves: string[] };
  ready(): void;
}

const PAIR_EDGE = 8;    // FR
const PAIR_CORNER = 4;  // DRF

export function xcrossSolver(): MultiSolver {
  const withCorner = trackedSolver([4, 5, 6, 7], [PAIR_CORNER]);
  const withEdge = trackedSolver([4, 5, 6, 7, PAIR_EDGE], []);

  const lowerBound = (cube: Cube): number => Math.max(withCorner.distance(cube), withEdge.distance(cube));

  const solvedXCross = (cube: Cube): boolean =>
    cube.ep[4] === 4 && cube.ep[5] === 5 && cube.ep[6] === 6 && cube.ep[7] === 7
    && cube.eo[4] === 0 && cube.eo[5] === 0 && cube.eo[6] === 0 && cube.eo[7] === 0
    && cube.ep[PAIR_EDGE] === PAIR_EDGE && cube.eo[PAIR_EDGE] === 0
    && cube.cp[PAIR_CORNER] === PAIR_CORNER && cube.co[PAIR_CORNER] === 0;

  /** Face index of a move, so a search never turns the same face twice in a row. */
  const faceOf = TURNS.map((t) => 'URFDLB'.indexOf(t[0]!));
  const OPPOSITE: Record<number, number> = { 0: 3, 3: 0, 1: 4, 4: 1, 2: 5, 5: 2 };

  /** Depth-first to exactly `bound`, returning the moves that reach it. */
  function search(cube: Cube, depth: number, bound: number, lastFace: number, path: string[]): string[] | null {
    if (depth === bound) return solvedXCross(cube) ? [...path] : null;
    if (depth + lowerBound(cube) > bound) return null;
    for (let m = 0; m < TURNS.length; m++) {
      const face = faceOf[m]!;
      if (face === lastFace) continue;
      // Opposite faces commute: only ever do them in one order.
      if (OPPOSITE[face] === lastFace && face > lastFace) continue;
      path.push(TURNS[m]!);
      const found = search(turn(cube, TURNS[m]!), depth + 1, bound, face, path);
      path.pop();
      if (found) return found;
    }
    return null;
  }

  return {
    ready() {
      // Build both tables now rather than in the middle of a search.
      withCorner.distance(solvedCube());
      withEdge.distance(solvedCube());
    },
    solveBest(cubes: readonly Cube[]): { index: number; moves: string[] } {
      this.ready();
      let bound = Math.min(...cubes.map(lowerBound));
      for (; bound <= 20; bound++) {
        for (let i = 0; i < cubes.length; i++) {
          const found = search(cubes[i]!, 0, bound, -1, []);
          if (found) return { index: i, moves: found };
        }
      }
      return { index: 0, moves: [] };
    },
  };
}
