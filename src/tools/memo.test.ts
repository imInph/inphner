/**
 * The memo is checked by executing it: swapping the buffer sticker with each
 * target in turn, the way Old Pochmann does, has to leave every sticker home.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { cubeFromScramble, solved } from './cube.ts';
import { memoFor, pairs, SPEFFZ } from './memo.ts';

const SCRAMBLES = [
  "R U R' U' F2 L D2 B' R2 F U2 D L' B2 R D' F' L2 U B",
  "D2 L2 F2 U' B2 U' F2 D' R2 D2 B2 L' B' R' U2 L2 F D' R' F2 U",
  "F R U' R2 D B2 L F2 D' R B U2 L2 F' B2 D2 R2 U L2 D",
];

/**
 * Execute a memo the way a BLD solve does: each target shoots the piece in the
 * buffer slot to the target slot, turned so that the sticker that was on the
 * buffer facelet lands on the target facelet. When the memo is right, the cube
 * is solved at the end — orientation included.
 */
function executes(targets: string[], letters: string[], perm: readonly number[], ori: readonly number[], facelets: number, buffer: number): boolean {
  const p = [...perm];
  const o = [...ori];
  const sb = Math.floor(buffer / facelets);
  const fb = buffer % facelets;
  const mod = (n: number) => ((n % facelets) + facelets) % facelets;
  for (const letter of targets) {
    const target = letters.indexOf(letter);
    const st = Math.floor(target / facelets);
    const ft = target % facelets;
    const [pieceA, oriA] = [p[sb]!, o[sb]!];
    const [pieceB, oriB] = [p[st]!, o[st]!];
    p[st] = pieceA; o[st] = mod(ft - mod(fb - oriA));
    p[sb] = pieceB; o[sb] = mod(fb - mod(ft - oriB));
  }
  void perm;
  return p.every((piece, slot) => piece === slot && o[slot] === 0);
}

test('Speffz starts at the top-left of each face', () => {
  // U face corners A B C D clockwise from UBL; U face edges A B C D from UB.
  assert.equal(SPEFFZ.corners[2 * 3], 'A', 'UBL on U is A');     // corner slot 2 = UBL
  assert.equal(SPEFFZ.edges[2 * 2], 'A', 'UB on U is A');        // edge slot 2 = UB
  assert.equal(SPEFFZ.edges[0 * 2], 'C', 'UF on U is C');
  assert.equal(SPEFFZ.corners[0 * 3], 'C', 'UFR on U is C');
  assert.equal(SPEFFZ.edges[4 * 2], 'U', 'DF on D is U');
  assert.equal(new Set([...SPEFFZ.edges, ...SPEFFZ.corners]).size, 24, 'every letter is used once per orbit');
});

test('a solved cube has nothing to memorise', () => {
  const memo = memoFor(solved());
  assert.deepEqual(memo, { edges: [], corners: [], parity: false, flipped: [], twisted: [] });
});

test('executing the memo solves the cube', () => {
  for (const scramble of SCRAMBLES) {
    const cube = cubeFromScramble(scramble)!;
    const memo = memoFor(cube);
    assert.ok(
      executes(memo.edges, SPEFFZ.edges, cube.ep, cube.eo, 2, 0),
      `edge memo does not solve the edges: ${scramble}`,
    );
    assert.ok(
      executes(memo.corners, SPEFFZ.corners, cube.cp, cube.co, 3, 0),
      `corner memo does not solve the corners: ${scramble}`,
    );
    assert.equal(memo.parity, memo.edges.length % 2 === 1);
  }
});

test('a different buffer still produces a memo that solves', () => {
  const cube = cubeFromScramble(SCRAMBLES[0]!)!;
  const memo = memoFor(cube, { edgeBuffer: 4 * 2, cornerBuffer: 2 * 3 });  // DF and UBL, old Pochmann
  assert.ok(executes(memo.edges, SPEFFZ.edges, cube.ep, cube.eo, 2, 4 * 2));
  assert.ok(executes(memo.corners, SPEFFZ.corners, cube.cp, cube.co, 3, 2 * 3));
});

test('pieces that are home but turned are called out', () => {
  const cube = solved();
  cube.eo[1] = 1;
  cube.eo[3] = 1;
  cube.co[4] = 1;
  const memo = memoFor(cube);
  assert.deepEqual(memo.flipped, [SPEFFZ.edges[2]!, SPEFFZ.edges[6]!]);
  assert.deepEqual(memo.twisted, [SPEFFZ.corners[12]!]);
});

test('letters are memorised in pairs', () => {
  assert.deepEqual(pairs(['A', 'B', 'C', 'D', 'E']), ['AB', 'CD', 'E']);
});

test('200 random cubes: every memo executes to a solved cube', () => {
  const moves = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap((f) => [f, `${f}2`, `${f}'`]);
  let seed = 20260920;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 200; i++) {
    const scramble = Array.from({ length: 20 }, () => moves[Math.floor(rnd() * moves.length)]).join(' ');
    const cube = cubeFromScramble(scramble)!;
    const memo = memoFor(cube);
    assert.ok(executes(memo.edges, SPEFFZ.edges, cube.ep, cube.eo, 2, 0), `edges: ${scramble}`);
    assert.ok(executes(memo.corners, SPEFFZ.corners, cube.cp, cube.co, 3, 0), `corners: ${scramble}`);
  }
});
