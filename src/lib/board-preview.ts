import { boardWinner, type Game } from "./games";
export type BoardKind = "tic" | "connect";
export function previewBoard(kind: BoardKind): Game {
  return {
    id: crypto.randomUUID(),
    kind,
    state: {
      status: "playing",
      turn: 0,
      round: 0,
      scores: [0, 0],
      winner: null,
      board: Array(kind === "tic" ? 9 : 42).fill(0),
    },
  };
}
export function previewMove(game: Game, cell: number): Game {
  if (game.state.status !== "playing" || !Number.isInteger(cell))
    throw new Error("This move is unavailable.");
  const board = [...game.state.board!];
  let index = cell;
  if (game.kind === "connect") {
    if (cell < 0 || cell > 6) throw new Error("Choose a column.");
    index = -1;
    for (let row = 5; row >= 0; row--)
      if (board[row * 7 + cell] === 0) {
        index = row * 7 + cell;
        break;
      }
  }
  if (index < 0 || index >= board.length || board[index] !== 0)
    throw new Error("Choose an empty space.");
  board[index] = game.state.turn + 1;
  const winner = boardWinner(
    board,
    game.kind === "tic" ? 3 : 7,
    game.kind === "tic" ? 3 : 4,
  );
  return {
    ...game,
    state: {
      ...game.state,
      board,
      winner,
      turn: 1 - game.state.turn,
      status:
        winner !== null ? "won" : board.every(Boolean) ? "draw" : "playing",
    },
  };
}
