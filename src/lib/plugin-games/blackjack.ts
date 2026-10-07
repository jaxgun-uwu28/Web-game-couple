import { type Card, deal, handValue, compareHands } from "../cards";
import { type Config, type Move, type Seat, type Module, other } from "./types";
export type StakeNote = {
  id: string;
  author: Seat;
  text: string;
  status: "proposed" | "accepted" | "declined" | "voided" | "owed";
  round: number;
  shortfall: number;
  owedTo?: Seat;
};
export type BlackjackState = {
  config: Config;
  chips: number[];
  buyIns: number[];
  notesUsed: number[];
  attempts: number[];
  round: number;
  opener: Seat;
  turn: Seat;
  pot: number;
  bet: number;
  stakes: number[];
  hands: Card[][];
  deck: Card[];
  peeked: boolean[];
  peekHints: (Card | null)[];
  stood: boolean[];
  notes: StakeNote[];
  status:
    "buyin" | "betting" | "matching" | "note" | "playing" | "summary" | "done";
  pending: {
    player: Seat;
    amount: number;
    kind: "ante" | "match" | "double";
    resume?: Seat;
  } | null;
  startedAt: number | null;
  endsAt: number | null;
  winner: Seat | null;
  roundWinner: Seat | null;
  pushes: number;
  history: {
    round: number;
    winner: Seat | null;
    hands: Card[][];
    pot: number;
    bonus: number;
    bonusCapped: boolean;
  }[];
  initial: number;
  reason: string;
};
export function createBlackjack(config: Config): BlackjackState {
  return {
    config,
    chips: [0, 0],
    buyIns: [0, 0],
    notesUsed: [0, 0],
    attempts: [0, 0],
    round: 1,
    opener: 0,
    turn: 1,
    pot: 0,
    bet: 0,
    stakes: [0, 0],
    hands: [[], []],
    deck: [],
    peeked: [false, false],
    peekHints: [null, null],
    stood: [false, false],
    notes: [],
    status: "buyin",
    pending: null,
    startedAt: null,
    endsAt: null,
    winner: null,
    roundWinner: null,
    pushes: 0,
    history: [],
    initial: 0,
    reason: "",
  };
}
function pay(s: BlackjackState, p: Seat, amount: number) {
  const n = Math.min(amount, s.chips[p]);
  s.chips[p] -= n;
  s.stakes[p] += n;
  s.pot += n;
  return amount - n;
}
function availableNote(s: BlackjackState, p: Seat) {
  return s.config.notes !== false && s.notesUsed[p] < 3 && s.attempts[p] < 3;
}
function notesResolve(s: BlackjackState, winner: Seat | null) {
  for (const n of s.notes) {
    if (n.status !== "accepted") continue;
    if (winner === null) continue;
    if (n.author === winner) n.status = "voided";
    else {
      n.status = "owed";
      n.owedTo = winner;
    }
  }
}
function finish(s: BlackjackState, winner: Seat | null, reason: string) {
  if (winner !== null) s.chips[winner] += s.pot;
  else for (const p of [0, 1] as Seat[]) s.chips[p] += s.stakes[p];
  notesResolve(s, winner);
  s.pot = 0;
  s.stakes = [0, 0];
  s.status = "done";
  s.winner = winner;
  s.reason = reason;
  s.deck = [];
  s.pending = null;
  return s;
}
function shortage(
  s: BlackjackState,
  p: Seat,
  amount: number,
  kind: "ante" | "match" | "double",
  resume?: Seat,
) {
  if (!availableNote(s, p)) return finish(s, other(p), "Out of chips");
  s.pending = { player: p, amount, kind, resume };
  s.status = "matching";
  s.turn = p;
  return s;
}
function beginRound(s: BlackjackState, now: number) {
  s.stakes = [0, 0];
  s.pot = 0;
  s.bet = Math.max(1, Number(s.config.ante) || 1) * 2 ** Math.min(10, s.pushes);
  s.hands = [[], []];
  s.deck = [];
  s.peeked = [false, false];
  s.peekHints = [null, null];
  s.stood = [false, false];
  s.attempts = [0, 0];
  s.pending = null;
  s.roundWinner = null;
  s.startedAt ??= now;
  s.endsAt ??=
    s.config.end === "time"
      ? now + Number(s.config.minutes || 3) * 60000
      : null;
  for (const p of [0, 1] as Seat[]) {
    const short = pay(s, p, s.bet);
    if (short) return shortage(s, p, short, "ante");
  }
  s.status = "betting";
  s.turn = s.opener;
  s.startedAt ??= now;
  s.endsAt ??=
    s.config.end === "time"
      ? now + Number(s.config.minutes || 3) * 60000
      : null;
  return s;
}
function startPlay(s: BlackjackState, move: Move) {
  if (!Array.isArray(move.serverDeck) || move.serverDeck.length !== 52)
    throw new Error("Server deck unavailable");
  s.deck = structuredClone(move.serverDeck as Card[]);
  for (const p of [0, 1] as Seat[]) {
    const d = deal(s.deck, 2);
    s.hands[p] = d.cards;
    s.deck = d.deck;
  }
  s.status = "playing";
  s.turn = other(s.opener);
  s.pending = null;
  return s;
}
function afterPayment(s: BlackjackState, move: Move) {
  const pending = s.pending!;
  s.pending = null;
  if (pending.kind === "ante") {
    const partner = other(pending.player);
    if (s.stakes[partner] === 0) {
      const short = pay(s, partner, s.bet);
      if (short) return shortage(s, partner, short, "ante");
    }
    s.status = "betting";
    s.turn = s.opener;
    return s;
  }
  if (pending.kind === "double") {
    const p = pending.resume!;
    if (pending.player === p) {
      s.bet += pending.amount;
      s.pending = {
        player: other(p),
        amount: pending.amount,
        kind: "double",
        resume: p,
      };
      s.status = "matching";
      s.turn = other(p);
      return s;
    }
    if (!s.hands[p].length) return startPlay(s, move);
    const d = deal(s.deck);
    s.hands[p].push(d.cards[0]);
    s.deck = d.deck;
    s.stood[p] = true;
    s.status = "playing";
    s.turn = other(p);
    return checkShowdown(s);
  }
  return startPlay(s, move);
}
function checkShowdown(s: BlackjackState) {
  for (const p of [0, 1] as Seat[])
    if (handValue(s.hands[p]).bust) s.stood[p] = true;
  if (!s.stood.every(Boolean)) {
    if (s.stood[s.turn]) s.turn = other(s.turn);
    return s;
  }
  const cmp = compareHands(s.hands[0], s.hands[1]),
    winner = cmp === 0 ? null : cmp > 0 ? 0 : 1,
    oldPot = s.pot;
  let bonus = 0,
    bonusCapped = false;
  if (winner === null) {
    for (const p of [0, 1] as Seat[]) s.chips[p] += s.stakes[p];
    s.pushes++;
  } else {
    const loser = other(winner);
    if (handValue(s.hands[winner]).blackjack && s.config.payout === "3:2") {
      const requested = Math.floor(Math.min(s.stakes[0], s.stakes[1]) / 2);
      bonus = Math.min(s.chips[loser], requested);
      bonusCapped = bonus < requested;
      s.chips[loser] -= bonus;
    }
    s.chips[winner] += s.pot + bonus;
    s.pushes = 0;
    notesResolve(s, winner);
  }
  s.history.push({
    round: s.round,
    winner,
    hands: structuredClone(s.hands),
    pot: oldPot,
    bonus,
    bonusCapped,
  });
  s.pot = 0;
  s.stakes = [0, 0];
  s.roundWinner = winner;
  s.status = "summary";
  return s;
}
export function blackjackMove(
  input: BlackjackState,
  move: Move,
  player: Seat,
): BlackjackState {
  const s = structuredClone(input),
    now = Number(move.serverNow);
  if (s.status === "done") throw new Error("This session has ended");
  if (!Number.isFinite(now)) throw new Error("Server clock unavailable");
  if (move.type === "resign") return finish(s, other(player), "Resigned");
  if (s.endsAt && now >= s.endsAt) {
    if (s.status === "playing") {
      s.stood = [true, true];
      checkShowdown(s);
    } else {
      for (const p of [0, 1] as Seat[]) s.chips[p] += s.stakes[p];
      s.pot = 0;
      s.stakes = [0, 0];
    }
    for (const n of s.notes)
      if (n.status === "accepted" || n.status === "proposed")
        n.status = "voided";
    return finish(
      s,
      s.chips[0] === s.chips[1] ? null : s.chips[0] > s.chips[1] ? 0 : 1,
      "Time is up",
    );
  }
  if (move.type === "buyin") {
    if (s.status !== "buyin" || s.buyIns[player] > 0)
      throw new Error("Buy-in already locked");
    const n = Number(move.amount);
    if (!Number.isInteger(n) || n < 10 || n > 100000)
      throw new Error("Choose at least 10 chips");
    s.buyIns[player] = n;
    s.chips[player] = n;
    s.initial += n;
    return s;
  }
  if (move.type === "start") {
    if (s.status !== "buyin" || s.buyIns.some((n) => n < 10))
      throw new Error("Both buy-ins are needed");
    return beginRound(s, now);
  }
  if (s.status === "summary") {
    if (move.type !== "next" && move.type !== "end")
      throw new Error("Continue the next round");
    if (
      move.type === "end" ||
      (s.config.end === "rounds" && s.round >= Number(s.config.rounds || 5))
    )
      return finish(
        s,
        s.chips[0] === s.chips[1] ? null : s.chips[0] > s.chips[1] ? 0 : 1,
        "Session complete",
      );
    s.round++;
    s.opener = other(s.opener);
    return beginRound(s, now);
  }
  if (move.type === "peek") {
    if (s.status !== "playing") throw new Error("Cards are not dealt");
    s.peeked[player] = true;
    return s;
  }
  if (s.status === "note") {
    const n = [...s.notes].reverse().find((n) => n.status === "proposed");
    if (!n || n.author === player)
      throw new Error("Partner is reading the note");
    if (move.type === "decline_note") {
      n.status = "declined";
      if (!availableNote(s, n.author))
        return finish(s, player, "Stake declined");
      s.status = "matching";
      s.turn = n.author;
      return s;
    }
    if (move.type !== "accept_note")
      throw new Error("Accept or decline the note");
    if (s.notesUsed[n.author] >= 3) throw new Error("No Stake Notes left");
    n.status = "accepted";
    s.notesUsed[n.author]++;
    pay(s, n.author, s.pending!.amount);
    return afterPayment(s, move);
  }
  if (player !== s.turn) throw new Error("Wait for your turn");
  if (s.status === "betting") {
    if (move.type !== "bet") throw new Error("Choose a bet");
    const raise = Number(move.amount);
    if (!Number.isInteger(raise) || raise < 0 || raise > s.chips[player])
      throw new Error("Bet exceeds available chips");
    pay(s, player, raise);
    s.bet += raise;
    s.turn = other(player);
    s.status = "matching";
    s.pending = {
      player: other(player),
      amount: Math.max(0, s.bet - s.stakes[other(player)]),
      kind: "match",
    };
    return s;
  }
  if (s.status === "matching") {
    const pending = s.pending!;
    if (move.type === "stake_note") {
      if (!availableNote(s, player))
        return finish(s, other(player), "Out of Stake Notes");
      if (s.chips[player] >= pending.amount)
        throw new Error("You can match with chips");
      const text = String(move.text || "").trim();
      if (!text || text.length > 140)
        throw new Error("Write a promise under 140 characters");
      s.attempts[player]++;
      s.notes.push({
        id: String(move.noteId),
        author: player,
        text,
        status: "proposed",
        round: s.round,
        shortfall: Math.max(0, pending.amount - s.chips[player]),
      });
      s.status = "note";
      return s;
    }
    if (move.type !== "match") throw new Error("Match or stake a note");
    if (s.chips[player] < pending.amount)
      return shortage(s, player, pending.amount, pending.kind, pending.resume);
    pay(s, player, pending.amount);
    return afterPayment(s, move);
  }
  if (s.status !== "playing") throw new Error("Round unavailable");
  if (move.type === "peek_hint") {
    if (!s.config.peek || s.peekHints[player])
      throw new Error("Peek unavailable");
    s.peekHints[player] = s.deck[0];
    return s;
  }
  if (move.type === "stand") {
    s.stood[player] = true;
    s.turn = other(player);
    return checkShowdown(s);
  }
  if (move.type === "double") {
    if (!s.config.double || s.hands[player].length !== 2)
      throw new Error("Double Down unavailable");
    const amount = s.bet;
    if (s.chips[player] < amount)
      return shortage(s, player, amount, "double", player);
    pay(s, player, amount);
    s.bet += amount;
    s.pending = {
      player: other(player),
      amount,
      kind: "double",
      resume: player,
    };
    s.status = "matching";
    s.turn = other(player);
    return s;
  }
  if (move.type !== "hit") throw new Error("Hit or Stand");
  const d = deal(s.deck);
  s.hands[player].push(d.cards[0]);
  s.deck = d.deck;
  s.turn = other(player);
  return checkShowdown(s);
}
export const blackjack: Module<BlackjackState, unknown> = {
  id: "blackjack",
  title: "Blackjack Duel",
  description: "Two hands. A few chips. A little promise.",
  coverSlot: "blackjack-cover",
  setup: {
    ante: [1, 2, 5],
    end: ["out", "rounds", "time"],
    rounds: [5, 10, 20],
    minutes: [3, 5, 10, 15],
    notes: [true, false],
    payout: ["3:2", "1:1"],
    double: [true, false],
    peek: [false, true],
  },
  createMatch: createBlackjack,
  applyMove: blackjackMove,
  getPublicState(s, viewer) {
    const reveal = s.status === "summary" || s.status === "done";
    return {
      ...s,
      deck: undefined,
      initial: undefined,
      peekHints: s.peekHints.map((c, p) => (p === viewer ? c : null)),
      hands: s.hands.map((h, p) =>
        h.map((c, i) =>
          i === 1 && !reveal && (p !== viewer || !s.peeked[viewer]) ? null : c,
        ),
      ),
      notes: s.notes.filter(
        (n) => n.author === viewer || n.status !== "voided",
      ),
      history: s.history,
    };
  },
  isOver: (s) => s.status === "done",
  getResult: (s) => ({ winner: s.winner, scores: s.chips, reason: s.reason }),
};
