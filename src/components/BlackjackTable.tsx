"use client";
import { useEffect, useRef, useState } from "react";
import type { BlackjackState } from "@/lib/plugin-games/blackjack";
import type { Move, Seat } from "@/lib/plugin-games/types";
import { handValue, rankLabel, suits } from "@/lib/cards";
import {
  armGameSounds,
  playGameSound,
  confettiBurst,
  coinFly,
  shake,
} from "@/lib/game-feel";
import CasinoChip from "./CasinoChip";
import PlayingCard from "./PlayingCard";
import { Slot } from "./ArtSlots";
export function BlackjackBuyIn({
  state,
  seat,
  wallet,
  busy,
  onBuyIn,
  onTopUp,
}: {
  state: BlackjackState;
  seat: Seat;
  wallet: number;
  busy: boolean;
  onBuyIn: (amount: number) => void;
  onTopUp?: () => void;
}) {
  const [amount, setAmount] = useState(10);
  return (
    <section className="blackjack-buyin">
      <h3>Your chips for the table</h3>
      <p>Wallet: {wallet} chips</p>
      {state.buyIns[seat] > 0 ? (
        <p role="status">{state.buyIns[seat]} chips locked</p>
      ) : (
        <>
          {wallet < 10 && (
            <p role="status">
              You need 10 chips to join.{" "}
              {wallet < 3 && onTopUp ? (
                <button disabled={busy} onClick={onTopUp}>
                  Use daily top-up
                </button>
              ) : (
                "Add chips in the Promise Ledger, or wait for your next daily top-up."
              )}
            </p>
          )}
          <div className="chip-picker">
            {[10, 25, 50, 100, wallet]
              .filter((n, i, a) => n >= 10 && n <= wallet && a.indexOf(n) === i)
              .map((n) => (
                <button
                  key={n}
                  aria-pressed={amount === n}
                  onClick={() => setAmount(n)}
                >
                  {n === wallet ? "All" : <CasinoChip value={n} />}
                </button>
              ))}
          </div>
          <div className="chip-stepper">
            <button
              aria-label="Fewer chips"
              disabled={amount <= 10}
              onClick={() => setAmount((n) => Math.max(10, n - 1))}
            >
              −
            </button>
            <output>{amount}</output>
            <button
              aria-label="More chips"
              disabled={amount >= wallet}
              onClick={() => setAmount((n) => Math.min(wallet, n + 1))}
            >
              +
            </button>
          </div>
          <button
            disabled={busy || wallet < 10 || amount > wallet}
            onClick={() => onBuyIn(amount)}
          >
            Bring {amount} chips
          </button>
        </>
      )}
    </section>
  );
}
export default function BlackjackTable({
  state: s,
  seat,
  busy,
  onMove,
  now,
}: {
  state: BlackjackState;
  seat: Seat;
  busy: boolean;
  onMove: (move: Move) => void;
  now: number;
}) {
  const [bet, setBet] = useState(0),
    [note, setNote] = useState(""),
    [idea, setIdea] = useState(""),
    [ideas, setIdeas] = useState([
      "A kiss",
      "A massage",
      "Breakfast in bed",
      "A little favor",
    ]),
    table = useRef<HTMLDivElement>(null),
    wallet = useRef<HTMLSpanElement>(null),
    pot = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("ledger-stake-ideas") || "null",
      );
      if (Array.isArray(stored)) setIdeas(stored);
    } catch {}
  }, []);
  useEffect(() => {
    setBet(0);
    setNote("");
  }, [s.round]);
  useEffect(() => {
    if (s.status === "summary") {
      playGameSound(
        s.roundWinner === seat
          ? "coin-win"
          : s.roundWinner === null
            ? "chip-stack"
            : "lose-sad",
      );
      if (s.roundWinner === seat && table.current) {
        confettiBurst(table.current);
        if (pot.current && wallet.current) coinFly(pot.current, wallet.current);
      } else if (s.roundWinner !== null && table.current) shake(table.current);
    }
  }, [s.history.length]);
  useEffect(() => {
    if (s.status !== "summary" || seat !== 0) return;
    const t = setTimeout(() => onMove({ type: "next" }), 5000);
    return () => clearTimeout(t);
  }, [s.status, s.round, seat]);
  const send = (move: Move) => {
    armGameSounds();
    playGameSound(
      move.type === "hit"
        ? "card-deal"
        : move.type.includes("note")
          ? "wax-seal"
          : move.type === "bet" || move.type === "match"
            ? "chip-stack"
            : "button-tap",
    );
    onMove(move);
  };
  const proposal = [...s.notes].reverse().find((n) => n.status === "proposed"),
    short = s.pending?.player === seat && s.chips[seat] < s.pending.amount,
    last = s.history.at(-1),
    mine = s.hands[seat],
    total = mine.length && mine.every(Boolean) ? handValue(mine) : null;
  const hand = (p: number) => (
    <div className={`blackjack-hand ${p === seat ? "own" : "partner"}`}>
      <p>
        {p === seat ? "You" : "Partner"} · {s.chips[p]} chips
      </p>
      <div className="blackjack-cards">
        {s.hands[p].map((c, i) => (
          <PlayingCard
            key={`${s.round}:${p}:${i}`}
            card={c}
            faceUp={!!c}
            backSlot="blackjack-card-back"
            dealing
            onFlip={
              p === seat && i === 1 && !c && s.status === "playing"
                ? () => send({ type: "peek" })
                : undefined
            }
            winner={s.status === "summary" && s.roundWinner === p}
          />
        ))}
      </div>
      <span className="hand-total">
        {p === seat
          ? total
            ? total.soft
              ? `${total.hard} / ${total.total}`
              : total.total
            : mine.length
              ? "Tap your hole card"
              : "Waiting for the deal"
          : s.status === "summary" || s.status === "done"
            ? handValue(s.hands[p]).total
            : `${s.hands[p].length} cards`}
      </span>
    </div>
  );
  return (
    <div className="blackjack-table" ref={table}>
      <Slot name="blackjack-table" className="blackjack-table-art" />
      <header className="blackjack-hud">
        <span ref={wallet}>You {s.chips[seat]} ◉</span>
        <span>Partner {s.chips[1 - seat]} ◉</span>
        <span>Round {s.round}</span>
        <span>Bet {s.bet}</span>
        <span aria-label={`${3 - s.notesUsed[seat]} Stake Notes left`}>
          {[0, 1, 2].map((i) => (
            <i key={i}>{i < s.notesUsed[seat] ? "◇" : "♥"}</i>
          ))}
        </span>
        {s.endsAt && (
          <time>{Math.max(0, Math.ceil((s.endsAt - now) / 1000))}s</time>
        )}
      </header>
      {hand(1 - seat)}
      <div className="blackjack-pot">
        <span ref={pot}>Pot {s.pot} ◉</span>
        <strong className="game-turn" aria-live="polite">
          {s.status === "summary"
            ? s.roundWinner === null
              ? "Push · chips returned"
              : s.roundWinner === seat
                ? "You win!"
                : "Partner wins!"
            : s.turn === seat
              ? "Your turn"
              : "Partner’s turn"}
        </strong>
        {last?.round === s.round && last.bonusCapped && (
          <small>Paid what you had</small>
        )}
      </div>
      {hand(seat)}
      <footer className="blackjack-actions">
        {s.status === "betting" && s.turn === seat && (
          <>
            <div className="chip-picker">
              {[0, 1, 5, 10, 25]
                .filter((n) => n <= s.chips[seat])
                .map((n) => (
                  <button
                    key={n}
                    aria-pressed={bet === n}
                    onClick={() => setBet(n)}
                  >
                    {n === 0 ? "Ante only" : <CasinoChip value={n} />}
                  </button>
                ))}
            </div>
            <input
              aria-label="Raise chips"
              type="range"
              min={0}
              max={s.chips[seat]}
              value={bet}
              onChange={(e) => setBet(+e.target.value)}
            />
            <button
              disabled={busy}
              onClick={() => send({ type: "bet", amount: bet })}
            >
              Bet {s.bet + bet} chips
            </button>
          </>
        )}
        {s.status === "matching" &&
          s.turn === seat &&
          (short ? (
            <section className="stake-sheet">
              <h3>Not enough chips</h3>
              <p>
                Stake Notes left: {3 - s.notesUsed[seat]}/3 · shortfall{" "}
                {Math.max(0, s.pending!.amount - s.chips[seat])}
              </p>
              {s.config.notes !== false && s.notesUsed[seat] < 3 && (
                <>
                  <textarea
                    aria-label="Stake Note"
                    maxLength={140}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="A kind, fun, doable promise…"
                  />
                  <p>Both of you must be comfortable with it.</p>
                  <button
                    onClick={() =>
                      setNote(
                        ideas[Math.floor(Math.random() * ideas.length)] || "",
                      )
                    }
                  >
                    Stake ideas
                  </button>
                  <details>
                    <summary>Add a stake idea</summary>
                    <input
                      aria-label="New stake idea"
                      maxLength={140}
                      value={idea}
                      onChange={(e) => setIdea(e.target.value)}
                    />
                    <button
                      disabled={!idea.trim()}
                      onClick={() => {
                        const next = [...ideas, idea.trim()].slice(-40);
                        setIdeas(next);
                        localStorage.setItem(
                          "ledger-stake-ideas",
                          JSON.stringify(next),
                        );
                        setIdea("");
                      }}
                    >
                      Save idea
                    </button>
                  </details>
                  <button
                    disabled={busy || !note.trim()}
                    onClick={() => send({ type: "stake_note", text: note })}
                  >
                    Stake a Note
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  if (confirm("Resign and end this session?"))
                    send({ type: "resign" });
                }}
              >
                Resign
              </button>
            </section>
          ) : (
            <button disabled={busy} onClick={() => send({ type: "match" })}>
              Match {s.pending?.amount} chips
            </button>
          ))}
        {s.status === "note" &&
          proposal &&
          (proposal.author === seat ? (
            <p role="status">Waiting for Partner to read your note…</p>
          ) : (
            <section className="stake-sheet">
              <h3>Partner’s Stake Note</h3>
              <blockquote>{proposal.text}</blockquote>
              <p>
                Covers {proposal.shortfall} chips of the betting requirement.
              </p>
              <button
                disabled={busy}
                onClick={() => send({ type: "accept_note" })}
              >
                Accept
              </button>
              <button
                disabled={busy}
                onClick={() => send({ type: "decline_note" })}
              >
                Decline
              </button>
            </section>
          ))}
        {s.status === "playing" && s.turn === seat && (
          <>
            {s.config.peek && !s.peekHints[seat] && (
              <button
                disabled={busy}
                onClick={() => send({ type: "peek_hint" })}
              >
                Peek at next card
              </button>
            )}
            {s.peekHints[seat] && (
              <span role="status">
                Next card: {rankLabel(s.peekHints[seat]!.rank)}{" "}
                {suits[s.peekHints[seat]!.suit]}
              </span>
            )}
            <button disabled={busy} onClick={() => send({ type: "hit" })}>
              Hit
            </button>
            <button disabled={busy} onClick={() => send({ type: "stand" })}>
              Stand
            </button>
            {s.config.double && s.hands[seat].length === 2 && (
              <button disabled={busy} onClick={() => send({ type: "double" })}>
                Double Down
              </button>
            )}
          </>
        )}
        {s.status === "summary" && (
          <>
            <p>
              {last?.winner !== null &&
              last &&
              handValue(last.hands[last.winner]).blackjack
                ? "Blackjack!"
                : ""}{" "}
              Next round in a moment…
            </p>
            {s.notes
              .filter((n) => n.status === "owed" && n.round === s.round)
              .map((n) => (
                <blockquote key={n.id}>
                  {n.author === seat ? "Your promise" : "Partner’s promise"}:{" "}
                  {n.text}
                </blockquote>
              ))}
            <button disabled={busy} onClick={() => send({ type: "next" })}>
              Next round
            </button>
            <button disabled={busy} onClick={() => send({ type: "end" })}>
              End session
            </button>
          </>
        )}
        {s.status !== "done" && (
          <button
            className="text-button"
            onClick={() => {
              if (
                confirm(
                  "Resign this session? Pending chips and accepted promises go to Partner.",
                )
              )
                send({ type: "resign" });
            }}
          >
            Resign session
          </button>
        )}
      </footer>
    </div>
  );
}
