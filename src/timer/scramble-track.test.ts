import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinHalfTurns, ScrambleTracker, trackable, turnCount } from './scramble-track.ts';
import { apply, cubeFromScramble, sameCube, solved } from '../tools/cube.ts';
import { randomMoves } from '../scramble/moves.ts';

const quarters = (m: string): string[] => m.endsWith('2') ? [m[0]!, m[0]!] : [m];
const left = (t: ScrambleTracker) => t.steps().filter((s) => s.state !== 'done').map((s) => s.move).join(' ');

test('following the scramble exactly, double turns as two quarters', () => {
  const t = new ScrambleTracker("R2 U F' D2");
  for (const m of ['R', 'R', 'U', "F'", "D'", "D'"]) assert.equal(t.turn(m), true);
  assert.ok(t.done);
});

test('wrong turns are undone in front of what is left', () => {
  const t = new ScrambleTracker("R U F");
  assert.equal(t.turn("R'"), true);                 // R' toward R... leaves R2
  assert.equal(left(t), 'R2 U F');
  assert.equal(t.turn('L'), false);
  assert.equal(left(t), "L' R2 U F");
  assert.deepEqual(t.steps()[0], { move: "L'", state: 'fix' });
  assert.equal(t.fixes, 1);
});

test('opposite faces commute', () => {
  const t = new ScrambleTracker('L R U');
  assert.equal(t.turn('R'), true);
  assert.equal(left(t), 'L U');
});

test('whatever is turned, finishing the shown queue lands on the scramble', () => {
  for (let i = 0; i < 200; i++) {
    const scramble = randomMoves(['R', 'U', 'F', 'L', 'D', 'B'], 20).join(' ');
    const target = cubeFromScramble(scramble)!;
    const t = new ScrambleTracker(scramble);
    let cube = solved();
    for (let k = 0; k < 300 && !t.done; k++) {
      // Mostly the right turn, sometimes a random one.
      const next = t.steps().find((s) => s.state !== 'done')!.move;
      const move = Math.random() < 0.7 ? quarters(next)[0]!
        : (['R', 'U', 'F', 'L', 'D', 'B'][Math.floor(Math.random() * 6)]! + (Math.random() < 0.5 ? "'" : ''));
      cube = apply(cube, move);
      t.turn(move);
    }
    assert.ok(t.done, scramble);
    assert.ok(sameCube(cube, target), scramble);
  }
});

test('only plain face turns can be tracked', () => {
  assert.ok(trackable("R U2 F'"));
  assert.ok(!trackable('R Uw'));
  assert.ok(!trackable(''));
});

test('a half turn reported as two quarters counts once', () => {
  assert.deepEqual(joinHalfTurns(['R', 'R', "U'", "U'", 'F', "F'", 'L', 'L', 'L', 'Rw', 'Rw', '2R', '2R']),
    ['R2', 'U2', 'F', "F'", 'L2', 'L', 'Rw2', '2R2']);
  assert.equal(turnCount(['x', 'x', 'R', 'R', 'U']), 2);
});
