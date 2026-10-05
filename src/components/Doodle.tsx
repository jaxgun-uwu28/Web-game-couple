"use client";
import { useEffect, useRef, useState } from "react";
import { Pencil, RotateCcw } from "lucide-react";
export type Stroke = { points: number[][]; color: string; game?: string };
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
  const ref = useRef<HTMLCanvasElement>(null),
    points = useRef<number[][]>([]),
    savePending = useRef(false);
  const [color, setColor] = useState("#9d304f"),
    [saving, setSaving] = useState(false),
    [local, setLocal] = useState<Stroke[]>([]);
  const paint = (stroke: Stroke) => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    stroke.points.forEach(([x, y], i) =>
      i ? ctx.lineTo(x * 900, y * 550) : ctx.moveTo(x * 900, y * 550),
    );
    if (stroke.points.length === 1) {
      ctx.lineTo(stroke.points[0][0] * 900 + 1, stroke.points[0][1] * 550 + 1);
    }
    ctx.stroke();
  };
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    ctx?.clearRect(0, 0, 900, 550);
    strokes.forEach(paint);
  }, [strokes]);
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    ];
  };
  const end = async () => {
    if (!points.current.length) return;
    const stroke = { points: points.current, color };
    points.current = [];
    savePending.current = true;
    setSaving(true);
    try {
      await onStroke(stroke);
      setLocal((x) => [...x, stroke]);
    } catch {
      const ctx = ref.current?.getContext("2d");
      ctx?.clearRect(0, 0, 900, 550);
      strokes.forEach(paint);
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  };
  return (
    <div className="drawing">
      <div className="draw-tools">
        <span>
          <Pencil size={16} />{" "}
          {saving || busy ? "Saving your mark…" : mode === "finished" ? "The finished drawing" : mode === "viewing" ? "Watch the sketch come to life" : "Leave a little mark"}
        </span>
        {!disabled && (
          <div className="ink-pots">
            {["#9d304f", "#50313f", "#765b94", "#a05b32"].map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use ${{ "#9d304f": "cherry", "#50313f": "plum", "#765b94": "lavender", "#a05b32": "brown" }[c]} ink`}
                aria-pressed={color === c}
                style={{ color: c }}
                onClick={() => setColor(c)}
              >
                <i style={{ background: c }} />
              </button>
            ))}
          </div>
        )}
      </div>
      <canvas
        ref={ref}
        width={900}
        height={550}
        aria-label={
          mode === "finished" ? "Finished drawing" : mode === "viewing"
            ? "Live drawing from your partner"
            : "Shared drawing canvas. Use touch, mouse or pen."
        }
        onPointerDown={(e) => {
          if (disabled || savePending.current) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          points.current = [point(e)];
          paint({ points: points.current, color });
        }}
        onPointerMove={(e) => {
          if (
            disabled || savePending.current ||
            !points.current.length ||
            points.current.length >= 500
          )
            return;
          const previous = points.current.at(-1)!;
          const next = point(e);
          points.current.push(next);
          paint({ points: [previous, next], color });
        }}
        onPointerUp={() => {
          void end();
        }}
        onPointerCancel={() => {
          void end();
        }}
      />
      <p className="small">
        {saving || busy ? "Your mark is saving. Please wait before drawing again." : mode === "finished" ? "This drawing is complete." : mode === "viewing"
          ? "Your partner is holding the pencil."
          : "Drawing uses a pointer or touch. You can also leave a written note in the jar."}{" "}
        {local.length > 0 && `${local.length} marks made this visit.`}
      </p>
      <span className="sr-only">
        <RotateCcw />
        Drawing supports touch or a pointer. Switch to the notes jar for a text
        alternative.
      </span>
    </div>
  );
}
