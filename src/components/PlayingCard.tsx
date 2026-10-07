"use client";
import { type Card, rankLabel, suits } from "@/lib/cards";
import { armGameSounds, playGameSound, gameHaptic } from "@/lib/game-feel";
import { Slot } from "./ArtSlots";
export default function PlayingCard({
  card,
  faceUp = false,
  onFlip,
  winner = false,
  dealing = false,
  backSlot = "ledger-card-back",
}: {
  card?: Card | null;
  faceUp?: boolean;
  onFlip?: () => void;
  winner?: boolean;
  dealing?: boolean;
  backSlot?: string;
}) {
  return (
    <button
      type="button"
      className={`playing-card ${faceUp ? "face-up" : ""} ${winner ? "winner" : ""} ${dealing ? "dealing" : ""}`}
      aria-label={
        faceUp && card
          ? `${rankLabel(card.rank)} ${["hearts", "diamonds", "clubs", "spades"][card.suit]}`
          : onFlip
            ? "Flip your card"
            : "Face-down card"
      }
      disabled={!onFlip}
      onClick={(e) => {
        armGameSounds();
        playGameSound("card-flip");
        void gameHaptic(e.currentTarget);
        onFlip?.();
      }}
    >
      <span className="card-inner">
        <span className="card-back">
          <Slot name={backSlot}>
            <span>♥</span>
          </Slot>
        </span>
        <span className={`card-face suit-${card?.suit ?? 0}`}>
          {faceUp && card && (
            <Slot name={`ledger-card-face-${card.suit * 13 + card.rank - 1}`}>
              <small>
                {rankLabel(card.rank)}
                {suits[card.suit]}
              </small>
              <b>{suits[card.suit]}</b>
              <small>
                {rankLabel(card.rank)}
                {suits[card.suit]}
              </small>
            </Slot>
          )}
        </span>
      </span>
    </button>
  );
}
