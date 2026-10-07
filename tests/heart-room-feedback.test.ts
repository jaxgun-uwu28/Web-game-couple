import { test } from "node:test";
import assert from "node:assert/strict";
import {
  heartStep,
  heartReplayPending,
  heartRunFinished,
  initialHeartState,
  defaultHeartOptions,
  firstHeartPlacement,
} from "../src/lib/heartblast";
test("pending placement replay preserves immediate board and score after each server acknowledgment", () => {
  const seed = 31,
    start = initialHeartState(seed, defaultHeartOptions);
  const moves: { piece: number; row: number; col: number }[] = [];
  let immediate = start;
  for (let i = 0; i < 9; i++) {
    const piece = immediate.used[0].findIndex(
      (used, j) =>
        !used &&
        firstHeartPlacement(immediate.boards[0], immediate.hands[0][j]),
    );
    const target = firstHeartPlacement(
      immediate.boards[0],
      immediate.hands[0][piece],
    )!;
    const move = { piece, row: target[0], col: target[1] };
    moves.push(move);
    immediate = heartStep(immediate, seed, 0, piece, move.row, move.col);
  }
  let accepted = start;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    accepted = heartStep(accepted, seed, 0, m.piece, m.row, m.col);
    assert.deepEqual(
      heartReplayPending(accepted, seed, 0, moves.slice(i + 1)),
      immediate,
    );
  }
  assert.deepEqual(start.boards[0], Array(64).fill(0));
  const conflict = structuredClone(start);
  conflict.boards[0].fill(1);
  assert.throws(() => heartReplayPending(conflict, seed, 0, moves), /empty/);
});
test("Daily runs end independently and other modes still wait for shared results", () => {
  const daily = initialHeartState(3, { ...defaultHeartOptions, mode: "daily" });
  daily.stuck[0] = true;
  assert.equal(heartRunFinished(daily, 0), true);
  assert.equal(heartRunFinished(daily, 1), false);
  const timed = { ...daily, options: { ...defaultHeartOptions } };
  assert.equal(heartRunFinished(timed, 0), false);
});
