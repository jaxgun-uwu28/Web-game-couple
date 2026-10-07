"use client";
import { useEffect } from "react";
import { useArtworkLibrary } from "./ArtSlots";
import {
  armGameSounds,
  playGameSound,
  setGameSoundAsset,
  soundSlots,
  spring,
} from "@/lib/game-feel";
export default function GameFeel() {
  const art = useArtworkLibrary();
  useEffect(() => {
    for (const slot of soundSlots)
      setGameSoundAsset(slot, art[slot]?.src || null);
  }, [art]);
  useEffect(() => {
    const tap = (e: Event) => {
      if (!e.isTrusted) return;
      const element = e.target as HTMLElement;
      if (
        !element.closest(
          ".game-paper,.plugin-game,.block-duel,.extra-station,.brain-lobby",
        )
      )
        return;
      armGameSounds();
      const button = element.closest("button");
      if (button) {
        spring(button);
        if (!button.closest(".playing-card,.game-die-wrap,.blackjack-table"))
          playGameSound("button-tap");
      }
    };
    document.addEventListener("pointerdown", tap);
    document.addEventListener("keydown", tap);
    return () => {
      document.removeEventListener("pointerdown", tap);
      document.removeEventListener("keydown", tap);
    };
  }, []);
  return null;
}
