export type Seat = 0 | 1;
export type GameId = "ledger" | "lostfound" | "syncsteps";
export type Config = Record<string, string | number | boolean | string[]>;
export type Move = { type: string; [key: string]: unknown };
export type Result = { winner: Seat | null; scores: number[]; reason: string };
export interface Module<S = unknown, P = unknown, Id extends string = GameId> {
  id: Id;
  title: string;
  description: string;
  coverSlot: string;
  setup: Record<string, readonly (string | number | boolean)[]>;
  createMatch(config: Config, seed: number): S;
  applyMove(state: S, move: Move, player: Seat): S;
  getPublicState(state: S, viewer: Seat): P;
  isOver(state: S): boolean;
  getResult(state: S): Result;
}
export function seeded(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const other = (s: Seat) => (1 - s) as Seat;
