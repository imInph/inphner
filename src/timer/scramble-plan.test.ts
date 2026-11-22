import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFrom } from './scramble-plan.ts';
import { apply, cubeFromScramble, sameCube, solved } from '../tools/cube.ts';

test('a plan from any cube lands on the scramble', async () => {
  const target = cubeFromScramble("R U2 F' L D B2 R' U F2 D' L2 B")!;
  const from = apply(solved(), "F R' D2 B U L'");
  const plan = await planFrom(from, target);
  assert.ok(sameCube(apply(from, plan), target), plan);
  assert.equal(await planFrom(target, target), '');
});
