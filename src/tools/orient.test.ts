import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { applyScramble, faceGrids, solvedCube, type Face } from '../scramble/nxn.ts';
import { COLOUR_NAMES, describeOrientation, FACE_ORDER, orientations, TO_BOTTOM } from './orient.ts';

const bottomAfter = (rotation: string): Face => {
  const cube = solvedCube(3);
  assert.ok(applyScramble(cube, rotation), `${rotation} is not notation we read`);
  return faceGrids(cube).D[1]![1]!;
};

test('every colour has a rotation that puts it on the bottom', () => {
  for (const face of FACE_ORDER) {
    assert.equal(bottomAfter(TO_BOTTOM[face]), face, `${COLOUR_NAMES[face]} should end up down`);
  }
});

test('a scramble alone leaves yellow on the bottom, which is why hints need a rotation', () => {
  assert.equal(bottomAfter(''), 'D');
  assert.equal(describeOrientation(''), 'yellow on the bottom, green in front');
  assert.equal(describeOrientation('x2'), 'white on the bottom, blue in front');
});

test('turning about the vertical axis keeps the bottom and changes the front', () => {
  const fronts = orientations('U', true).map((r) => {
    const described = describeOrientation(r);
    assert.match(described, /^white on the bottom/, `${r} moved white off the bottom`);
    return described.replace(/^.*, /, '');
  });
  assert.equal(new Set(fronts).size, 4, 'each y turn shows a different face');
  assert.ok(!fronts.includes('white in front') && !fronts.includes('yellow in front'));
});

test('a chosen colour gives one orientation, or four when the front matters', () => {
  assert.deepEqual(orientations('U', false), ['x2']);
  assert.equal(orientations('U', true).length, 4);
  assert.equal(orientations('any', false).length, 6);
  assert.equal(orientations('any', true).length, 24);
  // Colour neutral means every colour really is offered.
  const bottoms = orientations('any', false).map((r) => bottomAfter(r));
  assert.deepEqual([...bottoms].sort(), [...FACE_ORDER].sort());
});
