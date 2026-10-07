import {
  type Module,
  type Config,
  type Move,
  type Seat,
  seeded,
  other,
} from "./types";
export type Maze = {
  size: number;
  tiles: string[];
  start: number;
  exit: number;
};
export type Joint = {
  positions: number[];
  keys: number[];
  blocks: number[][];
  sticky: boolean[];
};
export type MazeState = {
  config: Config;
  maps: Maze[];
  joint: Joint;
  history: { joint: Joint; falls: number[]; turn: Seat }[];
  moves: number;
  optimal: number;
  turn: Seat;
  falls: number[];
  status: "playing" | "done";
  pings: { seat: Seat; coordinate: string }[];
  chat: { seat: Seat; text: string }[];
};
const vectors: Record<string, number[]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
function target(map: Maze, cell: number, dir: string) {
  const [dx, dy] = vectors[dir] || [0, 0],
    x = (cell % map.size) + dx,
    y = Math.floor(cell / map.size) + dy;
  return x < 0 || x >= map.size || y < 0 || y >= map.size
    ? -1
    : y * map.size + x;
}
export function jointMove(
  maps: Maze[],
  input: Joint,
  dir: string,
): { joint: Joint; falls: number[] } {
  const j = structuredClone(input),
    falls = [0, 0];
  for (let p = 0; p < 2; p++) {
    const map = maps[p],
      from = j.positions[p];
    if (j.sticky[p]) {
      j.sticky[p] = false;
      continue;
    }
    let to = target(map, from, dir);
    const blocked = (n: number) =>
      n < 0 ||
      map.tiles[n] === "wall" ||
      (map.tiles[n]?.startsWith("door") && !(j.keys[p] & 1)) ||
      (map.tiles[n]?.startsWith("arrow:") && map.tiles[n].slice(6) !== dir);
    if (blocked(to)) continue;
    if (j.blocks[p].includes(to)) {
      const beyond = target(map, to, dir);
      if (blocked(beyond) || j.blocks[p].includes(beyond)) continue;
      j.blocks[p] = j.blocks[p].map((b) => (b === to ? beyond : b));
    }
    let guard = 0;
    while (map.tiles[to] === "ice" && guard++ < map.size) {
      const n = target(map, to, dir);
      if (blocked(n) || j.blocks[p].includes(n)) break;
      to = n;
    }
    if (map.tiles[to] === "pit") {
      to = map.start;
      falls[p] = 1;
    }
    if (map.tiles[to] === "key") j.keys[p] |= 1;
    if (map.tiles[to] === "sticky") j.sticky[p] = true;
    if (map.tiles[to] === "portal") {
      const pair = map.tiles.findIndex((t, i) => t === "portal" && i !== to);
      if (pair >= 0) to = pair;
    }
    j.positions[p] = to;
  }
  return { joint: j, falls };
}
function initial(maps: Maze[]): Joint {
  return {
    positions: maps.map((m) => m.start),
    keys: [0, 0],
    blocks: maps.map((m) =>
      m.tiles.flatMap((t, i) => (t === "block" ? [i] : [])),
    ),
    sticky: [false, false],
  };
}
export function solveJoint(
  maps: Maze[],
  maxStates = 120000,
): { moves: number; solution: string[] } | null {
  const start = initial(maps),
    q: { j: Joint; path: string[] }[] = [{ j: start, path: [] }],
    seen = new Set([JSON.stringify(start)]);
  for (let n = 0; n < q.length && n < maxStates; n++) {
    const { j, path } = q[n];
    if (j.positions.every((p, i) => p === maps[i].exit))
      return { moves: path.length, solution: path };
    for (const d of Object.keys(vectors)) {
      const next = jointMove(maps, j, d).joint,
        key = JSON.stringify(next);
      if (!seen.has(key)) {
        seen.add(key);
        q.push({ j: next, path: [...path, d] });
      }
    }
  }
  return null;
}
export function generateLevel(
  seed: number,
  difficulty = 1,
): { maps: Maze[]; optimal: number } {
  const r = seeded(seed),
    size = difficulty < 3 ? 4 : 5;
  for (let attempt = 0; attempt < 12; attempt++) {
    const maps = Array.from({ length: 2 }, (_, p) => {
      const tiles: string[] = Array(size * size).fill("wall");
      const path =
        p === 0
          ? [
              ...Array.from({ length: size }, (_, i) => i * size),
              ...Array.from(
                { length: size - 1 },
                (_, i) => (size - 1) * size + i + 1,
              ),
            ]
          : [
              ...Array.from({ length: size }, (_, i) => i),
              ...Array.from(
                { length: size - 1 },
                (_, i) => (i + 1) * size + size - 1,
              ),
            ];
      for (const i of path) tiles[i] = "floor";
      if (attempt < 11)
        for (let i = 1; i < tiles.length - 1; i++)
          if (tiles[i] === "wall" && r() < 0.15) tiles[i] = "floor";
      if (difficulty >= 2) tiles[path[2]] = "sticky";
      if (difficulty >= 3) tiles[path[3]] = "ice";
      if (difficulty >= 4) {
        tiles[path[1]] = "key";
        tiles[path[path.length - 2]] = "door";
      }
      if (difficulty >= 5) {
        tiles[size + 1] = "portal";
        tiles[size + size - 2] = "portal";
        tiles[size + 2] = "block";
        tiles[2 * size + 1] = "pit";
      }
      if (difficulty >= 3)
        tiles[path[size + 1]] = `arrow:${p === 0 ? "right" : "down"}`;
      return { size, tiles, start: 0, exit: size * size - 1 };
    });
    const result = solveJoint(maps, 20000);
    if (result && result.moves >= 4 + difficulty && result.moves <= 50)
      return { maps, optimal: result.moves };
  }
  throw new Error("Could not generate a solvable maze. Try another seed.");
}
export const levels = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  seed: 73019 + i * 997,
  difficulty: Math.min(5, 1 + Math.floor(i / 6)),
}));
export function createMaze(config: Config, seed: number): MazeState {
  const level =
      levels[Math.max(0, Math.min(29, Number(config.level || 1) - 1))],
    generated = generateLevel(
      config.infinite ? seed : level.seed ^ seed,
      config.infinite ? Number(config.difficulty) || 2 : level.difficulty,
    );
  return {
    config,
    maps: generated.maps,
    joint: initial(generated.maps),
    history: [],
    moves: 0,
    optimal: generated.optimal,
    turn: 0,
    falls: [0, 0],
    status: "playing",
    pings: [],
    chat: [],
  };
}
export function mazeMove(input: MazeState, m: Move, p: Seat) {
  const s = structuredClone(input);
  if (s.status === "done") throw new Error("This maze is finished.");
  if (m.type === "chat") {
    const text = String(m.text || "")
      .trim()
      .slice(0, 180);
    if (text) s.chat = [...s.chat.slice(-29), { seat: p, text }];
    return s;
  }
  if (m.type === "ping") {
    const cell = Number(m.cell),
      size = s.maps[p].size;
    if (!Number.isInteger(cell) || cell < 0 || cell >= size * size)
      throw new Error("Choose a tile.");
    s.pings = [
      ...s.pings.slice(-4),
      {
        seat: p,
        coordinate: `${String.fromCharCode(65 + (cell % size))}${Math.floor(cell / size) + 1}`,
      },
    ];
    return s;
  }
  if (
    (s.config.control === "turns" && s.turn !== p) ||
    (s.config.control === "driver" && p !== 0)
  )
    throw new Error("Partner is driving this move.");
  if (m.type === "undo") {
    const last = s.history.pop();
    if (last) {
      s.joint = last.joint;
      s.falls = last.falls;
      s.turn = last.turn;
      s.moves = Math.max(0, s.moves - 1);
    }
    return s;
  }
  if (m.type === "reset") {
    s.joint = initial(s.maps);
    s.history = [];
    s.moves = 0;
    s.falls = [0, 0];
    s.turn = 0;
    return s;
  }
  const dir = String(m.direction);
  if (m.type !== "move" || !vectors[dir])
    throw new Error("Choose a direction.");
  s.history.push({ joint: s.joint, falls: [...s.falls], turn: s.turn });
  const next = jointMove(s.maps, s.joint, dir);
  s.joint = next.joint;
  s.falls = s.falls.map((x, i) => x + next.falls[i]);
  s.moves++;
  s.turn = other(s.turn);
  if (s.joint.positions.every((x, i) => x === s.maps[i].exit))
    s.status = "done";
  if (Number(s.config.limit) && s.moves >= Number(s.config.limit))
    s.status = "done";
  if (
    Number(s.config.hearts) &&
    s.falls.some((n) => n >= Number(s.config.hearts))
  )
    s.status = "done";
  return s;
}
export const syncsteps: Module<MazeState, unknown> = {
  id: "syncsteps",
  title: "Sync Steps",
  description: "Two maps. One move. Find your way together.",
  coverSlot: "syncsteps-cover",
  setup: {
    daily: [false, true],
    control: ["shared", "turns", "driver"],
    level: Array.from({ length: 30 }, (_, i) => i + 1),
    reveal: [false, true],
    infinite: [false, true],
    difficulty: [1, 2, 3, 4, 5],
    limit: [0, 30, 50, 100],
    hearts: [0, 3, 5],
  },
  createMatch: createMaze,
  applyMove: mazeMove,
  getPublicState(s, p) {
    return {
      ...s,
      maps:
        s.config.reveal || s.status === "done"
          ? s.maps
          : s.maps.map((m, i) => (i === p ? m : null)),
      history: undefined,
      joint:
        s.config.reveal || s.status === "done"
          ? s.joint
          : {
              ...s.joint,
              positions: s.joint.positions.map((x, i) => (i === p ? x : null)),
              keys: s.joint.keys.map((x, i) => (i === p ? x : 0)),
              blocks: s.joint.blocks.map((x, i) => (i === p ? x : [])),
              sticky: s.joint.sticky.map((x, i) => (i === p ? x : false)),
            },
    };
  },
  isOver: (s) => s.status === "done",
  getResult: (s) => ({
    winner: null,
    scores: [
      s.joint.positions.every((x, i) => x === s.maps[i].exit)
        ? Math.max(1, 3 - Math.floor(Math.max(0, s.moves - s.optimal) / 5))
        : 0,
      s.joint.positions.every((x, i) => x === s.maps[i].exit)
        ? Math.max(1, 3 - Math.floor(Math.max(0, s.moves - s.optimal) / 5))
        : 0,
    ],
    reason: s.joint.positions.every((x, i) => x === s.maps[i].exit)
      ? "Both flags reached"
      : Number(s.config.hearts) && s.falls.some(n => n >= Number(s.config.hearts))
        ? "Out of hearts — try together again"
        : "Move limit reached",
  }),
};
