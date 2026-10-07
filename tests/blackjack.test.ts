import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blackjack,
  blackjackMove,
  createBlackjack,
  type BlackjackState,
} from "../src/lib/plugin-games/blackjack";
import { seededDeck, handValue } from "../src/lib/cards";
import { seeded, type Seat, type Move } from "../src/lib/plugin-games/types";
const move = (s: BlackjackState, m: Move, p: Seat = 0) =>
  blackjackMove(
    s,
    {
      ...m,
      serverNow: 1000,
      serverDeck: seededDeck(31),
      noteId: crypto.randomUUID(),
    },
    p,
  );
function start(a = 20, b = 20, notes = true) {
  let s = createBlackjack({
    ante: 1,
    end: "rounds",
    rounds: 5,
    notes,
    payout: "3:2",
    double: true,
  });
  s = move(s, { type: "buyin", amount: a });
  s = move(s, { type: "buyin", amount: b }, 1);
  return move(s, { type: "start" });
}
test("Blackjack hides hole cards and deck even before peeking; results reveal hands only at showdown", () => {
  let s = start();
  s = move(s, { type: "bet", amount: 0 });
  s = move(s, { type: "match" }, 1);
  const view = blackjack.getPublicState(s, 0) as typeof s;
  assert.equal(view.deck, undefined);
  assert.equal(view.hands[0][1], null);
  assert.equal(view.hands[1][1], null);
  s = move(s, { type: "peek" });
  assert.ok((blackjack.getPublicState(s, 0) as typeof s).hands[0][1]);
  assert.equal((blackjack.getPublicState(s, 1) as typeof s).hands[0][1], null);
  assert.throws(() => move(s, { type: "hit" }, 0));
  s = move(s, { type: "stand" }, 1);
  s = move(s, { type: "stand" }, 0);
  assert.equal(s.status, "summary");
  assert.ok((blackjack.getPublicState(s, 1) as typeof s).hands[0][1]);
});
test("Shortfall note has no chip value, decline costs no use, third accepted use is the cap", () => {
  let s = start(100, 10);
  s = move(s, { type: "bet", amount: 20 });
  s = move(s, { type: "stake_note", text: "Breakfast" }, 1);
  assert.equal(s.pot, 22);
  assert.equal(s.notes[0].shortfall, 11);
  s = move(s, { type: "decline_note" }, 0);
  assert.equal(s.notesUsed[1], 0);
  s = move(s, { type: "stake_note", text: "A snack" }, 1);
  s = move(s, { type: "accept_note" }, 0);
  assert.equal(s.pot, 31);
  assert.equal(s.notesUsed[1], 1);
  assert.equal(s.chips[1], 0);
  assert.equal(s.chips.reduce((a, b) => a + b) + s.pot, 110);
  s.notesUsed[1] = 3;
  s.status = "matching";
  s.turn = 1;
  s.pending = { player: 1, amount: 20, kind: "match" };
  s = move(s, { type: "match" }, 1);
  assert.equal(s.status, "done");
  assert.equal(s.winner, 0);
});
test("Losing note becomes owed, winning note is voided, resign ends immediately", () => {
  for (const winner of [0, 1] as Seat[]) {
    let s = start(100, 10);
    s = move(s, { type: "bet", amount: 20 });
    s = move(s, { type: "stake_note", text: "A hug" }, 1);
    s = move(s, { type: "accept_note" }, 0);
    s.hands =
      winner === 0
        ? [
            [
              { rank: 14, suit: 0 },
              { rank: 13, suit: 0 },
            ],
            [
              { rank: 8, suit: 0 },
              { rank: 7, suit: 0 },
            ],
          ]
        : [
            [
              { rank: 8, suit: 0 },
              { rank: 7, suit: 0 },
            ],
            [
              { rank: 14, suit: 0 },
              { rank: 13, suit: 0 },
            ],
          ];
    s = move(s, { type: "stand" }, 1);
    s = move(s, { type: "stand" }, 0);
    assert.equal(s.notes.at(-1)!.status, winner === 0 ? "owed" : "voided");
    assert.equal(
      s.chips.reduce((a, b) => a + b),
      110,
    );
  }
  let s = start();
  s = move(s, { type: "resign" }, 1);
  assert.equal(s.status, "done");
  assert.equal(s.winner, 0);
  assert.throws(() => move(s, { type: "bet", amount: 0 }));
});
test("3:2 bonus uses only remaining loser chips and shows capped payout", () => {
  let s = start(20, 10, false);
  s = move(s, { type: "bet", amount: 9 });
  s = move(s, { type: "match" }, 1);
  s.hands = [
    [
      { rank: 14, suit: 0 },
      { rank: 13, suit: 0 },
    ],
    [
      { rank: 9, suit: 0 },
      { rank: 8, suit: 0 },
    ],
  ];
  s = move(s, { type: "stand" }, 1);
  s = move(s, { type: "stand" }, 0);
  assert.equal(s.history[0].bonus, 0);
  assert.equal(s.history[0].bonusCapped, true);
  assert.deepEqual(s.chips, [30, 0]);
});
test("1000 simulated sessions conserve table plus wallets with notes, doubles, pushes, 3:2, and resigns", () => {
  let doubles = 0,
    notes = 0,
    pushes = 0,
    resigns = 0;
  for (let seed = 1; seed <= 1000; seed++) {
    const rand = seeded(seed),
      buyA = 10 + Math.floor(rand() * 91),
      buyB = 10 + Math.floor(rand() * 91),
      wallets = [200 - buyA, 200 - buyB];
    let s = start(buyA, buyB, seed % 2 === 0);
    let steps = 0;
    while (s.status !== "done" && steps++ < 700) {
      let p = s.turn,
        m: Move;
      switch (s.status) {
        case "betting":
          m = { type: "bet", amount: Math.floor(rand() * (s.chips[p] + 1)) };
          break;
        case "matching":
          if (
            s.chips[p] < s.pending!.amount &&
            s.config.notes !== false &&
            s.notesUsed[p] < 3
          ) {
            m = { type: "stake_note", text: "A friendly favor" };
            notes++;
          } else m = { type: "match" };
          break;
        case "note":
          p = (1 - s.pending!.player) as Seat;
          m = { type: rand() < 0.15 ? "decline_note" : "accept_note" };
          break;
        case "playing":
          if (rand() < 0.02) {
            m = { type: "resign" };
            resigns++;
          } else if (s.hands[p].length === 2 && rand() < 0.2) {
            m = { type: "double" };
            doubles++;
          } else
            m = { type: handValue(s.hands[p]).total < 15 ? "hit" : "stand" };
          break;
        case "summary":
          if (s.roundWinner === null) pushes++;
          m = { type: "next" };
          break;
        default:
          throw new Error(s.status);
      }
      s = blackjackMove(
        s,
        {
          ...m,
          serverNow: 1000 + steps,
          serverDeck: seededDeck(seed * 100 + steps),
          noteId: crypto.randomUUID(),
        },
        p,
      );
      assert.ok(
        s.chips.every((x) => x >= 0),
        `Negative chips, seed ${seed}`,
      );
      assert.equal(
        s.chips[0] + s.chips[1] + s.pot + wallets[0] + wallets[1],
        400,
        `Conservation seed ${seed}`,
      );
    }
    assert.equal(s.status, "done", `Session ${seed} did not finish`);
    wallets[0] += s.chips[0];
    wallets[1] += s.chips[1];
    assert.equal(wallets[0] + wallets[1], 400);
  }
  assert.ok(
    doubles && notes && pushes && resigns,
    JSON.stringify({ doubles, notes, pushes, resigns }),
  );
});
