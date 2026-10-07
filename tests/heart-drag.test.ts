import { test } from "node:test";
import assert from "node:assert/strict";
import { getHeartDrag } from "../src/lib/heart-drag";
import { heartShapes, heartFits } from "../src/lib/heartblast";
test("every shape shares visual anchor, ghost and drop across responsive grid geometry", () => {
  for (const cell of [30, 45, 60])
    for (let shape = 0; shape < heartShapes.length; shape++) {
      const grid = { left: 20, top: 100, cell, gap: 4 };
      for (let x = 20; x < 20 + cell * 8; x += cell / 2)
        for (let y = 100; y < 100 + cell * 9; y += cell / 2) {
          const d = getHeartDrag({ x, y }, grid, shape, Array(64).fill(0));
          if (!d.inside) continue;
          assert.equal(Math.round((d.x - grid.left) / (cell + 4)) || 0, d.col);
          assert.equal(Math.round((d.y - grid.top) / (cell + 4)) || 0, d.row);
          assert.ok(Math.hypot(d.x - d.snapX, d.y - d.snapY) <= cell * 0.5);
          assert.equal(
            d.valid,
            heartFits(Array(64).fill(0), shape, d.row, d.col),
          );
        }
    }
});
test("nearby snap is optional, blocked pieces stay visible, outside never drops, top flips below pointer", () => {
  const grid = { left: 0, top: 0, cell: 40, gap: 4 },
    board = Array(64).fill(0);
  board[18] = 1;
  const noSnap = getHeartDrag({ x: 108, y: 148 }, grid, 0, board, false);
  assert.equal(noSnap.valid, false);
  const snap = getHeartDrag({ x: 108, y: 148 }, grid, 0, board, true);
  assert.equal(snap.valid, true);
  assert.ok(
    Math.abs(snap.row - noSnap.row) <= 1 &&
      Math.abs(snap.col - noSnap.col) <= 1,
  );
  assert.equal(getHeartDrag({ x: -100, y: 200 }, grid, 0, board).inside, false);
  const flipped = getHeartDrag({ x: 50, y: 10 }, grid, 0, board);
  assert.ok(flipped.y >= 0);
  assert.equal(
    getHeartDrag({ x: 108, y: 148 }, grid, 0, Array(64).fill(1)).valid,
    false,
  );
});
