import { blackjack } from "./blackjack";
import { ledger } from "./ledger";
import { lostfound } from "./lostfound";
import { syncsteps } from "./syncsteps";
import { heartblast } from "./heartblast";
import type { Module, GameId } from "./types";
// State types are checked within each module. The wire boundary validates game IDs and delegates to that module.
export const pluginRegistry = [
  ledger,
  lostfound,
  blackjack,
] as const;
export const arcadeModules = [heartblast, ...pluginRegistry] as const;
export function plugin(id: string): Module<never, unknown> {
  // Retain the engine for historical results; retired games cannot create rooms.
  const m = [...pluginRegistry, syncsteps].find((x) => x.id === id);
  if (!m) throw new Error("Unknown game.");
  return m as Module<never, unknown>;
}
export const isPlugin = (id: string): id is GameId =>
  pluginRegistry.some((x) => x.id === id);
