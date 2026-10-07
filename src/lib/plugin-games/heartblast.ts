import {
  initialHeartState,
  heartStep,
  heartWinner,
  defaultHeartOptions,
  type HeartState,
  type HeartOptions,
} from "../heartblast";
import type { Module, Config, Move, Seat } from "./types";
type State = {
  seed: number;
  engine: HeartState;
  status: "waiting" | "playing" | "done";
};
export const heartblast: Module<State, State, "heartblast"> = {
  id: "heartblast",
  title: "Block Hearts Duel",
  description: "Two boards. One clock. All the points.",
  coverSlot: "heartblast-cover",
  setup: {
    mode: ["timed", "endless", "race", "daily"],
    seconds: [60, 120, 180, 300, 600],
    target: [500, 1000, 2000],
    coop: [false, true],
    junk: [false, true],
    preview: [true, false],
  },
  createMatch(config: Config, seed: number) {
    const options = { ...defaultHeartOptions, ...config } as HeartOptions;
    return {
      seed,
      engine: initialHeartState(seed, options),
      status: options.mode === "daily" ? "playing" : "waiting",
    };
  },
  applyMove(input: State, move: Move, seat: Seat) {
    let s = structuredClone(input);
    if (s.status === "done") throw new Error("This run has ended.");
    if (move.type === "ready") {
      s.engine.ready[seat] = true;
      if (s.engine.ready.every(Boolean)) s.status = "playing";
      return s;
    }
    if (s.status !== "playing") throw new Error("Both players must be ready.");
    if (move.type === "finish") {
      s.engine.stuck[seat] = true;
    } else if (move.type === "place")
      s.engine = heartStep(
        s.engine,
        s.seed,
        seat,
        Number(move.piece),
        Number(move.row),
        Number(move.col),
      );
    else if (move.type === "deadline") s.status = "done";
    else throw new Error("Choose a placement.");
    const o = s.engine.options;
    if (
      (o.mode === "race" && s.engine.scores.some((n) => n >= o.target)) ||
      (o.coop && s.engine.stuck[0]) ||
      (o.mode === "daily" && s.engine.stuck[seat]) ||
      (o.mode === "endless" && s.engine.stuck.every(Boolean))
    )
      s.status = "done";
    return s;
  },
  getPublicState: (s) => structuredClone(s),
  isOver: (s) => s.status === "done",
  getResult: (s) => ({
    winner: heartWinner(s.engine) as Seat | null,
    scores: s.engine.scores,
    reason: "Official accepted placements",
  }),
};
