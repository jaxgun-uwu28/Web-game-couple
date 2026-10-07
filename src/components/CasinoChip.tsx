import { Slot } from "./ArtSlots";
export default function CasinoChip({ value }: { value: number }) {
  const levels = [1, 5, 10, 25, 100],
    index = levels.findIndex((n) => value <= n),
    style = Math.max(0, index < 0 ? 4 : index),
    symbols = ["●", "✿", "◆", "♥", "★"];
  return (
    <span className={`casino-chip chip-${style}`}>
      <Slot name={`blackjack-chip-${style + 1}`}>
        <i aria-hidden="true">{symbols[style]}</i>
        <b>{value}</b>
      </Slot>
    </span>
  );
}
