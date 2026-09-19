/**
 * The trainer's case data is checked here, not trusted: every bundled alg
 * must keep F2L intact and land in exactly the class its name claims.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cube3x3x3 } from 'cubing/puzzles';
import pll from '../data/trainer/pll.json' with { type: 'json' };
import oll from '../data/trainer/oll.json' with { type: 'json' };
import {
  aufVariants, enumerateOll, enumeratePll, invertAlg, llFromAlg, ollKey, pllKey, SOLVED_LL, type LL,
} from './ll.ts';
import { applyScramble, isSolved, solvedCube } from '../scramble/nxn.ts';

const byId = new Map(pll.cases.map((c) => [c.id, c]));
const state = (alg: string): LL => {
  const s = llFromAlg(alg);
  assert.ok(s, `alg keeps F2L intact: ${alg}`);
  return s!;
};

test('enumeration: exactly 21 PLL and 57 OLL classes', () => {
  assert.equal(enumeratePll().length, 21);
  assert.equal(enumerateOll().length, 57);
});

test('every PLL alg is a valid PLL, and the 21 algs cover the 21 classes once each', () => {
  const keys = new Set<string>();
  for (const c of pll.cases) {
    const s = state(c.alg);
    assert.deepEqual([...s.co, ...s.eo], [0, 0, 0, 0, 0, 0, 0, 0], `${c.id} leaves the LL oriented`);
    keys.add(pllKey(s));
    // And the alg really solves its setup (whole cube, colours by centre).
    const cube = solvedCube(3);
    applyScramble(cube, invertAlg(c.alg));
    applyScramble(cube, c.alg);
    assert.ok(isSolved(cube), `${c.id} solves its own case`);
  }
  assert.equal(pll.cases.length, 21);
  assert.equal(keys.size, 21, 'no two PLL algs solve the same case');
  assert.deepEqual([...keys].sort(), enumeratePll().map(pllKey).sort());
});

const isId = (p: number[]) => p.every((x, i) => x === i);
const swapOf = (p: number[]) => {
  const moved = p.map((x, i) => (x !== i ? i : -1)).filter((i) => i >= 0);
  return moved.length === 2 ? moved : null;
};

test('PLL groups match the permutation structure', () => {
  for (const c of pll.cases) {
    const vs = aufVariants(state(c.alg));
    const cornersSolvable = vs.some((v) => isId(v.cp));
    const edgesSolvable = vs.some((v) => isId(v.ep));
    const adjacent = vs.some((v) => { const s = swapOf(v.cp); return !!s && (s[1]! - s[0]! === 1 || s[1]! - s[0]! === 3); });
    const diagonal = vs.some((v) => { const s = swapOf(v.cp); return !!s && s[1]! - s[0]! === 2; });
    if (c.group === 'edges') assert.ok(cornersSolvable, `${c.id}: corners untouched`);
    if (c.group === 'corners') assert.ok(edgesSolvable && !cornersSolvable, `${c.id}: edges untouched`);
    if (c.group === 'adjacent') assert.ok(adjacent && !cornersSolvable && !edgesSolvable, `${c.id}: adjacent corner swap`);
    if (c.group === 'diagonal') assert.ok(diagonal && !adjacent && !edgesSolvable, `${c.id}: diagonal corner swap`);
  }
});

test('PLL inverse pairs: Ua/Ub, Aa/Ab, Ga/Gb, Gc/Gd; the rest are their own inverse', () => {
  const inv = (id: string) => pllKey(state(invertAlg(byId.get(id)!.alg)));
  const k = (id: string) => pllKey(state(byId.get(id)!.alg));
  for (const [a, b] of [['Ua', 'Ub'], ['Aa', 'Ab'], ['Ga', 'Gb'], ['Gc', 'Gd']]) {
    assert.equal(inv(a!), k(b!), `${a}⁻¹ is ${b}`);
  }
  for (const id of ['H', 'Z', 'E', 'T', 'F', 'Ja', 'Jb', 'Ra', 'Rb', 'V', 'Y', 'Na', 'Nb']) assert.equal(inv(id), k(id), `${id} is self-inverse`);
  // H swaps opposite edges; Z adjacent ones.
  const h = aufVariants(state(byId.get('H')!.alg)).find((v) => isId(v.cp))!;
  assert.deepEqual(h.ep, [2, 3, 0, 1]);
});

test('OLL: the named algs keep F2L, and the 7 OCLL algs cover the 7 OCLL classes', () => {
  const ocll = enumerateOll().filter((s) => s.eo.every((x) => x === 0));
  assert.equal(ocll.length, 7);
  const keys = new Set<string>();
  for (const c of oll.named) {
    const s = state(c.alg);
    assert.ok(s.eo.every((x) => x === 0), `${c.id} is an OCLL (edges oriented)`);
    keys.add(ollKey(s));
  }
  assert.equal(keys.size, 7);
  assert.deepEqual([...keys].sort(), ocll.map(ollKey).sort());
  // Sune/Antisune have one oriented corner; H/Pi none; the other three two.
  const oriented = (id: string) => state(oll.named.find((x) => x.id === id)!.alg).co.filter((x) => x === 0).length;
  assert.equal(oriented('OLL 27'), 1);
  assert.equal(oriented('OLL 26'), 1);
  assert.equal(oriented('OLL 21'), 0);
  assert.equal(oriented('OLL 22'), 0);
  for (const id of ['OLL 23', 'OLL 24', 'OLL 25']) assert.equal(oriented(id), 2);
});

test('our LL reading agrees with cubing.js (piece order and orientation convention)', async () => {
  const kp = await cube3x3x3.kpuzzle();
  for (const alg of ["R U R' U R U2 R'", "R U R' U' R' F R2 U' R' U' R U R' F'", "F R U R' U' F'", "r U R' U' r' F R F'", "R U2 R2 U' R2 U' R2 U2 R"]) {
    const ours = state(alg);
    const p = kp.defaultPattern().applyAlg(invertAlg(alg)).patternData;
    assert.deepEqual(p.CORNERS!.pieces.slice(0, 4), ours.cp, `corners of ${alg}`);
    assert.deepEqual(p.CORNERS!.orientation.slice(0, 4), ours.co, `corner twist of ${alg}`);
    assert.deepEqual(p.EDGES!.pieces.slice(0, 4), ours.ep, `edges of ${alg}`);
    assert.deepEqual(p.EDGES!.orientation.slice(0, 4), ours.eo, `edge flip of ${alg}`);
  }
  assert.deepEqual(state(''), SOLVED_LL);
});

test('trainer sets: PLL 21, OLL 57 (7 named), F2L 41', async () => {
  const { getSet } = await import('./cases.ts');
  assert.equal(getSet('pll').cases.length, 21);
  const o = getSet('oll');
  assert.equal(o.cases.length, 57);
  assert.equal(o.cases.filter((c) => !c.unnamed).length, 7);
  assert.equal(new Set(o.cases.map((c) => c.key)).size, 57);
  assert.equal(getSet('f2l').cases.length, 41);
});
