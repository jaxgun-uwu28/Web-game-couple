import { test } from "node:test";
import assert from "node:assert/strict";
import { boardWinner, daysTogether, manilaDay } from "../src/lib/games";
test("anniversary day is zero and follows Manila midnight", () => {
  assert.equal(daysTogether(new Date("2025-09-05T16:00:00Z")), 0);
  assert.equal(daysTogether(new Date("2025-09-06T16:00:00Z")), 1);
  assert.equal(manilaDay(new Date("2026-10-03T16:00:00Z")), "2026-10-04");
});
test("tic tac toe wins and a blocked row does not", () => {
  assert.equal(boardWinner([1, 1, 1, 2, 0, 2, 0, 0, 0], 3, 3), 0);
  assert.equal(boardWinner([1, 2, 1, 0, 2, 0, 0, 2, 0], 3, 3), 1);
  assert.equal(boardWinner([1, 2, 1, 2, 1, 2, 2, 1, 2], 3, 3), null);
});
test("Connect Four horizontal, vertical, diagonal and no row wrapping", () => {
  const b = Array(42).fill(0);
  [35, 36, 37, 38].forEach((i) => (b[i] = 1));
  assert.equal(boardWinner(b, 7, 4), 0);
  b.fill(0);
  [0, 7, 14, 21].forEach((i) => (b[i] = 2));
  assert.equal(boardWinner(b, 7, 4), 1);
  b.fill(0);
  [15, 23, 31, 39].forEach((i) => (b[i] = 1));
  assert.equal(boardWinner(b, 7, 4), 0);
  b.fill(0);
  [5, 6, 7, 8].forEach((i) => (b[i] = 1));
  assert.equal(boardWinner(b, 7, 4), null);
});
