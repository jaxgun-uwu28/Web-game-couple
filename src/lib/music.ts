export const gameTracks: Record<string, string> = {
  tic: "/audio/music/tic-tac-toe-song.mp3",
  connect: "/audio/music/connect-four-song.mp3",
  draw: "/audio/music/Draw-%26-guess-song.mp3",
  trivia: "/audio/music/a-little-brain-duel-song.mp3",
  block: "/audio/music/block-hearts-duel-song.mp3",
};
export type AudioPreferences = {
  background: number;
  games: number;
  gameMusic: boolean;
  haptics: boolean;
  sounds: boolean;
};
export const defaultAudio: AudioPreferences = {
  background: 0.3,
  games: 0.3,
  gameMusic: false,
  haptics: true,
  sounds: false,
};
export function readAudio(): AudioPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem("arcade-audio") || "{}");
    return {
      background: volume(saved.background, 0.3),
      games: volume(saved.games, 0.3),
      gameMusic: saved.gameMusic === true,
      haptics: saved.haptics !== false,
      sounds: saved.sounds === true,
    };
  } catch {
    return defaultAudio;
  }
}
function volume(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}
export function saveAudio(p: AudioPreferences) {
  localStorage.setItem("arcade-audio", JSON.stringify(p));
  window.dispatchEvent(new Event("arcade-audio-change"));
}
export function audioPlayback(kind: string | null, p: AudioPreferences) {
  if (kind && !p.gameMusic) return "muted";
  return kind && gameTracks[kind] ? "game" : "background";
}
export async function tactile(pattern: number | number[] = 12) {
  if (!readAudio().haptics) return;
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    if (Array.isArray(pattern) && pattern.length >= 3)
      setTimeout(() => {
        if (readAudio().haptics)
          void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      }, pattern[1]);
  } else navigator.vibrate?.(pattern);
}
