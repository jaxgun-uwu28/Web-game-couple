import { test } from "node:test";
import assert from "node:assert/strict";
import {
  heartHand,
  heartFits,
  heartPlace,
  heartScore,
  heartStep,
  heartWinner,
  initialHeartState,
  defaultHeartOptions,
  heartShapes,
} from "../src/lib/heartblast";
test("Duel trays are identical across different boards, seeds and tray indices, and include a small piece", () => {
  for (let seed = 1; seed <= 100; seed++)
    for (let tray = 0; tray < 100; tray++) {
      const a = initialHeartState(seed, defaultHeartOptions),
        b = initialHeartState(seed, defaultHeartOptions);
      a.boards[0] = Array(64).fill(0);
      b.boards[0] = Array.from({ length: 64 }, (_, i) => (i % 3 ? 1 : 0));
      a.hands[0]=heartHand(seed,tray);b.hands[0]=heartHand(seed,tray);
      assert.deepEqual(a.hands[0],b.hands[0]);
      assert.ok(heartShapes[heartHand(seed, tray)[0]].length <= 3);
    }
});
test('Different legal placement histories still produce the identical next duel tray',()=>{for(let seed=1;seed<=200;seed++){let a=initialHeartState(seed,defaultHeartOptions),b=initialHeartState(seed,defaultHeartOptions);b.boards[0][63]=5;for(let piece=0;piece<3;piece++){for(const which of [0,1]){const s=which?b:a,shape=s.hands[0][piece];const pos=s.boards[0].findIndex((_,i)=>heartFits(s.boards[0],shape,Math.floor(i/8),i%8));assert.ok(pos>=0);const next=heartStep(s,seed,0,piece,Math.floor(pos/8),pos%8);if(which)b=next;else a=next;}}assert.equal(a.rounds[0],1);assert.equal(b.rounds[0],1);assert.deepEqual(a.hands[0],b.hands[0]);}});
test("Single-board Co-op and Daily trays always have a legal placement on 10,000 non-full fuzzed boards", () => {
  let rng = 731;
  for (let n = 0; n < 10000; n++) {
    const board = Array.from({ length: 64 }, () => {
      rng = (rng * 48271) % 2147483647;
      return rng % 4 === 0 ? 0 : 1;
    });
    board[n % 64] = 0;
    const hand = heartHand(n + 1, n % 100, board);
    assert.ok(
      hand.some((s) =>
        board.some((_, i) => heartFits(board, s, Math.floor(i / 8), i % 8)),
      ),
    );
  }
});
test("Shared scoring uses cells, squared clears, capped combo and empty-board bonus", () => {
  assert.deepEqual(heartScore(4, 2, 0, false), {
    combo: 1,
    multiplier: 1,
    placement: 4,
    clear: 40,
    bonus: 0,
    points: 44,
  });
  assert.equal(heartScore(1, 2, 1, false).points, 61);
  assert.equal(heartScore(1, 1, 20, true).points, 131);
  assert.equal(heartScore(3, 0, 3, false).combo, 0);
  const b = Array(64).fill(0);
  for (let i = 1; i < 8; i++) b[i] = b[i * 8] = 1;
  const p = heartPlace(b, 0, 0, 0);
  assert.equal(p.points, 141);
  assert.equal(p.cleared.length, 15);
  assert.ok(p.board.every((v) => v === 0));
});
test("No rotations, boundaries, co-op turn order and tie-break by pieces", () => {
  assert.equal(heartFits(Array(64).fill(0), 13, 0, 4), false);
  const opts = { ...defaultHeartOptions, coop: true };
  const s = initialHeartState(42, opts);
  assert.throws(() => heartStep(s, 42, 1, 0, 0, 0), /turn/);
  const next = heartStep(s, 42, 0, 0, 0, 0);
  assert.equal(next.turn, 1);
  next.options.coop = false;
  next.scores = [10, 10];
  next.pieces = [2, 3];
  assert.equal(heartWinner(next), 0);
  next.pieces = [3, 3];
  assert.equal(heartWinner(next), null);
});
