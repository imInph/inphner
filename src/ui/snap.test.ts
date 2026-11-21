import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachSide, clampOffset, components, edgesFor, findAttach, GAP, offsetFrom, positionFrom, reflow, snapOffset, touching, type Rect } from './snap.ts';

const view = { w: 1000, h: 800 };
const r = (x: number, y: number, w = 300, h = 200): Rect => ({ x, y, w, h });

test('snaps to the screen margin when close, not when far', () => {
  assert.deepEqual(snapOffset([r(13, 300)], [], view, 8), { dx: -5, dy: 0 });
  assert.deepEqual(snapOffset([r(40, 300)], [], view, 8), { dx: 0, dy: 0 });
  // right and bottom margins
  assert.deepEqual(snapOffset([r(1000 - 8 - 300 + 7, 800 - 8 - 200 - 4)], [], view, 8), { dx: -7, dy: 4 });
});

test('snaps beside another window, GAP apart, and lines the tops up', () => {
  const other = r(100, 100);
  const moved = r(100 + 300 + GAP + 9, 104);
  const { dx, dy } = snapOffset([moved], [other], view, 8);
  assert.equal(dx, -9);
  assert.equal(dy, -4);
  assert.ok(touching({ ...moved, x: moved.x + dx, y: moved.y + dy }, other));
});

test('snaps underneath another window', () => {
  const other = r(100, 100);
  const { dx, dy } = snapOffset([r(103, 100 + 200 + GAP - 6)], [other], view, 8);
  assert.deepEqual({ dx, dy }, { dx: -3, dy: 6 });
});

test('ignores windows far away along the other axis', () => {
  // Its left edge is 5px from the other's right edge plus GAP, but 300px below it.
  assert.deepEqual(snapOffset([r(100 + 300 + GAP + 5, 600)], [r(100, 100)], { w: 2000, h: 2000 }, 8), { dx: 0, dy: 0 });
});

test('a whole group snaps by its nearest member', () => {
  const group = [r(500, 100), r(500, 100 + 200 + GAP)];
  // The lower member comes 3px from the screen's bottom margin.
  const lower = { ...group[1]!, y: 800 - 8 - 200 + 3 };
  const upper = { ...group[0]!, y: lower.y - 200 - GAP };
  assert.deepEqual(snapOffset([upper, lower], [], view, 8), { dx: 0, dy: -3 });
});

test('touching needs the gap and an overlap along the shared side', () => {
  assert.ok(touching(r(0, 0), r(300 + GAP, 50)));
  assert.ok(touching(r(0, 0), r(50, 200 + GAP)));
  assert.ok(!touching(r(0, 0), r(300 + GAP, 200)));     // only the corners meet
  assert.ok(!touching(r(0, 0), r(300 + GAP + 10, 0)));  // a gap too wide
  assert.ok(!touching(r(0, 0), r(10, 10)));             // overlapping, not side by side
});

test('clamping keeps the group on screen and a header in reach', () => {
  const group = [r(100, 100), r(100 + 300 + GAP, 100)];
  assert.deepEqual(clampOffset(group, -500, 0, view, 8, 60), { dx: -92, dy: 0 });
  assert.deepEqual(clampOffset(group, 500, 0, view, 8, 60), { dx: 1000 - 8 - (100 + 600 + GAP), dy: 0 });
  assert.deepEqual(clampOffset(group, 0, 2000, view, 8, 60), { dx: 0, dy: 800 - 60 - 100 });
  assert.deepEqual(clampOffset(group, 0, -500, view, 8, 60), { dx: 0, dy: -92 });
});

test('a group wider than the screen keeps its left edge', () => {
  assert.equal(clampOffset([r(0, 0, 1200)], 50, 0, view, 8, 60).dx, 8);
});

test('reflow moves what is below or beside a window that changed size', () => {
  const before = r(100, 100);
  const after = { ...before, h: 40 }; // folded
  const below = r(100, 100 + 200 + GAP);
  const beside = r(100 + 300 + GAP, 100);
  const [b, s] = reflow(before, after, [below, beside]);
  assert.equal(b!.y, 100 + 40 + GAP);
  assert.deepEqual(s, beside);
  const wider = reflow(before, { ...before, w: 380 }, [beside])[0]!;
  assert.equal(wider.x, 100 + 380 + GAP);
});

test('components groups linked windows, and unlinked ones stand alone', () => {
  const groups = components(5, [[0, 1], [1, 3]]).map((g) => g.sort()).sort((a, b) => a[0]! - b[0]!);
  assert.deepEqual(groups, [[0, 1, 3], [2], [4]]);
});

test('attachSide names the side of the card a window is stuck to', () => {
  const card = r(400, 100, 300, 150);
  assert.equal(attachSide(r(400 - GAP - 200, 120, 200), card), 'left');
  assert.equal(attachSide(r(700 + GAP, 90, 200), card), 'right');
  assert.equal(attachSide(r(450, 100 - GAP - 80, 200, 80), card), 'above');
  assert.equal(attachSide(r(450, 250 + GAP, 200), card), 'below');
  assert.equal(attachSide(r(450, 260 + GAP, 200), card), null);
});

test('a window under a card follows its bottom; one on its right follows its right edge', () => {
  const card = r(400, 100, 300, 150);
  const below = edgesFor('below');
  const offBelow = offsetFrom(card, { x: 450, y: 250 + GAP }, below);
  assert.deepEqual(positionFrom({ ...card, h: 230 }, offBelow, below), { x: 450, y: 330 + GAP });
  const right = edgesFor('right');
  const offRight = offsetFrom(card, { x: 700 + GAP, y: 120 }, right);
  assert.deepEqual(positionFrom({ ...card, w: 260 }, offRight, right), { x: 660 + GAP, y: 120 });
});

test('findAttach catches a window within reach and puts it exactly GAP away, lined up', () => {
  const target = r(400, 100, 300, 150);
  const a = findAttach([r(400 + 300 + GAP + 25, 118, 200, 120)], [target])!;
  assert.equal(a.side, 'right');
  // Bottoms are 12px apart, tops 18px: the nearer pair lines up.
  assert.deepEqual({ dx: a.dx, dy: a.dy }, { dx: -25, dy: 12 });
  const placed = r(400 + 300 + GAP + 25 + a.dx, 118 + a.dy, 200, 120);
  assert.equal(attachSide(placed, target), 'right');
});

test('findAttach: under a card, and the nearest of two targets wins', () => {
  const cards = [r(0, 0, 300, 100), r(400, 0, 300, 100)];
  const a = findAttach([r(390, 100 + GAP + 20, 200, 100)], cards)!;
  assert.equal(a.index, 1);
  assert.equal(a.side, 'below');
  assert.deepEqual({ dx: a.dx, dy: a.dy }, { dx: 10, dy: -20 });
});

test('findAttach ignores what is out of reach', () => {
  assert.equal(findAttach([r(800, 100, 200, 100)], [r(0, 100, 300, 100)]), null);
  // Beside it but far below: no overlap along the side.
  assert.equal(findAttach([r(300 + GAP, 400, 200, 100)], [r(0, 100, 300, 100)]), null);
});

test('findAttach: a window below a card is not beside it, however close the side edges', () => {
  const card = r(400, 100, 300, 150);
  // Right edge GAP from the card's left, but entirely below it, and 20px from a window above.
  const above = r(0, 280, 395, 100);
  const a = findAttach([r(-1, 400, 395, 200)], [card, above])!;
  assert.equal(a.index, 1);
  assert.equal(a.side, 'below');
});

test('findAttach: equally near, the longer shared edge wins, and right edges line up', () => {
  const left = r(0, 0, 400, 100);
  const right = r(420, 0, 230, 100);
  const a = findAttach([r(245, 100 + GAP + 20, 400, 200)], [left, right])!;
  assert.equal(a.index, 1);
  assert.deepEqual({ dx: a.dx, dy: a.dy }, { dx: 5, dy: -20 });
});
