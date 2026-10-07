import type { Card } from "../cards";
import { type Module, type Config, type Move, type Seat, other } from "./types";
export type LedgerState = {
  config: Config;
  wallets: number[];
  initial: number;
  pot: number;
  stakes: number[];
  notes: string[][];
  locked: boolean[];
  round: number;
  ties: number;
  wins: number[];
  values: number[] | null;
  cards?: Card[];
  flipped?: boolean[];
  flipDeadline?: number;
  revealAt?: number;
  revealed: string[][];
  winner: Seat | null;
  status: "betting" | "flipping" | "suspense" | "reveal" | "done";
  history: { winner: Seat; notes: string[]; pot: number }[];
};
export function createLedger(config: Config): LedgerState {
  const initial = Math.max(3, Math.min(100, Number(config.wallet) || 10));
  return {
    config,
    wallets: [initial, initial],
    initial: initial * 2,
    pot: 0,
    stakes: [0, 0],
    notes: [[], []],
    locked: [false, false],
    round: 1,
    ties: 0,
    wins: [0, 0],
    values: null,
    revealed: [[], []],
    winner: null,
    status: "betting",
    history: [],
  };
}
export function ledgerMove(input: LedgerState, move: Move, player: Seat) {
  const s = structuredClone(input),
    o = other(player),
    fee = Math.max(1, Number(s.config.entry) || 1);
  if (s.status === "done") throw new Error("This duel has finished.");
  if (move.type === "next") {
    if (s.status !== "reveal") throw new Error("Finish this round first.");
    s.round++;
    s.status = "betting";
    s.locked = [false, false];
    s.stakes = [0, 0];
    s.notes = [[], []];
    s.values = null;
    s.revealed = [[], []];
    s.ties = 0;
    return s;
  }
  if (s.status === "flipping") {
    const now = Number(move.serverNow);
    if (!Number.isFinite(now)) throw new Error("Server time unavailable");
    s.flipped ??= [false, false];
    if (move.type === "flip") s.flipped[player] = true;
    else if (move.type !== "reveal" || now < (s.flipDeadline || Infinity))
      throw new Error("Tap your card or roll your die");
    if (now >= (s.flipDeadline || Infinity)) s.flipped = [true, true];
    if (s.flipped.every(Boolean)) {
      s.status = "suspense";
      s.revealAt =
        now +
        (s.config.duel === "d6" || s.config.duel === "d20" ? 1400 : 600) +
        700;
    }
    return s;
  }
  if (s.status === "suspense") {
    if (
      move.type !== "reveal" ||
      Number(move.serverNow) < (s.revealAt || Infinity)
    )
      throw new Error("The reveal is coming");
    return resolveLedger(s);
  }
  if (s.status !== "betting" || s.locked[player])
    throw new Error("Your bet is already sealed.");
  if (move.type !== "lock") throw new Error("Choose a bet to seal.");
  const amount = Number(move.coins),
    minimum = Math.min(s.wallets[player], fee * 2 ** s.ties);
  if (
    !Number.isInteger(amount) ||
    amount < minimum ||
    amount > Math.min(s.wallets[player], Math.max(10, fee * 2 ** s.ties))
  )
    throw new Error("Choose a stake within your wallet and the cap.");
  const note = String(move.note || "").trim();
  if (note.length > 140)
    throw new Error("Keep your promise under 140 characters.");
  s.wallets[player] -= amount;
  s.pot += amount;
  s.stakes[player] += amount;
  if (note) s.notes[player].push(note);
  s.locked[player] = true;
  if (s.locked[o]) {
    const values = move.serverValues;
    if (
      !Array.isArray(values) ||
      values.length !== 2 ||
      values.some((x) => !Number.isInteger(x) || x < 1 || x > 52)
    )
      throw new Error("The server has not drawn this round.");
    s.values = values as number[];
    s.cards = Array.isArray(move.serverCards)
      ? (move.serverCards as Card[])
      : undefined;
    s.flipped = [false, false];
    s.flipDeadline = Number(move.serverNow) + 20000;
    s.status = "flipping";
  }
  if (s.wallets.reduce((a, b) => a + b, 0) + s.pot !== s.initial)
    throw new Error("Wallet conservation failed.");
  return s;
}
export function resolveLedger(s: LedgerState) {
  const values = s.values!;
  if (values[0] === values[1]) {
    s.ties++;
    s.status = "betting";
    s.locked = [false, false];
    if (s.wallets.every((x) => x === 0)) {
      // No coins remain: resolve with a fresh secure draw without another ante.
      throw new Error("A tied empty wallet needs a fresh server draw.");
    }
    return s;
  }
  const winner = (values[0] > values[1] ? 0 : 1) as Seat,
    loser = other(winner);
  s.wallets[winner] += s.pot;
  s.wins[winner]++;
  s.history.push({ winner, notes: [...s.notes[loser]], pot: s.pot });
  s.revealed[loser] = [...s.notes[loser]];
  if (s.config.revealBoth) s.revealed[winner] = [...s.notes[winner]];
  s.winner = winner;
  s.pot = 0;
  const rounds = Number(s.config.rounds) || 1,
    over =
      s.config.rounds === "broke"
        ? s.wallets.some((x) => x === 0)
        : s.wins[winner] >= Math.ceil(rounds / 2);
  s.status = over ? "done" : "reveal";
  return s;
}
export const ledger: Module<LedgerState, unknown> = {
  id: "ledger",
  title: "The Ledger Duel",
  description: "A few coins. A little promise.",
  coverSlot: "ledger-cover",
  setup: {
    duel: ["card", "d6", "d20"],
    rounds: [1, 3, 5, "broke"],
    wallet: [10, 20, 50],
    entry: [1, 2, 3],
    revealBoth: [false, true],
  },
  createMatch: createLedger,
  applyMove: ledgerMove,
  getPublicState(s, viewer) {
    return {
      ...s,
      cards: s.cards?.map((c, i) =>
        s.status === "flipping" && i !== viewer ? null : c,
      ),
      values: s.values?.map((v, i) =>
        s.status === "flipping" && i !== viewer ? null : v,
      ),
      notes: s.notes.map((notes, i) => (i === viewer ? notes : s.revealed[i])),
      history: s.history,
      initial: undefined,
    };
  },
  isOver: (s) => s.status === "done",
  getResult: (s) => ({
    winner: s.wins[0] === s.wins[1] ? null : s.wins[0] > s.wins[1] ? 0 : 1,
    scores: s.wins,
    reason: "Promises and coins",
  }),
};
