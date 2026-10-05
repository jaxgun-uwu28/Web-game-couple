import rules from "./heartblast-rules.json";
export const heartShapes = rules.shapes;
export type HeartMode = "timed" | "endless" | "race" | "daily";
export type HeartOptions = {
  mode: HeartMode;
  seconds: number;
  target: number;
  coop: boolean;
  junk: boolean;
  preview: boolean;
  day?: string;
};
export const defaultHeartOptions: HeartOptions = {
  mode: "timed",
  seconds: 120,
  target: 500,
  coop: false,
  junk: false,
  preview: true,
};
export function heartHand(seed: number, tray: number, board?: number[]) {
  const n = (i: number) => ((seed + tray * 31 + i * 17) * 48271) % 2147483647;
  const hand = [
    rules.smallShapes[n(0) % rules.smallShapes.length],
    n(1) % heartShapes.length,
    n(2) % heartShapes.length,
  ];
  if (board && !hand.some((s) => fitsAnywhere(board, s))) hand[0] = 0;
  return hand;
}
export function heartFits(
  board: number[],
  shape: number,
  row: number,
  col: number,
) {
  return (
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    col >= 0 &&
    !!heartShapes[shape] &&
    heartShapes[shape].every(
      (o) =>
        row + Math.floor(o / 8) < 8 &&
        col + (o % 8) < 8 &&
        board[(row + Math.floor(o / 8)) * 8 + col + (o % 8)] === 0,
    )
  );
}
export function fitsAnywhere(board: number[], shape: number) {
  return board.some((_, i) =>
    heartFits(board, shape, Math.floor(i / 8), i % 8),
  );
}
export function heartScore(
  cells: number,
  lines: number,
  previousCombo: number,
  empty: boolean,
) {
  const combo = lines ? previousCombo + 1 : 0,
    multiplier = Math.min(
      rules.scoring.comboCap,
      1 + Math.max(0, combo - 1) * rules.scoring.comboStep,
    ),
    placement = cells * rules.scoring.cell,
    clear = lines
      ? Math.floor(rules.scoring.line * lines * lines * multiplier)
      : 0,
    bonus = empty ? rules.scoring.emptyBonus : 0;
  return {
    combo,
    multiplier,
    placement,
    clear,
    bonus,
    points: placement + clear + bonus,
  };
}
export function heartPlace(
  board: number[],
  shape: number,
  row: number,
  col: number,
  combo = 0,
) {
  if (!heartFits(board, shape, row, col))
    throw new Error("That piece needs an empty space.");
  const next = [...board];
  heartShapes[shape].forEach(
    (o) =>
      (next[(row + Math.floor(o / 8)) * 8 + col + (o % 8)] = (shape % 5) + 1),
  );
  const rows = Array.from({ length: 8 }, (_, r) => r).filter((r) =>
      next.slice(r * 8, r * 8 + 8).every(Boolean),
    ),
    cols = Array.from({ length: 8 }, (_, c) => c).filter((c) =>
      Array.from({ length: 8 }, (_, r) => next[r * 8 + c]).every(Boolean),
    ),
    cleared: number[] = [];
  next.forEach((v, i) => {
    const r = Math.floor(i / 8),
      c = i % 8;
    if (
      rows.includes(r) ||
      cols.includes(c) ||
      (v === -1 &&
        (rows.some((x) => Math.abs(x - r) <= 1) ||
          cols.some((x) => Math.abs(x - c) <= 1)))
    ) {
      next[i] = 0;
      cleared.push(i);
    }
  });
  return {
    board: next,
    rows,
    cols,
    cleared,
    ...heartScore(
      heartShapes[shape].length,
      rows.length + cols.length,
      combo,
      next.every((v) => v === 0),
    ),
  };
}
export type HeartState = {
  boards: number[][];
  scores: number[];
  hands: number[][];
  used: boolean[][];
  rounds: number[];
  ready: boolean[];
  stuck: boolean[];
  combos: number[];
  pieces: number[];
  breakdown: number[][];
  turn: number;
  options: HeartOptions;
  last?: ReturnType<typeof heartScore> & {
    lines: number;
    cleared: number[];
    seat: number;
  };
};
export function initialHeartState(
  seed: number,
  options: HeartOptions,
): HeartState {
  return {
    boards: [Array(64).fill(0), Array(64).fill(0)],
    scores: [0, 0],
    hands: [heartHand(seed, 0), heartHand(seed, 0)],
    used: [
      [false, false, false],
      [false, false, false],
    ],
    rounds: [0, 0],
    ready: options.mode === "daily" ? [true, true] : [false, false],
    stuck: [false, false],
    combos: [0, 0],
    pieces: [0, 0],
    breakdown: [
      [0, 0, 0],
      [0, 0, 0],
    ],
    turn: 0,
    options,
  };
}
export function heartWinner(s: HeartState) {
  if (s.options.coop) return null;
  if (s.scores[0] !== s.scores[1]) return s.scores[0] > s.scores[1] ? 0 : 1;
  if (s.pieces[0] !== s.pieces[1]) return s.pieces[0] < s.pieces[1] ? 0 : 1;
  return null;
}
export function heartStep(
  input: HeartState,
  seed: number,
  actor: number,
  piece: number,
  row: number,
  col: number,
) {
  const s = structuredClone(input),
    seat = s.options.coop ? 0 : actor;
  if (s.options.coop && actor !== s.turn)
    throw new Error("Wait for your turn.");
  if (s.stuck[seat] || s.used[seat][piece])
    throw new Error("That piece is unavailable.");
  const placed = heartPlace(
    s.boards[seat],
    s.hands[seat][piece],
    row,
    col,
    s.combos[seat],
  );
  s.boards[seat] = placed.board;
  s.scores[seat] += placed.points;
  s.combos[seat] = placed.combo;
  s.pieces[seat]++;
  s.breakdown[seat] = s.breakdown[seat].map(
    (n, i) => n + [placed.placement, placed.clear, placed.bonus][i],
  );
  s.used[seat][piece] = true;
  if (s.used[seat].every(Boolean)) {
    s.rounds[seat]++;
    s.hands[seat] = heartHand(
      seed,
      s.rounds[seat],
      s.options.coop || s.options.mode === "daily" ? s.boards[seat] : undefined,
    );
    s.used[seat] = [false, false, false];
  }
  s.stuck[seat] = !s.hands[seat].some(
    (shape, i) => !s.used[seat][i] && fitsAnywhere(s.boards[seat], shape),
  );
  s.turn = 1 - actor;
  if(placed.rows.length+placed.cols.length>=2&&s.options.junk&&!s.options.coop&&s.options.mode!=="daily"){
    const other=1-actor;let b=[...s.boards[other]];
    for(let count=1;count<=Math.min(placed.rows.length+placed.cols.length,2)&&b.filter(v=>v===-1).length<4;count++){
      for(let r=0;r<64;r++){const index=(seed+s.pieces[seat]*17+count*13+r)%64;if(b[index]!==0)continue;const candidate=[...b];candidate[index]=-1;if(s.hands[other].some((shape,i)=>!s.used[other][i]&&fitsAnywhere(candidate,shape))){b=candidate;break;}}
    }
    s.boards[other]=b;
  }
  s.last = { ...placed, lines: placed.rows.length + placed.cols.length, seat };
  return s;
}
