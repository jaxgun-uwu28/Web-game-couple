"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  Check,
  Clock3,
  Layers3,
  Trophy,
  RotateCcw,
  Heart,
} from "lucide-react";
import {
  blockShapes,
  blockShapeNames,
  blockSize,
  blockAnchor,
  blockFits,
  durations,
  previewBlockMatch,
  previewBlockPlace,
  type BlockMatch,
} from "@/lib/block-battle";
import { Slot } from "./ArtSlots";
import { useGamePresence } from "@/lib/use-game-presence";
import { gameRequest } from "@/lib/game-request";
function Piece({ shape }: { shape: number }) {
  const offsets = blockShapes[shape];
  const { width, height } = blockSize(shape);
  return (
    <svg
      viewBox={`0 0 ${width * 20} ${height * 20}`}
      aria-hidden="true"
      className={`piece-shape piece-color-${shape % 3}`}
    >
      {offsets.map((o) => (
        <rect
          key={o}
          x={1 + (o % 8) * 20}
          y={1 + Math.floor(o / 8) * 20}
          width="18"
          height="18"
          rx="2"
        />
      ))}
    </svg>
  );
}
export default function BlockBattle({
  db,
  session,
  coupleId,
  slot,
  names,
  preview,
  back,
  onResult,
  active: pageActive = true,
}: {
  db: SupabaseClient | null;
  session: Session | null;
  coupleId: string | null;
  slot: number;
  names: string[];
  preview: boolean;
  active?: boolean;
  back: () => void;
  onResult: (winner: number | null) => void;
}) {
  const [match, setMatch] = useState<BlockMatch | null>(null),
    [duration, setDuration] = useState(120),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [clock, setClock] = useState(Date.now()),
    [offset, setOffset] = useState(0),
    [piece, setPiece] = useState(0),
    [anchor, setAnchor] = useState([0, 0]),
    [demoSlot, setDemoSlot] = useState(0),
    [notice, setNotice] = useState("");
  const attendance = useGamePresence(
    db,
    match?.id,
    "block",
    !preview && pageActive,
  );
  const boardElement = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    piece: number;
    x: number;
    y: number;
    moved: boolean;
    anchor: number[] | null;
  } | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false),
    [dragInside, setDragInside] = useState(false);
  const [cleared, setCleared] = useState<number[]>([]);
  useEffect(() => {
    if (!cleared.length) return;
    const timer = setTimeout(() => setCleared([]), 550);
    return () => clearTimeout(timer);
  }, [cleared]);
  const lock = useRef(false),
    current = useRef(match),
    finishedId = useRef("");
  current.current = match;
  const seat = preview ? demoSlot : slot,
    opponent = 1 - seat;
  const adopt = useCallback(
    (data: { match: BlockMatch; server_now: string }) => {
      setMatch((previous) =>
        previous?.id === data.match.id &&
        (previous.revision || 0) > (data.match.revision || 0)
          ? previous
          : data.match,
      );
      setOffset(Date.parse(data.server_now) - Date.now());
    },
    [],
  );
  const request = useCallback(
    async (
      id: string | null,
      action: Record<string, unknown> = { type: "get" },
      seconds = 120,
    ) => {
      if (!session) throw new Error("Sign in to battle together.");
      return gameRequest(
        db,
        id
          ? { kind: "block", id, action }
          : { kind: "block", duration: seconds },
      );
    },
    [session, db],
  );
  const refresh = useCallback(async () => {
    if (preview || !current.current) return;
    try {
      adopt(await request(current.current.id));
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Reconnect to see the saved match.",
      );
    }
  }, [preview, request, adopt]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (preview || !db || !session || !coupleId) return;
    let cancelled = false;
    void db
      .from("block_matches")
      .select("id")
      .eq("couple_id", coupleId)
      .in("status", ["waiting", "playing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(
            "Block Battle could not load. Try again.",
          );
          return;
        }
        if (data?.[0]) {
          try {
            const result = await request(data[0].id);
            if (!cancelled) adopt(result);
          } catch (e) {
            if (!cancelled)
              setError(e instanceof Error ? e.message : "Match unavailable.");
          }
        }
      });
    const live = db
      .channel(`block:${coupleId}`, { config: { private: true } })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "block_matches",
          filter: `couple_id=eq.${coupleId}`,
        },
        () => void refresh(),
      )
      .subscribe();
    const timer = setInterval(() => void refresh(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      void db.removeChannel(live);
    };
  }, [db, session, coupleId, preview, refresh, request, adopt]);
  const now = clock + offset,
    start = match?.starts_at ? Date.parse(match.starts_at) : 0,
    end = match?.ends_at ? Date.parse(match.ends_at) : 0;
  const remaining =
    match?.status === "playing"
      ? Math.max(0, Math.ceil((end - now) / 1000))
      : match && ["won", "draw"].includes(match.status)
        ? 0
        : match?.duration || duration;
  const countdown =
    match?.status === "playing"
      ? Math.max(0, Math.ceil((start - now) / 1000))
      : 0;
  useEffect(() => {
    if (!match || match.status !== "playing" || remaining > 0) return;
    if (preview)
      setMatch((m) =>
        m
          ? {
              ...m,
              status: m.state.scores[0] === m.state.scores[1] ? "draw" : "won",
              winner:
                m.state.scores[0] === m.state.scores[1]
                  ? null
                  : m.state.scores[0] > m.state.scores[1]
                    ? 0
                    : 1,
            }
          : m,
      );
    else void refresh();
  }, [match?.id, match?.status, remaining, preview, refresh]);
  useEffect(() => {
    if (
      match &&
      ["won", "draw"].includes(match.status) &&
      finishedId.current !== match.id
    ) {
      finishedId.current = match.id;
      onResult(match.winner);
      navigator.vibrate?.([35, 40, 35]);
    }
  }, [match?.id, match?.status, onResult]);
  useEffect(() => {
    setPiece(match?.state.used[seat].findIndex((v) => !v) ?? 0);
    setAnchor([0, 0]);
  }, [match?.id, match?.state.rounds[seat], seat]);
  async function work(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Try again when connected.");
      if (!preview) void refresh();
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function begin() {
    await work(async () => {
      if (preview) setMatch(previewBlockMatch(duration));
      else adopt(await request(null, {}, duration));
      setNotice("");
    });
  }
  async function ready() {
    await work(async () => {
      if (preview)
        setMatch((m) => {
          if (!m) return m;
          const next = structuredClone(m);
          next.state.ready[seat] = true;
          if (next.state.ready.every(Boolean)) {
            next.status = "playing";
            next.starts_at = new Date(Date.now() + 3000).toISOString();
            next.ends_at = new Date(
              Date.now() + 3000 + next.duration * 1000,
            ).toISOString();
          }
          return next;
        });
      else adopt(await request(match!.id, { type: "ready" }));
    });
  }
  const board = match?.state.boards[seat] || Array(64).fill(0),
    shape = match?.state.hands[seat][piece],
    valid =
      shape !== undefined &&
      !match?.state.used[seat][piece] &&
      blockFits(board, shape, anchor[0], anchor[1]);
  const active =
    (preview || attendance.paired) &&
    match?.status === "playing" &&
    !countdown &&
    remaining > 0 &&
    !match.state.stuck[seat];
  async function place(selected = piece, target = anchor) {
    if (!match || !active || match.state.used[seat][selected]) return;
    const selectedShape = match.state.hands[seat][selected];
    if (!blockFits(board, selectedShape, target[0], target[1])) return;
    await work(async () => {
      const previous = match.state.scores[seat];
      let next: BlockMatch;
      if (preview) {
        next = previewBlockPlace(match, seat, selected, target[0], target[1]);
        if (next.state.stuck.every(Boolean)) {
          next.status =
            next.state.scores[0] === next.state.scores[1] ? "draw" : "won";
          next.winner =
            next.status === "draw"
              ? null
              : next.state.scores[0] > next.state.scores[1]
                ? 0
                : 1;
        }
        setMatch(next);
      } else {
        const data = await request(match.id, {
          type: "place",
          piece: selected,
          row: target[0],
          col: target[1],
          move_id: crypto.randomUUID(),
        });
        adopt(data);
        next = data.match;
      }
      const placedCells = blockShapes[selectedShape].map(
        (o) => (target[0] + Math.floor(o / 8)) * 8 + target[1] + (o % 8),
      );
      const removed = board
        .map((v, i) =>
          (v || placedCells.includes(i)) && !next.state.boards[seat][i]
            ? i
            : -1,
        )
        .filter((i) => i >= 0);
      setCleared(removed);
      setNotice(
        `+${next.state.scores[seat] - previous} points${removed.length ? " · line cleared!" : ""}`,
      );
      const nextPiece = next.state.used[seat].findIndex((v) => !v);
      setPiece(nextPiece);
      if (nextPiece >= 0)
        setAnchor(
          blockAnchor(next.state.hands[seat][nextPiece], target[0], target[1]),
        );
      navigator.vibrate?.(12);
    });
  }
  function aim(row: number, col: number) {
    if (shape !== undefined) setAnchor(blockAnchor(shape, row, col));
  }
  function selectPiece(index: number) {
    setPiece(index);
    setAnchor(
      blockAnchor(match!.state.hands[seat][index], anchor[0], anchor[1]),
    );
  }
  function dragMove(e: React.PointerEvent<HTMLButtonElement>) {
    const held = drag.current,
      grid = boardElement.current;
    if (!held || !grid) return;
    if (Math.hypot(e.clientX - held.x, e.clientY - held.y) < 6 && !held.moved)
      return;
    held.moved = true;
    setDragging(true);
    const first = grid.children[0].getBoundingClientRect(),
      last = grid.children[63].getBoundingClientRect();
    const inside =
      e.clientX >= first.left &&
      e.clientX <= last.right &&
      e.clientY >= first.top &&
      e.clientY <= last.bottom;
    setDragInside(inside);
    if (!inside) {
      held.anchor = null;
      return;
    }
    const selectedShape = match!.state.hands[seat][held.piece],
      size = blockSize(selectedShape);
    held.anchor = blockAnchor(
      selectedShape,
      Math.floor((e.clientY - first.top) / ((last.bottom - first.top) / 8)) -
        Math.floor((size.height - 1) / 2),
      Math.floor((e.clientX - first.left) / ((last.right - first.left) / 8)) -
        Math.floor((size.width - 1) / 2),
    );
    setAnchor(held.anchor);
  }
  function dragEnd() {
    const held = drag.current;
    drag.current = null;
    setDragging(false);
    setDragInside(false);
    if (!held?.moved) return;
    suppressClick.current = true;
    if (
      held.anchor &&
      blockFits(
        board,
        match!.state.hands[seat][held.piece],
        held.anchor[0],
        held.anchor[1],
      )
    )
      void place(held.piece, held.anchor);
    else setNotice("Piece returned to the tray. Drop it on an empty space.");
  }
  const terminal = match && ["won", "draw"].includes(match.status),
    clockLabel = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  return (
    <section className="block-duel">
      <button
        className="text-button"
        onClick={() =>
          void work(async () => {
            if (!preview && match) await attendance.exit();
            back();
          })
        }
      >
        <ArrowLeft size={18} />
        {match && ["waiting", "playing"].includes(match.status)
          ? "Exit game"
          : "Back to Play"}
      </button>
      <div className="page-heading">
        <div>
          <h1>Block Hearts Duel</h1>
          <p>
            {preview
              ? "Local demo · switch players to try both boards."
              : "Two boards. One clock. Your sweetest rivalry."}
          </p>
        </div>
        <Layers3 size={32} />
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {match && !preview && ["waiting", "playing"].includes(match.status) && (
        <p className="notice" role="status">
          {attendance.error ||
            (attendance.paired
              ? "Both players are here."
              : "Waiting for your person to join. Leaving cancels the battle for both players.")}
        </p>
      )}
      {match?.status === "cancelled" && (
        <p className="notice" role="status">
          Battle cancelled. A player left the session.
        </p>
      )}
      {!match || match.status === "cancelled" ? (
        <div className="block-start">
          <Slot
            name="block-battle-cover"
            alt="Block Hearts Duel artwork"
            className="block-cover"
          >
            <div className="block-cover-pieces">
              <Piece shape={5} />
              <Piece shape={9} />
              <Heart size={40} />
            </div>
          </Slot>
          <h2>Make space. Make points.</h2>
          <p>
            Place blocks on your 8 × 8 board. Clear full rows and columns. The
            highest score when the clock ends wins.
          </p>
          <fieldset className="duration-picker">
            <legend>How long shall we battle?</legend>
            {durations.map((d) => (
              <button
                key={d}
                type="button"
                className={duration === d ? "" : "secondary"}
                aria-pressed={duration === d}
                onClick={() => setDuration(d)}
              >
                {d / 60} min
              </button>
            ))}
          </fieldset>
          <button disabled={busy} onClick={() => void begin()}>
            {busy ? "Opening…" : "Create or join battle"}
            <ArrowRight size={18} />
          </button>
          <p className="small">
            Same piece sequence for both players. A shared match starts only
            when both are ready.
          </p>
        </div>
      ) : (
        <>
          <div className="battle-hud">
            <span>
              <Clock3 size={22} />
              <strong>{countdown ? `Go in ${countdown}` : clockLabel}</strong>
            </span>
            <div>
              {names[0]} <b>{match.state.scores[0]}</b>
              <span>vs</span>
              {names[1]} <b>{match.state.scores[1]}</b>
            </div>
          </div>
          {preview && (
            <div className="demo-seats">
              {[0, 1].map((p) => (
                <button
                  key={p}
                  className="secondary"
                  aria-pressed={seat === p}
                  onClick={() => setDemoSlot(p)}
                >
                  Control {names[p]}
                </button>
              ))}
            </div>
          )}
          {match.status === "waiting" ? (
            <div className="block-lobby">
              <h2>Meet at the starting line.</h2>
              <p>
                {match.duration / 60}-minute battle · same pieces, separate
                boards
              </p>
              <div className="ready-list">
                {[0, 1].map((p) => (
                  <p key={p}>
                    <Heart size={18} />
                    {names[p]}
                    <strong>
                      {match.state.ready[p] ? "Ready" : "Not ready yet"}
                    </strong>
                  </p>
                ))}
              </div>
              <button
                disabled={
                  busy ||
                  (!preview && !attendance.paired) ||
                  match.state.ready[seat]
                }
                onClick={() => void ready()}
              >
                <Check size={18} />
                {match.state.ready[seat]
                  ? "Waiting for your person"
                  : "I’m ready"}
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    if (preview) setMatch(null);
                    else adopt(await request(match.id, { type: "cancel" }));
                  })
                }
              >
                Cancel waiting match
              </button>
            </div>
          ) : (
            <>
              <div className="battle-layout">
                <div className="own-block-board">
                  <div className="board-caption">
                    <h2>{names[seat]}’s board</h2>
                    <span role="status">
                      {notice || "Drag a piece onto the board."}
                    </span>
                  </div>
                  <div
                    ref={boardElement}
                    className={`block-grid ${valid ? "valid" : "invalid"}`}
                    role="grid"
                    tabIndex={0}
                    aria-label="Your block board. Arrow keys move the anchor; Enter places the selected piece."
                    aria-activedescendant={`block-cell-${anchor[0] * 8 + anchor[1]}`}
                    onKeyDown={(e) => {
                      if (
                        [
                          "ArrowUp",
                          "ArrowDown",
                          "ArrowLeft",
                          "ArrowRight",
                          "Enter",
                        ].includes(e.key)
                      ) {
                        e.preventDefault();
                        if (e.key === "Enter") void place();
                        else
                          aim(
                            anchor[0] +
                              (e.key === "ArrowDown"
                                ? 1
                                : e.key === "ArrowUp"
                                  ? -1
                                  : 0),
                            anchor[1] +
                              (e.key === "ArrowRight"
                                ? 1
                                : e.key === "ArrowLeft"
                                  ? -1
                                  : 0),
                          );
                      }
                    }}
                    onPointerDown={(e) => {
                      if (!active) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      aim(
                        Math.floor(((e.clientY - rect.top) / rect.height) * 8),
                        Math.floor(((e.clientX - rect.left) / rect.width) * 8),
                      );
                    }}
                  >
                    {board.map((v, i) => {
                      const overlay =
                        active &&
                        (!dragging || dragInside) &&
                        shape !== undefined &&
                        blockShapes[shape].some(
                          (o) =>
                            Math.floor(i / 8) ===
                              anchor[0] + Math.floor(o / 8) &&
                            i % 8 === anchor[1] + (o % 8),
                        );
                      return (
                        <div
                          key={i}
                          id={`block-cell-${i}`}
                          role="gridcell"
                          aria-label={`Row ${Math.floor(i / 8) + 1}, column ${(i % 8) + 1}, ${v ? "filled" : "empty"}`}
                          aria-selected={i === anchor[0] * 8 + anchor[1]}
                          className={`${v ? "filled" : ""} ${overlay ? "aimed" : ""} ${cleared.includes(i) ? "just-cleared" : ""} ${i === anchor[0] * 8 + anchor[1] ? "anchor" : ""}`}
                        />
                      );
                    })}
                  </div>
                  {!terminal && (
                    <>
                      <div
                        className="block-tray"
                        aria-label="Your three pieces"
                      >
                        {match.state.hands[seat].map((s, i) => (
                          <button
                            key={i}
                            disabled={
                              busy || match.state.used[seat][i] || !active
                            }
                            aria-label={`Select piece ${i + 1}: ${blockShapeNames[s]}`}
                            aria-pressed={piece === i}
                            onClick={() => {
                              if (suppressClick.current) {
                                suppressClick.current = false;
                                return;
                              }
                              selectPiece(i);
                            }}
                            onPointerDown={(e) => {
                              if (!active || busy || e.button !== 0) return;
                              suppressClick.current = false;
                              selectPiece(i);
                              drag.current = {
                                piece: i,
                                x: e.clientX,
                                y: e.clientY,
                                moved: false,
                                anchor: null,
                              };
                              e.currentTarget.setPointerCapture(e.pointerId);
                            }}
                            onPointerMove={dragMove}
                            onPointerUp={dragEnd}
                            onPointerCancel={() => {
                              drag.current = null;
                              setDragging(false);
                              setDragInside(false);
                            }}
                          >
                            <Piece shape={s} />
                            <span>
                              {match.state.used[seat][i]
                                ? "Placed"
                                : `Piece ${i + 1}`}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="block-controls">
                        <div className="aim-pad">
                          {[
                            [ArrowLeft, 0, -1, "left"],
                            [ArrowUp, -1, 0, "up"],
                            [ArrowDown, 1, 0, "down"],
                            [ArrowRight, 0, 1, "right"],
                          ].map(([Icon, dr, dc, label]) => {
                            const Glyph = Icon as typeof ArrowLeft;
                            return (
                              <button
                                key={String(label)}
                                className="secondary"
                                disabled={!active || busy}
                                aria-label={`Move anchor ${label}`}
                                onClick={() =>
                                  aim(
                                    anchor[0] + Number(dr),
                                    anchor[1] + Number(dc),
                                  )
                                }
                              >
                                <Glyph size={18} />
                              </button>
                            );
                          })}
                        </div>
                        <button
                          disabled={!active || busy || !valid}
                          onClick={() => void place()}
                        >
                          Place piece
                          <Check size={18} />
                        </button>
                      </div>
                      <p className="small" role="status" aria-live="polite">
                        {countdown
                          ? "Both boards unlock after the countdown."
                          : match.state.stuck[seat]
                            ? "No pieces fit. Your score is locked while your person finishes."
                            : `Drag and release to place, or tap a piece and use the controls. Aim: row ${anchor[0] + 1}, column ${anchor[1] + 1}. ${valid ? "Piece fits. Press Enter or choose Place piece." : "Blocked here. Choose another anchor or piece."}`}
                      </p>
                    </>
                  )}
                </div>
                <aside className="opponent-block">
                  <h2>{names[opponent]}</h2>
                  <strong>
                    {match.state.scores[opponent]}
                    <small>points</small>
                  </strong>
                  <div
                    className="mini-block-grid"
                    aria-label="Partner board preview"
                  >
                    {match.state.boards[opponent].map((v, i) => (
                      <i key={i} className={v ? "filled" : ""} />
                    ))}
                  </div>
                  <p>
                    {match.state.stuck[opponent]
                      ? "Board full · score locked"
                      : "Their board updates live."}
                  </p>
                  <div className="block-rules">
                    <h3>Sweet little rules</h3>
                    <p>
                      10 points per block.
                      <br />
                      100 per cleared line.
                      <br />
                      50 extra per additional line cleared together.
                    </p>
                    <p>
                      Use all three pieces for a fresh tray. Pieces cannot
                      rotate.
                    </p>
                  </div>
                </aside>
              </div>
              {terminal && (
                <div className="game-result">
                  <div className="win-confetti" aria-hidden="true">
                    {Array.from({ length: 12 }, (_, i) => (
                      <i
                        key={i}
                        style={{
                          left: `${5 + i * 8}%`,
                          animationDelay: `${(i % 4) * 0.12}s`,
                        }}
                      />
                    ))}
                  </div>
                  <Trophy size={30} />
                  <h2>
                    {match.winner === null
                      ? "A perfect tie."
                      : `${names[match.winner]} wins the battle!`}
                  </h2>
                  <p>
                    {match.state.scores[0]} – {match.state.scores[1]} points ·{" "}
                    {preview
                      ? "local demo result"
                      : "saved to your couple scoreboard"}
                  </p>
                  <button disabled={busy} onClick={() => void begin()}>
                    <RotateCcw size={18} />
                    Battle again
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
