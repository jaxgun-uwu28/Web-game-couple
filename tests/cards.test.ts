import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDeck,
  secureDeck,
  seededDeck,
  deal,
  handValue,
  compareHands,
  diceLanding,
} from "../src/lib/cards";
import {
  ledger,
  ledgerMove,
  createLedger,
} from "../src/lib/plugin-games/ledger";
test("Deck contains 52 unique cards; seeded draws reproduce, secure draws preserve membership", () => {
  const deck = createDeck();
  assert.equal(new Set(deck.map((c) => `${c.rank}:${c.suit}`)).size, 52);
  assert.deepEqual(seededDeck(12), seededDeck(12));
  for (let i = 0; i < 20; i++)
    assert.equal(
      new Set(secureDeck().map((c) => `${c.rank}:${c.suit}`)).size,
      52,
    );
  assert.equal(deal(deck, 2).deck.length, 50);
  assert.throws(() => deal(deck, 53));
});
test("Aces become hard when needed and natural blackjack outranks three-card 21", () => {
  assert.deepEqual(
    handValue([
      { rank: 14, suit: 0 },
      { rank: 6, suit: 1 },
    ]),
    { total: 17, hard: 7, soft: true, blackjack: false, bust: false },
  );
  assert.equal(
    handValue([
      { rank: 14, suit: 0 },
      { rank: 14, suit: 1 },
      { rank: 10, suit: 2 },
    ]).total,
    12,
  );
  assert.equal(
    compareHands(
      [
        { rank: 14, suit: 0 },
        { rank: 13, suit: 1 },
      ],
      [
        { rank: 7, suit: 0 },
        { rank: 7, suit: 1 },
        { rank: 7, suit: 2 },
      ],
    ),
    1,
  );
});
test("Ledger filters partner card until both flips and waits through the suspense beat", () => {
  let s = createLedger({ wallet: 10, rounds: 1, entry: 1 });
  s = ledgerMove(s, { type: "lock", coins: 1, note: "A snack" }, 0);
  s = ledgerMove(
    s,
    {
      type: "lock",
      coins: 1,
      note: "A hug",
      serverValues: [14, 4],
      serverCards: [
        { rank: 14, suit: 0 },
        { rank: 4, suit: 2 },
      ],
      serverNow: 1000,
    },
    1,
  );
  let view = ledger.getPublicState(s, 0) as {
    values: unknown[];
    cards: unknown[];
  };
  assert.equal(view.values[1], null);
  assert.equal(view.cards[1], null);
  s = ledgerMove(s, { type: "flip", serverNow: 1100 }, 0);
  assert.equal((ledger.getPublicState(s, 0) as typeof view).values[1], null);
  s = ledgerMove(s, { type: "flip", serverNow: 1200 }, 1);
  assert.equal(s.status, "suspense");
  assert.throws(() => ledgerMove(s, { type: "reveal", serverNow: 1500 }, 0));
  s = ledgerMove(s, { type: "reveal", serverNow: 2600 }, 0);
  assert.equal(s.status, "done");
  assert.deepEqual(s.wallets, [11, 9]);
  assert.deepEqual(s.revealed[1], ["A hug"]);
});
test("Ledger auto-flips after 20 seconds without revealing early", () => {
  let s = createLedger({ wallet: 10, rounds: 1, entry: 1 });
  s = ledgerMove(s, { type: "lock", coins: 1 }, 0);
  s = ledgerMove(
    s,
    { type: "lock", coins: 1, serverValues: [2, 5], serverNow: 1000 },
    1,
  );
  assert.throws(() => ledgerMove(s, { type: "reveal", serverNow: 20999 }, 0));
  s = ledgerMove(s, { type: "reveal", serverNow: 21000 }, 0);
  assert.deepEqual(s.flipped, [true, true]);
});
test("Every d6 landing transform exposes the matching front face", () => {
  const normals = [
    [0, 0, 1],
    [1, 0, 0],
    [0, -1, 0],
    [0, 1, 0],
    [-1, 0, 0],
    [0, 0, -1],
  ];
  for (let n = 1; n <= 6; n++) {
    const {
      rotation: [x, y],
      value,
    } = diceLanding(n);
    const rad = Math.PI / 180,
      [a, b, c] = normals[n - 1],
      zAfterY = -a * Math.sin(y * rad) + c * Math.cos(y * rad),
      zAfterX = b * Math.sin(x * rad) + zAfterY * Math.cos(x * rad);
    assert.equal(value, n);
    assert.ok(zAfterX > 0.999);
  }
  assert.throws(() => diceLanding(7));
});
