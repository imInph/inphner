import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomMoves, lseScramble, quarterTurns, normalizeScramble, scrambleRows, scrambleLength } from './moves.ts';
import { solvedCube, applyScramble, faceGrids, isSolved, parseMove, cubeSize } from './nxn.ts';
import { randomSubsetState, permutationParity, isSolvedState, U_EDGES, U_CORNERS, F2L_EDGES, F2L_CORNERS } from './states.ts';

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AXIS: Record<string, string> = { R: 'x', L: 'x', M: 'x', U: 'y', D: 'y', F: 'z', B: 'z' };

test('randomMoves: right length, only the given faces, no repeats, no triple axis', () => {
  for (let seed = 1; seed < 200; seed++) {
    const moves = randomMoves(['R', 'U', 'F', 'L', 'D', 'B'], 25, rng(seed));
    assert.equal(moves.length, 25);
    for (let i = 0; i < moves.length; i++) {
      assert.match(moves[i]!, /^[RUFLDB]['2]?$/);
      if (i > 0) assert.notEqual(moves[i]![0], moves[i - 1]![0]);
      if (i > 1) assert.ok(!(AXIS[moves[i]![0]!] === AXIS[moves[i - 1]![0]!] && AXIS[moves[i]![0]!] === AXIS[moves[i - 2]![0]!]));
    }
  }
  assert.ok(randomMoves(['R', 'U'], 30, rng(3)).every((m) => /^[RU]/.test(m)));
});

test('LSE scrambles leave the corners solved (U turns sum to 0 mod 4)', () => {
  for (let seed = 1; seed < 100; seed++) {
    const moves = lseScramble(20, rng(seed));
    assert.ok(moves.every((m) => /^[MU]['2]?$/.test(m)));
    const u = moves.filter((m) => m[0] === 'U').reduce((a, m) => a + quarterTurns(m), 0);
    assert.equal(u % 4, 0);
    // And the simulator agrees: every corner sticker is home.
    const c = solvedCube(3);
    applyScramble(c, moves.join(' '));
    const g = faceGrids(c);
    for (const f of ['U', 'D', 'F', 'B', 'R', 'L'] as const) {
      for (const [r, col] of [[0, 0], [0, 2], [2, 0], [2, 2]]) assert.equal(g[f][r]![col], f, `corner sticker on ${f}`);
    }
  }
});

test('normalizeScramble tidies cubing.js output', () => {
  assert.equal(normalizeScramble("R2' D  B2' U'"), "R2 D B2 U'");
  assert.equal(normalizeScramble('Rw2\' U'), 'Rw2 U');
});

test('scrambleRows: Square-1 keeps (a, b) together; Megaminx breaks after U / U\'', () => {
  assert.deepEqual(scrambleRows('(1, 0) / (-3, 3) / (0, -1) /', 'sq1'), [['(1, 0)', '/', '(-3, 3)', '/', '(0, -1)', '/']]);
  assert.equal(scrambleLength('(1, 0) / (-3, 3) / (0, -1) /', 'sq1'), 3);
  const minx = "R++ D-- R++ D++ U R-- D++ R++ D-- U'";
  assert.deepEqual(scrambleRows(minx, 'minx'), [['R++', 'D--', 'R++', 'D++', 'U'], ['R--', 'D++', 'R++', 'D--', "U'"]]);
  assert.equal(scrambleLength("R U R' U'", '333'), 4);
  assert.equal(scrambleLength('', '333'), 0);
});

test('nxn: R moves the F right column onto U', () => {
  const c = solvedCube(3);
  applyScramble(c, 'R');
  const g = faceGrids(c);
  assert.deepEqual(g.U.map((row) => row[2]), ['F', 'F', 'F']);
  assert.deepEqual(g.F.map((row) => row[2]), ['D', 'D', 'D']);
  assert.deepEqual(g.B.map((row) => row[0]), ['U', 'U', 'U']);
  assert.deepEqual(g.U.map((row) => row[0]), ['U', 'U', 'U']);
});

test('nxn: U moves F to L (clockwise from above)', () => {
  const c = solvedCube(3);
  applyScramble(c, 'U');
  const g = faceGrids(c);
  assert.deepEqual(g.L[0], ['F', 'F', 'F']);
  assert.deepEqual(g.F[0], ['R', 'R', 'R']);
});

test('nxn: identities hold on every size', () => {
  for (const n of [2, 3, 4, 5, 6, 7]) {
    for (const alg of ["R R'", 'R4', "R U R' U' R U R' U' R U R' U' R U R' U' R U R' U' R U R' U'", "F2 B2 F2 B2", "x y z z' y' x'"]) {
      const c = solvedCube(n);
      assert.ok(applyScramble(c, alg));
      assert.ok(isSolved(c), `${alg} on ${n}x${n}`);
    }
  }
  const t = solvedCube(3);
  const tperm = "R U R' U' R' F R2 U' R' U' R U R' F'";
  applyScramble(t, tperm);
  assert.ok(!isSolved(t));
  applyScramble(t, tperm);
  assert.ok(isSolved(t), 'T-perm twice is the identity');
});

test('nxn: wide and slice moves', () => {
  const a = solvedCube(4);
  applyScramble(a, 'Rw');
  const g = faceGrids(a);
  assert.deepEqual(g.U[0], ['U', 'U', 'F', 'F'], 'Rw turns two layers on 4x4');
  const b = solvedCube(5);
  applyScramble(b, '3Rw');
  assert.deepEqual(faceGrids(b).U[0], ['U', 'U', 'F', 'F', 'F']);
  const c = solvedCube(5);
  applyScramble(c, '2R');
  assert.deepEqual(faceGrids(c).U[0], ['U', 'U', 'U', 'F', 'U'], '2R is the second layer only');
  const m = solvedCube(3);
  applyScramble(m, 'M');
  assert.deepEqual(faceGrids(m).U[0], ['U', 'B', 'U'], 'M follows L: B comes to U');
  assert.equal(parseMove('M', 4), null);
  assert.equal(parseMove('Q', 3), null);
  assert.equal(applyScramble(solvedCube(3), 'R Q'), false);
  assert.equal(cubeSize('444bf'), 4);
  assert.equal(cubeSize('333oh'), 3);
  assert.equal(cubeSize('pyram'), 0);
  assert.equal(cubeSize('ll'), 3);
});

test('subset states: only the chosen slots move, and the state is solvable', () => {
  for (let seed = 1; seed < 300; seed++) {
    for (const [es, cs] of [[U_EDGES, U_CORNERS], [F2L_EDGES, F2L_CORNERS]] as const) {
      const s = randomSubsetState([...es], [...cs], rng(seed));
      s.EDGES.pieces.forEach((p, i) => { if (!es.includes(i)) { assert.equal(p, i); assert.equal(s.EDGES.orientation[i], 0); } });
      s.CORNERS.pieces.forEach((p, i) => { if (!cs.includes(i)) { assert.equal(p, i); assert.equal(s.CORNERS.orientation[i], 0); } });
      assert.equal(permutationParity(s.EDGES.pieces), permutationParity(s.CORNERS.pieces));
      assert.equal(s.EDGES.orientation.reduce((a, b) => a + b, 0) % 2, 0);
      assert.equal(s.CORNERS.orientation.reduce((a, b) => a + b, 0) % 3, 0);
    }
  }
  assert.ok(!isSolvedState(randomSubsetState(U_EDGES, U_CORNERS, rng(7))));
});
