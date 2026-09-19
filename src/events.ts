/**
 * inphner: every event (inphner-prompt.md §A3). WCA ids where they exist.
 *
 * Scramblers:
 *   wca     random-state, cubing.js randomScrambleForEvent(id) in its worker
 *   subset  random state of a 3x3 subset (states.ts), solved + inverted by cubing.js
 *   moves   random moves over a move set (2GEN, 3GEN, custom length, LSE)
 *   none    no scramble (PLL/OLL attack, "none")
 *
 * Training-event definitions decided by the author (documented in CLAUDE.md):
 *   cross, roux  a normal random-state 3x3 scramble; the event exists so the
 *                practice gets its own sessions and stats (solve only the cross /
 *                the first block). The cross solver hint (Tools) complements it.
 *   f2l          last layer solved, the rest random ("an LL-solved scramble").
 *   ll           F2L solved, a random last layer.
 */

export type Scrambler =
  | { kind: 'wca'; id: string }
  | { kind: 'subset'; subset: 'll' | 'f2l' }
  | { kind: 'moves'; gen: '2gen' | '3gen' | 'lse' | 'custom' }
  | { kind: 'none'; note: string };

export interface EventDef {
  id: string;
  name: string;
  /** Short label for pills and lists. */
  short: string;
  group: 'wca' | 'training';
  /** cubing/icons id (src/data/event-icons.ts); training events borrow 333's. */
  icon: string;
  scrambler: Scrambler;
  /** Results are move counts (FMC) rather than times. */
  moves?: boolean;
}

export const EVENTS: EventDef[] = [
  { id: '333', name: '3x3x3 Cube', short: '3x3', group: 'wca', icon: '333', scrambler: { kind: 'wca', id: '333' } },
  { id: '222', name: '2x2x2 Cube', short: '2x2', group: 'wca', icon: '222', scrambler: { kind: 'wca', id: '222' } },
  { id: '444', name: '4x4x4 Cube', short: '4x4', group: 'wca', icon: '444', scrambler: { kind: 'wca', id: '444' } },
  { id: '555', name: '5x5x5 Cube', short: '5x5', group: 'wca', icon: '555', scrambler: { kind: 'wca', id: '555' } },
  { id: '666', name: '6x6x6 Cube', short: '6x6', group: 'wca', icon: '666', scrambler: { kind: 'wca', id: '666' } },
  { id: '777', name: '7x7x7 Cube', short: '7x7', group: 'wca', icon: '777', scrambler: { kind: 'wca', id: '777' } },
  { id: '333oh', name: '3x3x3 One-Handed', short: '3x3 OH', group: 'wca', icon: '333oh', scrambler: { kind: 'wca', id: '333' } },
  { id: '333bf', name: '3x3x3 Blindfolded', short: '3x3 BLD', group: 'wca', icon: '333bf', scrambler: { kind: 'wca', id: '333bf' } },
  { id: '444bf', name: '4x4x4 Blindfolded', short: '4x4 BLD', group: 'wca', icon: '444bf', scrambler: { kind: 'wca', id: '444bf' } },
  { id: '555bf', name: '5x5x5 Blindfolded', short: '5x5 BLD', group: 'wca', icon: '555bf', scrambler: { kind: 'wca', id: '555bf' } },
  { id: '333mbf', name: '3x3x3 Multi-Blind', short: 'Multi-BLD', group: 'wca', icon: '333mbf', scrambler: { kind: 'wca', id: '333bf' } },
  { id: '333fm', name: '3x3x3 Fewest Moves', short: 'FMC', group: 'wca', icon: '333fm', scrambler: { kind: 'wca', id: '333fm' }, moves: true },
  { id: 'clock', name: 'Clock', short: 'Clock', group: 'wca', icon: 'clock', scrambler: { kind: 'wca', id: 'clock' } },
  { id: 'minx', name: 'Megaminx', short: 'Megaminx', group: 'wca', icon: 'minx', scrambler: { kind: 'wca', id: 'minx' } },
  { id: 'pyram', name: 'Pyraminx', short: 'Pyraminx', group: 'wca', icon: 'pyram', scrambler: { kind: 'wca', id: 'pyram' } },
  { id: 'skewb', name: 'Skewb', short: 'Skewb', group: 'wca', icon: 'skewb', scrambler: { kind: 'wca', id: 'skewb' } },
  { id: 'sq1', name: 'Square-1', short: 'Square-1', group: 'wca', icon: 'sq1', scrambler: { kind: 'wca', id: 'sq1' } },

  { id: '333len', name: '3x3 · custom length', short: '3x3 · N moves', group: 'training', icon: '333', scrambler: { kind: 'moves', gen: 'custom' } },
  { id: 'lse', name: 'LSE (Roux last six edges)', short: 'LSE', group: 'training', icon: '333', scrambler: { kind: 'moves', gen: 'lse' } },
  { id: '2gen', name: '2GEN ⟨R, U⟩', short: '2GEN', group: 'training', icon: '333', scrambler: { kind: 'moves', gen: '2gen' } },
  { id: '3gen', name: '3GEN ⟨R, U, F⟩', short: '3GEN', group: 'training', icon: '333', scrambler: { kind: 'moves', gen: '3gen' } },
  { id: 'roux', name: 'Roux first block', short: 'Roux block', group: 'training', icon: '333', scrambler: { kind: 'wca', id: '333' } },
  { id: 'cross', name: 'Cross only', short: 'Cross', group: 'training', icon: '333', scrambler: { kind: 'wca', id: '333' } },
  { id: 'f2l', name: 'F2L only (last layer solved)', short: 'F2L', group: 'training', icon: '333', scrambler: { kind: 'subset', subset: 'f2l' } },
  { id: 'll', name: 'Last layer (random LL)', short: 'Last layer', group: 'training', icon: '333', scrambler: { kind: 'subset', subset: 'll' } },
  { id: 'pllatt', name: 'PLL attack', short: 'PLL attack', group: 'training', icon: '333', scrambler: { kind: 'none', note: 'All 21 PLLs in a row, from solved.' } },
  { id: 'ollatt', name: 'OLL attack', short: 'OLL attack', group: 'training', icon: '333', scrambler: { kind: 'none', note: 'All 57 OLLs in a row, from solved.' } },
  { id: 'none', name: 'No scramble', short: 'None', group: 'training', icon: '', scrambler: { kind: 'none', note: 'Just time.' } },
];

const BY_ID = new Map(EVENTS.map((e) => [e.id, e]));

export function eventDef(id: string): EventDef {
  return BY_ID.get(id) ?? BY_ID.get('333')!;
}

export function isEvent(id: string): boolean {
  return BY_ID.has(id);
}
