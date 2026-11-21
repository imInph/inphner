import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyScramble, faceGrids, isSolved, solvedCube, turnLayers } from '../scramble/nxn.ts';
import { handsAfter, isRotation, KEY_ROWS, keyMove, moveName, type Hands } from './virtual.ts';

const label = (code: string, n = 3, hands?: Hands) => {
  const m = keyMove(code, n, hands);
  return m ? moveName(m, n) : null;
};

test('the 3x3 key map is csTimer\'s default', () => {
  // As csTimer's Virtual Cube Key Map shows it (3 4 7 8 change the hands' depth).
  const expected = [
    ["S'", 'E', null, null, 'M', 'M', null, null, "E'", 'S'],
    ["z'", 'B', "L'", "Lw'", 'x', 'x', 'Rw', 'R', "B'", 'z'],
    ["y'", 'D', 'L', "U'", "F'", 'F', 'U', "R'", "D'", 'y'],
    ['Dw', "M'", "Uw'", 'Lw', "x'", "x'", "Rw'", 'Uw', "M'", "Dw'"],
  ];
  assert.deepEqual(KEY_ROWS.map((row) => row.map(([code]) => label(code))), expected);
});

test('every key turns the cube the way its name says, on 2x2 to 7x7 at any depth', () => {
  const codes = KEY_ROWS.flat().map(([c]) => c);
  for (let n = 2; n <= 7; n++) {
    for (let left = 1; left <= n - 1; left++) {
      for (const right of [1, n - 1]) {
        for (const code of codes) {
          const m = keyMove(code, n, { left, right });
          if (!m) continue;
          const byKey = solvedCube(n);
          applyScramble(byKey, "R U2 F' 2L D"); // something not symmetric
          const byName = structuredClone(byKey);
          turnLayers(byKey, m.face, m.from, m.to, m.dir);
          assert.ok(applyScramble(byName, moveName(m, n)), `${n}x${n} ${code}: ${moveName(m, n)} parses`);
          assert.deepEqual(faceGrids(byKey), faceGrids(byName), `${n}x${n} ${code} = ${moveName(m, n)}`);
        }
      }
    }
  }
});

test('opposite keys undo each other, and rotations are only whole-cube turns', () => {
  const pairs = [['KeyI', 'KeyK'], ['KeyJ', 'KeyF'], ['KeyH', 'KeyG'], ['KeyD', 'KeyE'], ['KeyS', 'KeyL'],
    ['KeyW', 'KeyO'], ['KeyU', 'KeyM'], ['KeyV', 'KeyR'], ['Digit5', 'KeyX'], ['Digit1', 'Digit0'],
    ['Digit2', 'Digit9'], ['KeyT', 'KeyN'], ['KeyP', 'KeyQ'], ['Semicolon', 'KeyA'], ['KeyZ', 'Slash'], ['Comma', 'KeyC']];
  for (const [a, b] of pairs) {
    const c = solvedCube(3);
    for (const code of [a!, b!]) {
      const m = keyMove(code, 3)!;
      turnLayers(c, m.face, m.from, m.to, m.dir);
    }
    assert.ok(isSolved(c), `${a} then ${b}`);
  }
  const rotations = KEY_ROWS.flat().map(([c]) => keyMove(c, 3)).filter((m) => m && isRotation(m, 3)).map((m) => moveName(m!, 3));
  assert.deepEqual(rotations.sort(), ["x", "x", "x'", "x'", 'y', "y'", 'z', "z'"]);
});

test('the hands\' depth keys stay between 1 and n - 1', () => {
  let h: Hands = { left: 1, right: 1 };
  h = handsAfter('Digit4', 3, h)!;
  h = handsAfter('Digit4', 3, h)!;
  assert.deepEqual(h, { left: 2, right: 1 });
  assert.equal(label('KeyD', 3, h), 'Lw');
  h = handsAfter('Digit8', 3, h)!;
  assert.equal(h.right, 1);
  h = handsAfter('Digit7', 3, h)!;
  assert.equal(label('KeyI', 3, h), 'Rw');
  assert.deepEqual(handsAfter('Space', 3, h), { left: 1, right: 1 });
  assert.equal(handsAfter('KeyI', 3, h), null);
  assert.deepEqual(handsAfter('Digit4', 2, { left: 1, right: 1 }), { left: 1, right: 1 });
});

test('a scramble undone by keys reads solved', () => {
  const c = solvedCube(3);
  applyScramble(c, "R U F'");
  for (const code of ['KeyH', 'KeyF', 'KeyK']) { // F U' R'
    const m = keyMove(code, 3)!;
    turnLayers(c, m.face, m.from, m.to, m.dir);
  }
  assert.ok(isSolved(c));
});
