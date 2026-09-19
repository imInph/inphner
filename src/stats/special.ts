/**
 * inphner: results for the two events that aren't a time. Pure, unit-tested.
 *
 * FMC (WCA Article E / Regulation 12a): allowed notation is face turns
 * R U F L D B, wide turns (Rw …) and rotations x y z, each with nothing, ' or
 * 2 (2' accepted). Face and wide turns count 1 move each (OBTM); rotations
 * count 0. Slice moves (M E S) aren't allowed. A solution may have at most
 * 80 moves.
 *
 * Multi-BLD (Regulation 9f12): points = solved − unsolved. The result is DNF
 * when points are below 0 or fewer than 2 cubes are solved. Ranking: more
 * points, then less time.
 */

export const FMC_MAX_MOVES = 80;
export const FMC_LIMIT_MS = 60 * 60 * 1000;

export interface FmcParse {
  moves: number;
  tokens: string[];
  error?: string;
}

const FMC_TOKEN = /^(?:[RUFLDB]w?|[xyz])(?:2'?|')?$/;

export function parseFmc(solution: string): FmcParse {
  const tokens = solution.replace(/\/\/.*$/gm, '').split(/\s+/).filter(Boolean);
  let moves = 0;
  for (const t of tokens) {
    if (/^[MESmes]/.test(t)) return { moves, tokens, error: `Slice moves aren't allowed in FMC ("${t}"): write them as two outer turns.` };
    if (!FMC_TOKEN.test(t)) return { moves, tokens, error: `"${t}" isn't valid FMC notation (R U F L D B, Rw…, x y z).` };
    if (!/^[xyz]/.test(t)) moves++;
  }
  if (!tokens.length) return { moves: 0, tokens, error: 'Write a solution first.' };
  if (moves > FMC_MAX_MOVES) return { moves, tokens, error: `That's ${moves} moves; a solution may have at most ${FMC_MAX_MOVES}.` };
  return { moves, tokens };
}

export function multiPoints(solved: number, attempted: number): number {
  return solved - (attempted - solved);
}

export function multiIsDnf(solved: number, attempted: number): boolean {
  return multiPoints(solved, attempted) < 0 || solved < 2;
}

/** Sort key for Multi-BLD (lower is better): DNF last, more points first, then less time. */
export function multiRank(solved: number, attempted: number, timeMs: number, dnf: boolean): number {
  if (dnf || multiIsDnf(solved, attempted)) return Infinity;
  return -multiPoints(solved, attempted) * 1e9 + timeMs;
}
