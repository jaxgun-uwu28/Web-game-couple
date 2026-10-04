import { test } from "node:test";
import assert from "node:assert/strict";
import { previewBoard, previewMove } from "../src/lib/board-preview";
test("pass-and-play respects occupied cells, gravity and terminal results", () => {
  let tic = previewBoard("tic");
  for (const cell of [0, 3, 1, 4, 2]) tic = previewMove(tic, cell);
  assert.equal(tic.state.winner, 0);
  assert.equal(tic.state.status, "won");
  assert.throws(() => previewMove(tic, 8));
  let connect = previewBoard("connect");
  for (const col of [0, 1, 0, 1, 0, 1, 0]) connect = previewMove(connect, col);
  assert.equal(connect.state.winner, 0);
  assert.equal(connect.state.board![35], 1);
  assert.equal(connect.state.board![14], 1);
  const fresh = previewMove(previewBoard("tic"), 0);
  assert.throws(() => previewMove(fresh, 0));
  assert.throws(() => previewMove(previewBoard("connect"), 7));
});
