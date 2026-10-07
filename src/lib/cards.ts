import { seeded } from "./plugin-games/types";
export type Card = { rank: number; suit: 0 | 1 | 2 | 3 };
export const suits = ["♥", "♦", "♣", "♠"] as const;
export function createDeck(): Card[] {
  return Array.from({ length: 52 }, (_, i) => ({
    rank: (i % 13) + 2,
    suit: Math.floor(i / 13) as Card["suit"],
  }));
}
export function rankLabel(rank: number) {
  return (
    ({ 11: "J", 12: "Q", 13: "K", 14: "A" } as Record<number, string>)[rank] ||
    String(rank)
  );
}
export function shuffle(deck: readonly Card[], random: () => number): Card[] {
  const result = deck.map((c) => ({ ...c }));
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function seededDeck(seed: number) {
  return shuffle(createDeck(), seeded(seed));
}
export function secureDeck() {
  return shuffle(createDeck(), () => {
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    return n[0] / 4294967296;
  });
}
export function deal(deck: readonly Card[], count = 1) {
  if (!Number.isInteger(count) || count < 1 || count > deck.length)
    throw new Error("Deck exhausted");
  return { cards: deck.slice(0, count), deck: deck.slice(count) };
}
export function handValue(cards: readonly Card[]) {
  let total = cards.reduce(
      (n, c) => n + (c.rank === 14 ? 11 : Math.min(10, c.rank)),
      0,
    ),
    aces = cards.filter((c) => c.rank === 14).length;
  while (total > 21 && aces) {
    total -= 10;
    aces--;
  }
  return {
    total,
    soft: aces > 0,
    hard: total - aces * 10,
    blackjack: cards.length === 2 && total === 21,
    bust: total > 21,
  };
}
export function compareHands(a: readonly Card[], b: readonly Card[]) {
  const x = handValue(a),
    y = handValue(b);
  if (x.bust && y.bust) return 0;
  if (x.bust) return -1;
  if (y.bust) return 1;
  if (x.blackjack !== y.blackjack) return x.blackjack ? 1 : -1;
  return Math.sign(x.total - y.total);
}
export const d6Rotation: Record<number, [number, number]> = {
  1: [0, 0],
  2: [0, -90],
  3: [-90, 0],
  4: [90, 0],
  5: [0, 90],
  6: [0, 180],
};
export function diceLanding(value: number) {
  if (!d6Rotation[value]) throw new Error("Invalid die");
  return { value, rotation: d6Rotation[value] };
}
