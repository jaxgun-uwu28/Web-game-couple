export type Stroke = {
  points: number[][];
  color: string;
  game?: string;
  tool?: "brush" | "eraser" | "fill" | "clear" | "undo" | "redo";
  width?: number;
  opacity?: number;
};
export function drawingHistory(events: Stroke[]) {
  const done: Stroke[] = [],
    redo: Stroke[] = [];
  for (const event of events) {
    if (event.tool === "undo") {
      const last = done.pop();
      if (last) redo.push(last);
    } else if (event.tool === "redo") {
      const last = redo.pop();
      if (last) done.push(last);
    } else {
      done.push(event);
      redo.length = 0;
    }
  }
  return { done, redo };
}
export function floodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: string,
  opacity: number,
) {
  x = Math.max(0, Math.min(width - 1, Math.floor(x)));
  y = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const start = (y * width + x) * 4,
    target = Array.from(data.slice(start, start + 4)),
    rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)),
    alpha = Math.max(0, Math.min(1, opacity));
  const next = rgb.map((n, i) =>
    Math.round(n * alpha + target[i] * (1 - alpha)),
  );
  if (next.every((n, i) => n === target[i])) return;
  const seen = new Uint8Array(width * height),
    stack = [y * width + x];
  while (stack.length) {
    const cell = stack.pop()!;
    if (seen[cell]) continue;
    seen[cell] = 1;
    const i = cell * 4;
    if ([0, 1, 2, 3].some((n) => Math.abs(data[i + n] - target[n]) > 12))
      continue;
    for (let n = 0; n < 3; n++) data[i + n] = next[n];
    data[i + 3] = 255;
    const cx = cell % width,
      cy = Math.floor(cell / width);
    if (cx > 0) stack.push(cell - 1);
    if (cx < width - 1) stack.push(cell + 1);
    if (cy > 0) stack.push(cell - width);
    if (cy < height - 1) stack.push(cell + width);
  }
}
export function paintDrawing(ctx: CanvasRenderingContext2D, events: Stroke[]) {
  const { width, height } = ctx.canvas;
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  for (const s of drawingHistory(events).done) {
    if (s.tool === "clear") {
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      continue;
    }
    if (s.tool === "fill") {
      const img = ctx.getImageData(0, 0, width, height);
      floodFill(
        img.data,
        width,
        height,
        s.points[0][0] * width,
        s.points[0][1] * height,
        s.color,
        s.opacity ?? 1,
      );
      ctx.putImageData(img, 0, 0);
      continue;
    }
    ctx.globalAlpha = Math.max(0.05, Math.min(1, s.opacity ?? 1));
    ctx.strokeStyle = s.tool === "eraser" ? "#ffffff" : s.color;
    ctx.lineWidth = Math.max(1, Math.min(40, s.width ?? 4));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    s.points.forEach(([x, y], i) =>
      i ? ctx.lineTo(x * width, y * height) : ctx.moveTo(x * width, y * height),
    );
    if (s.points.length === 1)
      ctx.lineTo(s.points[0][0] * width + 0.1, s.points[0][1] * height + 0.1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
