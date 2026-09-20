import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { apply, cubeFromFacelets, cubeFromScramble, solved, TURNS, turn } from './cube.ts';
import { applyScramble, faceGrids, solvedCube } from '../scramble/nxn.ts';
import { grids } from '../trainer/cube3.ts';

const same = (a: unknown, b: unknown) => assert.deepEqual(a, b);

test('every single turn agrees with the sticker simulator', () => {
  for (const t of TURNS) {
    const sticker = solvedCube(3);
    applyScramble(sticker, t);
    const piece = turn(solved(), t);
    same(grids({
      EDGES: { pieces: piece.ep, orientation: piece.eo },
      CORNERS: { pieces: piece.cp, orientation: piece.co },
    }), faceGrids(sticker));
  }
});

test('a long scramble agrees with the sticker simulator', () => {
  const scramble = "R U R' U' F2 L D2 B' R2 F U2 D L' B2 R D' F' L2 U B";
  const sticker = solvedCube(3);
  assert.ok(applyScramble(sticker, scramble));
  const piece = cubeFromScramble(scramble)!;
  same(grids({
    EDGES: { pieces: piece.ep, orientation: piece.eo },
    CORNERS: { pieces: piece.cp, orientation: piece.co },
  }), faceGrids(sticker));
});

test('the usual identities hold', () => {
  same(apply(solved(), 'U U U U'), solved());
  same(apply(solved(), "R U R' U' R U R' U' R U R' U' R U R' U' R U R' U' R U R' U'"), solved());
  same(apply(solved(), "R R'"), solved());
  same(apply(solved(), 'R2 R2'), solved());
  assert.notDeepEqual(apply(solved(), 'R'), solved());
});

test('nonsense notation is rejected, and a wide move is read through the centres', () => {
  assert.equal(cubeFromScramble('R U Q'), null);
  // Rw on a 3x3 is a turn plus a rotation; normalising by the centres means we
  // still read a legal piece state out of it.
  same(cubeFromScramble('Rw'), cubeFromScramble("L x"));
});

test('facelet strings read back as the same cube', () => {
  const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
  same(cubeFromFacelets(SOLVED), solved());
  // The state after F R, from gan-web-bluetooth's own documentation.
  const afterFR = 'UUFUUFLLFUUURRRRRRFFRFFDFFDRRBDDBDDBLLDLLDLLDLBBUBBUBB';
  same(cubeFromFacelets(afterFR), apply(solved(), 'F R'));
  assert.equal(cubeFromFacelets('nope'), null);
});
