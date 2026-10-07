import { heartShapes, heartFits } from "./heartblast";
export type HeartGridGeometry = {
  left: number;
  top: number;
  cell: number;
  gap: number;
};
export function getHeartDrag(
  pointer: { x: number; y: number },
  grid: HeartGridGeometry,
  shape: number,
  board: number[],
  snap = true,
) {
  const cells = heartShapes[shape],
    cols = Math.max(...cells.map((o) => o % 8)) + 1,
    rows = Math.max(...cells.map((o) => Math.floor(o / 8))) + 1;
  const step = grid.cell + grid.gap,
    width = cols * step - grid.gap,
    height = rows * step - grid.gap;
  const lift = grid.cell;
  const center = { x: pointer.x, y: pointer.y - lift };
  if (center.y - height / 2 < 8) center.y = pointer.y + lift;
  const edge = 8 * step - grid.gap;
  const inside =
    center.x >= grid.left &&
    center.x <= grid.left + edge &&
    center.y >= grid.top &&
    center.y <= grid.top + edge;
  let row = Math.max(
      0,
      Math.min(8 - rows, Math.round((center.y - height / 2 - grid.top) / step)),
    ),
    col = Math.max(
      0,
      Math.min(8 - cols, Math.round((center.x - width / 2 - grid.left) / step)),
    );
  if (inside && snap && !heartFits(board, shape, row, col)) {
    const candidates = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++)
        if (heartFits(board, shape, row + dr, col + dc))
          candidates.push({
            row: row + dr,
            col: col + dc,
            d: dr * dr + dc * dc,
          });
    candidates.sort((a, b) => a.d - b.d);
    if (candidates[0]) {
      row = candidates[0].row;
      col = candidates[0].col;
    }
  }
  const snapped = { x: grid.left + col * step, y: grid.top + row * step };
  // Keep the visible top-left anchor within half a cell of its landing cell.
  const pull = (value: number, target: number) =>
    target +
    Math.max(
      -grid.cell * 0.3,
      Math.min(grid.cell * 0.3, (value - target) * 0.3),
    );
  return {
    row,
    col,
    inside,
    valid: inside && heartFits(board, shape, row, col),
    width,
    height,
    cell: grid.cell,
    gap: grid.gap,
    lift,
    x: inside ? pull(center.x - width / 2, snapped.x) : center.x - width / 2,
    y: inside ? pull(center.y - height / 2, snapped.y) : center.y - height / 2,
    snapX: snapped.x,
    snapY: snapped.y,
  };
}
