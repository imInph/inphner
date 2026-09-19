/**
 * inphner: the trainer's case sets, built from the verified data.
 *
 *   PLL     21 cases, standard names + algs (src/data/trainer/pll.json)
 *   OLL     57 enumerated classes; the 7 OCLL carry their number, name, alg;
 *           the rest are unnamed slots grouped by edge shape, still trainable
 *   F2L     41 enumerated cases with descriptive names, no bundled algs
 *   Custom  cases the user adds (name + alg)
 *   COLL, CMLL, ZBLL, 2x2 CLL, EG-1, EG-2: data-only shells until their case
 *   data is added (src/data/trainer/shells.json)
 */
import pllData from '../data/trainer/pll.json' with { type: 'json' };
import ollData from '../data/trainer/oll.json' with { type: 'json' };
import shellData from '../data/trainer/shells.json' with { type: 'json' };
import { enumerateOll, llFromAlg, ollKey, type LL } from './ll.ts';
import { enumerateF2L, F2L_GROUPS, type F2LCase } from './f2l.ts';

export type SetId = 'pll' | 'oll' | 'f2l' | 'custom';

export interface TrainerCase {
  /** "<set>:<id>", the storage key. */
  key: string;
  set: SetId;
  id: string;
  name: string;
  group: string;
  /** Bundled default alg ('' when none). */
  alg: string;
  /** True for enumerated OLL slots without their standard number yet. */
  unnamed?: boolean;
  kind: 'll' | 'f2l' | 'custom';
  ll?: LL;
  f2l?: F2LCase;
  /** Diagram style for LL cases. */
  style?: 'pll' | 'oll';
}

export interface TrainerSet {
  id: SetId;
  name: string;
  groups: { id: string; name: string }[];
  cases: TrainerCase[];
}

export interface ShellSet { id: string; name: string; count: string; groups: string[]; note: string }

export const SHELLS: ShellSet[] = shellData.sets;

let pll: TrainerSet | null = null;
let oll: TrainerSet | null = null;
let f2l: TrainerSet | null = null;

function buildPll(): TrainerSet {
  return {
    id: 'pll', name: 'PLL', groups: pllData.groups,
    cases: pllData.cases.map((c) => ({
      key: `pll:${c.id}`, set: 'pll' as const, id: c.id, name: `${c.id} perm`, group: c.group, alg: c.alg,
      kind: 'll' as const, ll: llFromAlg(c.alg)!, style: 'pll' as const,
    })),
  };
}

const OLL_GROUPS = [
  { id: 'ocll', name: 'Edges oriented (OCLL)' },
  { id: 'line', name: 'Line' },
  { id: 'lshape', name: 'L shape' },
  { id: 'dot', name: 'Dot' },
];

function ollGroup(s: LL): string {
  const flipped = s.eo.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
  if (!flipped.length) return 'ocll';
  if (flipped.length === 4) return 'dot';
  return Math.abs(flipped[0]! - flipped[1]!) === 2 ? 'line' : 'lshape';
}

function buildOll(): TrainerSet {
  const named = new Map(ollData.named.map((n) => [ollKey(llFromAlg(n.alg)!), n]));
  const counters = new Map<string, number>();
  const cases = enumerateOll().map((s) => {
    const group = ollGroup(s);
    const n = named.get(ollKey(s));
    if (n) {
      return { key: `oll:${n.id}`, set: 'oll' as const, id: n.id, name: `${n.id} · ${n.name}`, group, alg: n.alg, kind: 'll' as const, ll: s, style: 'oll' as const };
    }
    const i = (counters.get(group) ?? 0) + 1;
    counters.set(group, i);
    const label = OLL_GROUPS.find((g) => g.id === group)!.name.split(' (')[0];
    // A stable id from the orientation class, so stats survive naming it later.
    return { key: `oll:${ollKey(s)}`, set: 'oll' as const, id: ollKey(s), name: `${label} · ${i}`, group, alg: '', unnamed: true, kind: 'll' as const, ll: s, style: 'oll' as const };
  });
  const order = (c: TrainerCase) => OLL_GROUPS.findIndex((g) => g.id === c.group) * 100 + (c.unnamed ? 50 : 0) + (parseInt(c.id.replace(/\D/g, ''), 10) || 0) / 100;
  cases.sort((a, b) => order(a) - order(b));
  return { id: 'oll', name: 'OLL', groups: OLL_GROUPS, cases };
}

function buildF2L(): TrainerSet {
  return {
    id: 'f2l', name: 'F2L', groups: F2L_GROUPS,
    cases: enumerateF2L().map((c) => ({ key: `f2l:${c.id}`, set: 'f2l' as const, id: c.id, name: c.name, group: c.group, alg: '', kind: 'f2l' as const, f2l: c })),
  };
}

export interface CustomCase { id: string; name: string; alg: string }

export function customSet(list: CustomCase[]): TrainerSet {
  return {
    id: 'custom', name: 'Custom', groups: [{ id: 'custom', name: 'Your cases' }],
    cases: list.map((c) => {
      const ll = llFromAlg(c.alg);
      return {
        key: `custom:${c.id}`, set: 'custom' as const, id: c.id, name: c.name, group: 'custom', alg: c.alg,
        kind: ll ? 'll' as const : 'custom' as const, ...(ll ? { ll, style: 'pll' as const } : {}),
      };
    }),
  };
}

export function getSet(id: SetId, custom: CustomCase[] = []): TrainerSet {
  if (id === 'pll') return (pll ??= buildPll());
  if (id === 'oll') return (oll ??= buildOll());
  if (id === 'f2l') return (f2l ??= buildF2L());
  return customSet(custom);
}
