import test from "node:test";
import assert from "node:assert/strict";
import {
  firstHeartPlacement,
  heartFits,
  heartShapes,
} from "../src/lib/heartblast";
test("new pieces preview in a legal open space instead of the occupied top-left corner", () => {
  const board = Array(64).fill(0);
  board[0] = board[1] = board[8] = 1;
  for (let shape = 0; shape < heartShapes.length; shape++) {
    const position = firstHeartPlacement(board, shape);
    assert.ok(position);
    assert.equal(heartFits(board, shape, ...position), true);
    for (const cell of heartShapes[shape])
      assert.equal(
        board[
          (position[0] + Math.floor(cell / 8)) * 8 + position[1] + (cell % 8)
        ],
        0,
      );
  }
  assert.equal(firstHeartPlacement(Array(64).fill(1), 0), null);
});
