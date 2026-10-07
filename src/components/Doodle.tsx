"use client";
import { useEffect, useRef, useState } from "react";
import {
  Pencil,
  Eraser,
  PaintBucket,
  Undo2,
  Redo2,
  Trash2,
} from "lucide-react";
import { drawingHistory, paintDrawing, type Stroke } from "@/lib/drawing";
export type { Stroke } from "@/lib/drawing";
const colors = [
  ["Red", "#e53935"],
  ["Orange", "#f57c00"],
  ["Yellow", "#fdd835"],
  ["Green", "#43a047"],
  ["Blue", "#1e88e5"],
  ["Indigo", "#3949ab"],
  ["Violet", "#8e24aa"],
  ["White", "#ffffff"],
  ["Black", "#000000"],
];
export default function Doodle({
  strokes,
  onStroke,
  disabled = false,
  busy = false,
  mode = disabled ? "viewing" : "drawing",
}: {
  strokes: Stroke[];
  onStroke: (s: Stroke) => Promise<void>;
  disabled?: boolean;
  busy?: boolean;
  mode?: "drawing" | "viewing" | "finished";
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    points = useRef<number[][]>([]),
    pending = useRef(false),
    latest = useRef(strokes);
  latest.current = strokes;
  const [color, setColor] = useState("#e53935"),
    [tool, setTool] = useState<"brush" | "eraser" | "fill">("brush"),
    [width, setWidth] = useState(4),
    [opacity, setOpacity] = useState(1),
    [saving, setSaving] = useState(false);
  const render = (events: Stroke[]) => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx) paintDrawing(ctx, events);
  };
  useEffect(() => render(strokes), [strokes]);
  const current = (): Stroke => ({
    points: points.current,
    color,
    tool,
    width,
    opacity,
  });
  const save = async (s: Stroke) => {
    if (pending.current || disabled) return;
    pending.current = true;
    setSaving(true);
    try {
      await onStroke(s);
    } catch {
      render(latest.current);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  const command = (tool: "clear" | "undo" | "redo") =>
    void save({ tool, points: [[0, 0]], color });
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    ];
  };
  const end = () => {
    if (!points.current.length) return;
    const s = current();
    points.current = [];
    void save(s);
  };
  const history = drawingHistory(strokes),
    locked = disabled || saving || busy;
  return (
    <div className="drawing">
      {mode === "drawing" && (
        <div className="drawing-controls">
          <div
            className="drawing-actions"
            role="group"
            aria-label="Drawing tools"
          >
            {(
              [
                ["brush", "Brush", Pencil],
                ["eraser", "Eraser", Eraser],
                ["fill", "Paint bucket", PaintBucket],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                aria-label={label}
                aria-pressed={tool === value}
                disabled={locked}
                onClick={() => setTool(value)}
              >
                <Icon size={19} />
                <span>{label}</span>
              </button>
            ))}
            <button
              aria-label="Undo"
              disabled={locked || !history.done.length}
              onClick={() => command("undo")}
            >
              <Undo2 size={19} />
            </button>
            <button
              aria-label="Redo"
              disabled={locked || !history.redo.length}
              onClick={() => command("redo")}
            >
              <Redo2 size={19} />
            </button>
            <button
              aria-label="Clear drawing"
              disabled={locked || !history.done.length}
              onClick={() => command("clear")}
            >
              <Trash2 size={19} />
            </button>
          </div>
          <div className="ink-pots" role="group" aria-label="Colors">
            {colors.map(([label, value]) => (
              <button
                key={value}
                aria-label={`${label} ink`}
                aria-pressed={color === value}
                disabled={locked}
                onClick={() => setColor(value)}
              >
                <i style={{ background: value }} />
              </button>
            ))}
          </div>
          <div className="drawing-sliders">
            <label>
              Brush size <output>{width}</output>
              <input
                aria-label="Brush size"
                type="range"
                min="1"
                max="40"
                value={width}
                disabled={locked}
                onChange={(e) => setWidth(+e.target.value)}
              />
            </label>
            <label>
              Opacity <output>{Math.round(opacity * 100)}%</output>
              <input
                aria-label="Opacity"
                type="range"
                min="5"
                max="100"
                value={opacity * 100}
                disabled={locked}
                onChange={(e) => setOpacity(+e.target.value / 100)}
              />
            </label>
          </div>
        </div>
      )}
      <canvas
        ref={canvas}
        width={900}
        height={550}
        aria-label={
          mode === "drawing" ? "Shared drawing canvas" : "Partner drawing"
        }
        onPointerDown={(e) => {
          if (locked) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          points.current = [point(e)];
          render([...latest.current, current()]);
          if (tool === "fill") end();
        }}
        onPointerMove={(e) => {
          if (
            locked ||
            !points.current.length ||
            tool === "fill" ||
            points.current.length >= 500
          )
            return;
          points.current.push(point(e));
          render([...latest.current, current()]);
        }}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <p className="small" role="status">
        {saving || busy
          ? "Saving…"
          : mode === "viewing"
            ? "Your partner is drawing."
            : mode === "finished"
              ? "The finished drawing"
              : "Draw with your finger, mouse or pen."}
      </p>
    </div>
  );
}
