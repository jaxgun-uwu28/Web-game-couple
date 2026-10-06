"use client";
import { useEffect, useState } from "react";
import {
  readAudio,
  saveAudio,
  defaultAudio,
  type AudioPreferences,
} from "@/lib/music";
export function useGameMusic(kind: string, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const owner = crypto.randomUUID();
    window.dispatchEvent(
      new CustomEvent("arcade-game-music", { detail: { kind, owner } }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("arcade-game-music", { detail: { kind: null, owner } }),
      );
    };
  }, [kind, active]);
}
export function useSoundPreference(setSound: (value: boolean) => void) {
  useEffect(() => {
    const sync = () => setSound(readAudio().sounds);
    sync();
    window.addEventListener("arcade-audio-change", sync);
    return () => window.removeEventListener("arcade-audio-change", sync);
  }, [setSound]);
}
export default function MusicControls() {
  const [p, set] = useState(defaultAudio);
  useEffect(() => {
    set(readAudio());
  }, []);
  function update(change: Partial<AudioPreferences>) {
    const next = { ...p, ...change };
    set(next);
    saveAudio(next);
  }
  return (
    <section className="audio-preferences">
      <h2>Music & feel</h2>
      <label>
        Background volume · {Math.round(p.background * 100)}%
        <input
          type="range"
          min="0"
          max="1"
          step=".01"
          value={p.background}
          onChange={(e) => update({ background: Number(e.target.value) })}
        />
      </label>
      <label>
        Game volume · {Math.round(p.games * 100)}%
        <input
          type="range"
          min="0"
          max="1"
          step=".01"
          value={p.games}
          onChange={(e) => update({ games: Number(e.target.value) })}
        />
      </label>
      <label className="audio-toggle">
        <input
          type="checkbox"
          checked={p.gameMusic}
          onChange={(e) => update({ gameMusic: e.target.checked })}
        />
        Game music
      </label>
      <label className="audio-toggle">
        <input
          type="checkbox"
          checked={p.sounds}
          onChange={(e) => update({ sounds: e.target.checked })}
        />
        Sound effects
      </label>
      <label className="audio-toggle">
        <input
          type="checkbox"
          checked={p.haptics}
          onChange={(e) => update({ haptics: e.target.checked })}
        />
        Haptics
      </label>
    </section>
  );
}
