import {
  type Module,
  type Config,
  type Move,
  type Seat,
  other,
  seeded,
} from "./types";
export type Guess = {
  cell: number;
  distance: number;
  temperature: string;
  trend: string;
};
export type LostState = {
  config: Config;
  size: number;
  items: string[];
  treasures: (number | null)[];
  guesses: Guess[][];
  hidden: boolean[];
  turn: Seat;
  winner: Seat | null;
  status: "hiding" | "hunting" | "done";
  powerups: string[][];
  found: boolean[];
  turnExpiresAt: string | null;
  powerHints:string[][];
};
export const temperature = (d: number) =>
  d === 0
    ? "Found"
    : d === 1
      ? "Burning"
      : d === 2
        ? "Hot"
        : d === 3
          ? "Warm"
          : d === 4
            ? "Cool"
            : d === 5
              ? "Cold"
              : "Freezing";
export function distance(a: number, b: number, size: number, metric: string) {
  const dx = Math.abs((a % size) - (b % size)),
    dy = Math.abs(Math.floor(a / size) - Math.floor(b / size));
  return metric === "manhattan" ? dx + dy : Math.max(dx, dy);
}
export function createLost(config: Config, seed: number): LostState {
  const size = [5, 6, 8].includes(Number(config.size))
      ? Number(config.size)
      : 5,
    r = seeded(seed),
    words = Array.isArray(config.words) ? config.words : [],
    pools: Record<string,string[]> = {
      snacks:['peach','strawberry','apple','cherry','cookie','cake'],
      animals:['cat','rabbit','bird','fish','dog','paw'],
      plants:['flower','leaf','tree','sprout','rose','cactus'],
      weather:['cloud','sun','rain','snow','rainbow','star'],
    },
    pool = pools[String(config.theme)] || [
      "heart",
      "star",
      "cloud",
      "flower",
      "peach",
      "cat",
      "leaf",
      "strawberry",
    ];
  return {
    config,
    size,
    items: Array.from(
      { length: size * size },
      (_, i) => words[i]?.slice(0, 30) || pool[Math.floor(r() * pool.length)],
    ),
    treasures: [null, null],
    guesses: [[], []],
    hidden: [false, false],
    turn: 0,
    winner: null,
    status: "hiding",
    powerups: [[], []],
    found: [false, false],
    turnExpiresAt: null,
    powerHints:[[],[]],
  };
}
export function lostMove(input: LostState, m: Move, p: Seat) {
  const s = structuredClone(input),
    cell = Number(m.cell),
    o = other(p);
  s.powerHints ??= [[], []];
  s.powerups ??= [[], []];
  if (s.status === "done") throw new Error("The hunt has finished.");
  if (m.type === "timeout") {
    if (s.status !== "hunting" || !s.turnExpiresAt || !Number.isFinite(Number(m.serverNow)) || Number(m.serverNow) < Date.parse(s.turnExpiresAt))
      throw new Error("The turn is still running.");
    s.status = "done";
    s.winner = other(s.turn);
    return s;
  }
  if(m.type==='powerup'){
    const kind=String(m.kind);if(s.status!=='hunting'||!['sonar','magnifier','skip'].includes(kind)||s.powerups[p].includes(kind))throw new Error('That power-up is unavailable.');
    if(s.config.mode==='turns'&&s.turn!==p)throw new Error('Wait for your turn.');
    const treasure=s.treasures[o]!;
    if(kind==='sonar')s.powerHints[p].push(m.axis==='column'?`Column ${String.fromCharCode(65+treasure%s.size)}`:`Row ${Math.floor(treasure/s.size)+1}`);
    if(kind==='magnifier'){if(!Number.isInteger(cell)||cell<0||cell>=s.size*s.size)throw new Error('Choose a square first.');s.powerHints[p].push(`Near square ${cell+1}: ${distance(cell,treasure,s.size,'chebyshev')<=1?'yes':'no'}`);}
    if(kind==='skip'){
      if(s.config.mode!=='turns')throw new Error('Skipping is only available when taking turns.');
      s.turn=s.found[o]?p:o;
      if(Number(s.config.timer))s.turnExpiresAt=new Date(Number(m.serverNow)+Number(s.config.timer)*1000).toISOString();
    }
    s.powerups[p].push(kind);return s;
  }
  if (!Number.isInteger(cell) || cell < 0 || cell >= s.size * s.size)
    throw new Error("Choose a square inside the map.");
  if (m.type === "hide") {
    if (s.status !== "hiding" || s.hidden[p])
      throw new Error("Your treasure is already hidden.");
    s.treasures[p] = cell;
    s.hidden[p] = true;
    if (s.hidden.every(Boolean)) {
      s.status = "hunting";
      if (s.config.mode === "turns" && Number(s.config.timer))
        s.turnExpiresAt = new Date(
          (Number(m.serverNow) || 0) + Number(s.config.timer) * 1000,
        ).toISOString();
    }
    return s;
  }
  if (m.type !== "guess" || s.status !== "hunting")
    throw new Error("Both treasures must be hidden first.");
  if (s.config.mode === "turns" && s.turn !== p)
    throw new Error("Wait for Partner’s turn.");
  if (s.guesses[p].some((g) => g.cell === cell))
    throw new Error("You already checked that square.");
  if (s.found[p]) throw new Error("You already found the treasure.");
  const d = distance(
      cell,
      s.treasures[o]!,
      s.size,
      String(s.config.metric || "chebyshev"),
    ),
    last = s.guesses[p].at(-1);
  s.guesses[p].push({
    cell,
    distance: d,
    temperature: temperature(d),
    trend: last
      ? d < last.distance
        ? "Warmer"
        : d > last.distance
          ? "Colder"
          : "Same warmth"
      : "",
  });
  s.turn = o;
  if (d === 0) {
    s.found[p] = true;
    if (s.config.mode === "race" || s.found.every(Boolean)) {
      s.status = "done";
      s.winner =
        s.config.mode === "race"
          ? p
          : s.guesses[0].length === s.guesses[1].length
            ? null
            : s.guesses[0].length < s.guesses[1].length
              ? 0
              : 1;
    }
  }
  if (s.found[o]) s.turn = p;
  if (s.config.mode === "turns" && Number(s.config.timer))
    s.turnExpiresAt = new Date(
      (Number(m.serverNow) || 0) + Number(s.config.timer) * 1000,
    ).toISOString();
  const limit = Number(s.config.limit) || 0;
  if (limit && s.guesses[p].length >= limit && !s.found[p]) {
    if (s.config.mode !== "relaxed") {
      s.status = "done";
      s.winner = o;
    }
  }
  return s;
}
export const lostfound: Module<LostState, unknown> = {
  id: "lostfound",
  title: "Lost & Found",
  description: "Hide a treasure. Follow a little warmth.",
  coverSlot: "lostfound-cover",
  setup: {
    size: [5, 6, 8],
    theme: ["cute", "snacks", "animals", "plants", "weather", "words"],
    mode: ["race", "turns", "relaxed"],
    hints: ["both", "temperature", "distance"],
    metric: ["chebyshev", "manhattan"],
    limit: [0, 10, 20],
    trend: [true, false],
    timer: [0, 30, 60, 120],
  },
  createMatch: createLost,
  applyMove: lostMove,
  getPublicState(s, p) {
    return {
      ...s,
      treasures:
        s.status === "done"
          ? s.treasures
          : s.treasures.map((t, i) => (i === p ? t : null)),
      guesses:
        s.status === "done"
          ? s.guesses
          : s.guesses.map((g, i) => (i === p ? g : [])),
      powerups:(s.powerups??[[],[]]).map((x,i)=>i===p?x:[]),powerHints:(s.powerHints??[[],[]]).map((x,i)=>i===p?x:[]),
    };
  },
  isOver: (s) => s.status === "done",
  getResult: (s) => ({
    winner: s.winner,
    scores: s.guesses.map((g, i) =>
      s.found[i] ? Math.max(1, 100 - g.length) : 0,
    ),
    reason: "Treasure found",
  }),
};
