export function winningCells(board: number[], columns: number, length: number) {
  const result = new Set<number>(),
    rows = board.length / columns;
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < columns; col++) {
      const value = board[row * columns + col];
      if (!value) continue;
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1],
      ]) {
        const cells = Array.from(
          { length },
          (_, i) => (row + i * dr) * columns + col + i * dc,
        );
        if (
          row + (length - 1) * dr >= rows ||
          col + (length - 1) * dc < 0 ||
          col + (length - 1) * dc >= columns
        )
          continue;
        if (cells.every((i) => board[i] === value))
          cells.forEach((i) => result.add(i));
      }
    }
  return result;
}
