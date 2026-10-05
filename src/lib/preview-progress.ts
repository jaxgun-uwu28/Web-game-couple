import type { Game } from "./games";
import type { Progress } from "./together";
const finished = new Map<string, { kind: string; winner: number | null }>();
export function recordPreview(game: Pick<Game, "id" | "kind" | "state">) {
  if (!["won", "draw"].includes(game.state.status) || finished.has(game.id))
    return;
  finished.set(game.id, { kind: game.kind, winner: game.state.winner });
}
export function previewProgress(seat: number): Progress {
  const games = [...finished.values()],
    wins = games.filter((g) => g.winner === seat).length;
  return {
    played: games.length,
    wins,
    xp: games.length * 10 + wins * 5,
    coins: games.length * 2 + wins,
    by_kind: Object.fromEntries(
      [...new Set(games.map((g) => g.kind))].map((k) => [
        k,
        games.filter((g) => g.kind === k).length,
      ]),
    ),
  };
}
export function resetPreviewProgress() {
  finished.clear();
}
