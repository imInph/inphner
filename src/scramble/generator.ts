/**
 * inphner: scramble generation with a one-ahead prefetch per event, so "next"
 * is instant and a new scramble is ready by the time a solve ends.
 *
 * cubing.js is imported lazily (its own chunk + worker) so it never delays
 * the first paint; random-state scrambles run in cubing.js's worker. A
 * scramble is stored with its solve and is never regenerated.
 */
import { eventDef } from '../events.ts';
import { prefs } from '../prefs.ts';
import { lseScramble, normalizeScramble, randomMoves } from './moves.ts';
import { F2L_CORNERS, F2L_EDGES, U_CORNERS, U_EDGES, randomSubsetState } from './states.ts';

type Cubing = {
  randomScrambleForEvent: (id: string) => Promise<{ toString(): string }>;
};
let cubingScramble: Promise<Cubing> | null = null;
function loadScramble(): Promise<Cubing> {
  cubingScramble ??= (async () => {
    // cubing.js logs a timing line per scramble; keep the console quiet.
    const { setSearchDebug } = await import('cubing/search');
    setSearchDebug({ logPerf: false });
    return import('cubing/scramble') as Promise<Cubing>;
  })();
  return cubingScramble;
}

async function subsetScramble(subset: 'll' | 'f2l'): Promise<string> {
  const [{ cube3x3x3 }, { KPattern }, { experimentalSolve3x3x3IgnoringCenters }] = await Promise.all([
    import('cubing/puzzles'), import('cubing/kpuzzle'), import('cubing/search'),
  ]);
  const kpuzzle = await cube3x3x3.kpuzzle();
  const state = subset === 'll' ? randomSubsetState(U_EDGES, U_CORNERS) : randomSubsetState(F2L_EDGES, F2L_CORNERS);
  const data = structuredClone(kpuzzle.definition.defaultPattern) as unknown as Record<string, { pieces: number[]; orientation: number[] }>;
  data.EDGES = state.EDGES;
  data.CORNERS = state.CORNERS;
  const pattern = new KPattern(kpuzzle, data as never);
  const solution = await experimentalSolve3x3x3IgnoringCenters(pattern);
  return solution.invert().toString();
}

async function generate(eventId: string): Promise<string> {
  const def = eventDef(eventId);
  const s = def.scrambler;
  switch (s.kind) {
    case 'none':
      return '';
    case 'moves':
      if (s.gen === 'lse') return lseScramble(20).join(' ');
      if (s.gen === '2gen') return randomMoves(['R', 'U'], 25).join(' ');
      if (s.gen === '3gen') return randomMoves(['R', 'U', 'F'], 25).join(' ');
      return randomMoves(['R', 'U', 'F', 'L', 'D', 'B'], prefs().customLength).join(' ');
    case 'subset':
      return normalizeScramble(await subsetScramble(s.subset));
    case 'wca': {
      const { randomScrambleForEvent } = await loadScramble();
      if (eventId === '333mbf') {
        // One 3BLD scramble per cube, numbered, one per line.
        const n = prefs().multiCubes;
        const list: string[] = [];
        for (let i = 0; i < n; i++) list.push(normalizeScramble((await randomScrambleForEvent('333bf')).toString()));
        return list.map((x, i) => `${i + 1}. ${x}`).join('\n');
      }
      return normalizeScramble((await randomScrambleForEvent(s.id)).toString());
    }
  }
}

/** Prefetched next scramble per event (keyed with the custom length so a change isn't stale). */
const ahead = new Map<string, Promise<string>>();
const keyOf = (eventId: string) => (eventId === '333len' ? `333len:${prefs().customLength}`
  : eventId === '333mbf' ? `333mbf:${prefs().multiCubes}` : eventId);

function prefetch(eventId: string): Promise<string> {
  const key = keyOf(eventId);
  let p = ahead.get(key);
  if (!p) {
    p = generate(eventId);
    // A failed generation must not poison the cache.
    p.catch(() => ahead.delete(key));
    ahead.set(key, p);
  }
  return p;
}

/** Take the ready scramble for an event and start generating the one after it. */
export async function nextScramble(eventId: string): Promise<string> {
  const key = keyOf(eventId);
  const p = prefetch(eventId);
  ahead.delete(key);
  const scramble = await p;
  void prefetch(eventId).catch(() => {});
  return scramble;
}

/** Warm the pipeline (called when an event is selected). */
export function warm(eventId: string): void {
  void prefetch(eventId).catch(() => {});
}
