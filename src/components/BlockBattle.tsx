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
  blockFits,
  durations,
  previewBlockMatch,
  previewBlockPlace,
  type BlockMatch,
} from "@/lib/block-battle";
import { Slot } from "./ArtSlots";
function Piece({ shape }: { shape: number }) {
  const offsets = blockShapes[shape];
  return (
    <svg viewBox="0 0 100 80" aria-hidden="true">
      {offsets.map((o) => (
        <rect
          key={o}
          x={10 + (o % 8) * 19}
          y={6 + Math.floor(o / 8) * 19}
          width="16"
          height="16"
          rx="4"
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
}: {
  db: SupabaseClient | null;
  session: Session | null;
  coupleId: string | null;
  slot: number;
  names: string[];
  preview: boolean;
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
      const response = await fetch("/api/game", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(
          id
            ? { kind: "block", id, action }
            : { kind: "block", duration: seconds },
        ),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.includes("function")
            ? "Run the Block Battle database update before playing online."
            : data.error || "The match could not connect.",
        );
      return data;
    },
    [session],
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
            "Block Battle needs migration 004 in your Supabase SQL Editor.",
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
    match?.status === "playing" &&
    !countdown &&
    remaining > 0 &&
    !match.state.stuck[seat];
  async function place() {
    if (!match || !active || !valid) return;
    await work(async () => {
      const previous = match.state.scores[seat];
      let next: BlockMatch;
      if (preview) {
        next = previewBlockPlace(match, seat, piece, anchor[0], anchor[1]);
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
          piece,
          row: anchor[0],
          col: anchor[1],
          move_id: crypto.randomUUID(),
        });
        adopt(data);
        next = data.match;
      }
      setNotice(`+${next.state.scores[seat] - previous} points`);
      setPiece(next.state.used[seat].findIndex((v) => !v));
      navigator.vibrate?.(12);
    });
  }
  function aim(row: number, col: number) {
    setAnchor([Math.max(0, Math.min(7, row)), Math.max(0, Math.min(7, col))]);
  }
  const terminal = match && ["won", "draw"].includes(match.status),
    clockLabel = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  return (
    <section className="block-duel">
      <button className="text-button" onClick={back}>
        <ArrowLeft size={18} />
        Back to Play
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
                disabled={busy || match.state.ready[seat]}
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
                      {notice || "Choose a piece, aim, then place."}
                    </span>
                  </div>
                  <div
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
                          className={`${v ? "filled" : ""} ${overlay ? "aimed" : ""} ${i === anchor[0] * 8 + anchor[1] ? "anchor" : ""}`}
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
                            onClick={() => setPiece(i)}
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
                            : `Aim: row ${anchor[0] + 1}, column ${anchor[1] + 1}. ${valid ? "Piece fits. Press Enter or choose Place piece." : "Blocked here. Choose another anchor or piece."}`}
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
