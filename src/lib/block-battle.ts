export const blockShapes = [
  [0],
  [0, 1],
  [0, 8],
  [0, 1, 2],
  [0, 8, 16],
  [0, 1, 8, 9],
  [0, 8, 9],
  [0, 1, 9],
  [0, 1, 2, 8, 9, 10],
  [0, 1, 2, 9],
  [0, 1, 2, 3],
  [0, 8, 16, 17],
];
export const durations = [60, 120, 180, 300];
export function blockSize(shape: number) {
  const offsets = blockShapes[shape];
  return {
    width: Math.max(...offsets.map((o) => o % 8)) + 1,
    height: Math.max(...offsets.map((o) => Math.floor(o / 8))) + 1,
  };
}
export function blockAnchor(shape: number, row: number, col: number) {
  const { width, height } = blockSize(shape);
  return [
    Math.max(0, Math.min(8 - height, row)),
    Math.max(0, Math.min(8 - width, col)),
  ];
}
export const blockShapeNames = [
  "single block",
  "two blocks across",
  "two blocks down",
  "three blocks across",
  "three blocks down",
  "two by two square",
  "two down with one to the right at the bottom",
  "two across with one below the right end",
  "three by two rectangle",
  "three across with one below the middle",
  "four blocks across",
  "three down with one to the right at the bottom",
];
export type BlockMatch = {
  revision?: number;
  id: string;
  couple_id: string;
  duration: number;
  seed: number;
  status: "waiting" | "playing" | "won" | "draw" | "cancelled";
  starts_at: string | null;
  ends_at: string | null;
  winner: number | null;
  state: {
    boards: number[][];
    scores: number[];
    hands: number[][];
    used: boolean[][];
    rounds: number[];
    ready: boolean[];
    stuck: boolean[];
  };
};
export function blockHand(seed: number, round: number) {
  return [0, 1, 2].map(
    (i) =>
      (((seed + round * 31 + i * 17) * 48271) % 2147483647) %
      blockShapes.length,
  );
}
export function blockFits(
  board: number[],
  shape: number,
  row: number,
  col: number,
) {
  if (
    !blockShapes[shape] ||
    row < 0 ||
    col < 0 ||
    !Number.isInteger(row) ||
    !Number.isInteger(col)
  )
    return false;
  return blockShapes[shape].every(
    (offset) =>
      row + Math.floor(offset / 8) < 8 &&
      col + (offset % 8) < 8 &&
      board[(row + Math.floor(offset / 8)) * 8 + col + (offset % 8)] === 0,
  );
}
export function hasBlockMove(board: number[], hand: number[], used: boolean[]) {
  return hand.some(
    (shape, i) =>
      !used[i] &&
      board.some((_, anchor) =>
        blockFits(board, shape, Math.floor(anchor / 8), anchor % 8),
      ),
  );
}
export function placeBlock(
  board: number[],
  shape: number,
  row: number,
  col: number,
) {
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(col) ||
    row < 0 ||
    col < 0 ||
    row > 7 ||
    col > 7 ||
    !blockShapes[shape] ||
    !blockFits(board, shape, row, col)
  )
    throw new Error("This piece needs an empty space.");
  const next = [...board];
  blockShapes[shape].forEach(
    (offset) =>
      (next[(row + Math.floor(offset / 8)) * 8 + col + (offset % 8)] = 1),
  );
  const rows = Array.from({ length: 8 }, (_, r) => r).filter((r) =>
    next.slice(r * 8, r * 8 + 8).every(Boolean),
  );
  const cols = Array.from({ length: 8 }, (_, c) => c).filter((c) =>
    Array.from({ length: 8 }, (_, r) => next[r * 8 + c]).every(Boolean),
  );
  for (const r of rows) for (let c = 0; c < 8; c++) next[r * 8 + c] = 0;
  for (const c of cols) for (let r = 0; r < 8; r++) next[r * 8 + c] = 0;
  const lines = rows.length + cols.length;
  return {
    board: next,
    points:
      blockShapes[shape].length * 10 +
      lines * 100 +
      Math.max(0, lines - 1) * 50,
    lines,
  };
}
export function previewBlockMatch(duration: number, seed = 32767): BlockMatch {
  return {
    id: crypto.randomUUID(),
    couple_id: "preview",
    duration,
    seed,
    status: "waiting",
    starts_at: null,
    ends_at: null,
    winner: null,
    state: {
      boards: [Array(64).fill(0), Array(64).fill(0)],
      scores: [0, 0],
      hands: [blockHand(seed, 0), blockHand(seed, 0)],
      used: [
        [false, false, false],
        [false, false, false],
      ],
      rounds: [0, 0],
      ready: [false, false],
      stuck: [false, false],
    },
  };
}
export function previewBlockPlace(
  match: BlockMatch,
  slot: number,
  piece: number,
  row: number,
  col: number,
): BlockMatch {
  if (match.state.used[slot][piece])
    throw new Error("That piece was already used.");
  const state = structuredClone(match.state),
    placed = placeBlock(state.boards[slot], state.hands[slot][piece], row, col);
  state.boards[slot] = placed.board;
  state.scores[slot] += placed.points;
  state.used[slot][piece] = true;
  if (state.used[slot].every(Boolean)) {
    state.rounds[slot]++;
    state.hands[slot] = blockHand(match.seed, state.rounds[slot]);
    state.used[slot] = [false, false, false];
  }
  state.stuck[slot] = !hasBlockMove(
    state.boards[slot],
    state.hands[slot],
    state.used[slot],
  );
  return { ...match, state };
}
