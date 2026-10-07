"use client";
import { playGameSound } from "@/lib/game-feel";
import { readAudio, saveAudio, tactile } from "@/lib/music";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Heart, Volume2, VolumeX, Check, Eye } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Slot } from "./ArtSlots";
import { useGameMusic, useSoundPreference } from "./MusicControls";
import { gameRequest } from "@/lib/game-request";
import { useGamePresence } from "@/lib/use-game-presence";
import {
  heartShapes,
  heartFits,
  fitsAnywhere,
  firstHeartPlacement,
  heartPlace,
  heartStep,
  heartRunFinished,
  heartReplayPending,
  heartWinner,
  initialHeartState,
  defaultHeartOptions,
  type HeartOptions,
  type HeartState,
} from "@/lib/heartblast";
type Match = {
  id: string;
  seed: number;
  duration: number;
  status: "waiting" | "playing" | "won" | "draw" | "cancelled";
  starts_at: string | null;
  ends_at: string | null;
  winner: number | null;
  revision?: number;
  state: HeartState;
};
const colors = ["#F3A8C4", "#CDE5D0", "#F8DCC4", "#EAE1F5", "#F7E6A6"];
function Piece({ shape }: { shape: number }) {
  const cells = heartShapes[shape] || [0],
    w = Math.max(...cells.map((o) => o % 8)) + 1,
    h = Math.max(...cells.map((o) => Math.floor(o / 8))) + 1;
  return (
    <div
      className="heart-piece"
      aria-hidden="true"
      style={{
        gridTemplateColumns: `repeat(${w}, 1fr)`,
        aspectRatio: `${w}/${h}`,
        width: `calc(${w} * var(--hb-piece-cell, 10px) + ${w - 1} * 2px)`,
        height: `calc(${h} * var(--hb-piece-cell, 10px) + ${h - 1} * 2px)`,
      }}
    >
      {Array.from({ length: w * h }, (_, i) => {
        const o = Math.floor(i / w) * 8 + (i % w);
        return (
          <span
            key={i}
            className={
              cells.includes(o)
                ? `hb-tile hb-style-${(shape % 5) + 1}`
                : "hb-piece-space"
            }
          ></span>
        );
      })}
    </div>
  );
}
function MiniBoard({ board }: { board: number[] }) {
  return (
    <div className="mini-block-grid">
      {board.map((v, i) => (
        <i
          key={i}
          className={v ? `filled hb-tile hb-style-${v > 0 ? v : 6}` : ""}
        />
      ))}
    </div>
  );
}
export default function BlockBattle({
  db,
  session,
  coupleId,
  slot,
  names,
  preview,
  active: pageActive = true,
  back,
  onResult,
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
  const [options, setOptions] = useState<HeartOptions>(defaultHeartOptions),
    [peerSeen, setPeerSeen] = useState<string | null>(null),
    [match, setMatch] = useState<Match | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [clock, setClock] = useState(Date.now()),
    [offset, setOffset] = useState(0),
    [seatDemo, setSeatDemo] = useState(0),
    [piece, setPiece] = useState(0),
    [anchor, setAnchor] = useState([0, 0]),
    [sound, setSound] = useState(false),
    [best, setBest] = useState(0),
    [sharedBest, setSharedBest] = useState(0),
    [peer, setPeer] = useState<{
      id: string;
      board: number[];
      score: number;
    } | null>(null),
    [popup, setPopup] = useState(""),
    [cleared, setCleared] = useState<number[]>([]),
    [placedCells, setPlacedCells] = useState<number[]>([]),
    [opponentOpen, setOpponentOpen] = useState(false),
    [drag, setDrag] = useState<{
      x: number;
      y: number;
      inside: boolean;
    } | null>(null);
  const grid = useRef<HTMLDivElement>(null),
    held = useRef<{
      piece: number;
      x: number;
      y: number;
      moved: boolean;
      anchor: number[] | null;
    } | null>(null),
    lock = useRef(false),
    current = useRef(match),
    soundCtx = useRef<AudioContext | null>(null),
    lastPopup = useRef(""),
    seenResult = useRef(""),
    broadcast = useRef<ReturnType<SupabaseClient["channel"]> | null>(null),
    lastBroadcast = useRef(0),
    pendingMoves = useRef<
      { piece: number; row: number; col: number; move_id: string }[]
    >([]),
    syncingMoves = useRef(false);
  const dailyRequested = useRef(false);
  current.current = match;
  const opts = match?.state.options || options,
    asyncMode = opts.mode === "endless" || opts.mode === "daily",
    actor = preview ? seatDemo : slot,
    seat = opts.coop ? 0 : actor,
    other = 1 - actor;
  const presence = useGamePresence(
    db,
    match?.id,
    "block",
    !preview && pageActive && !asyncMode,
    false,
  );
  const request = useCallback(
    async (
      id: string | null,
      action: Record<string, unknown> = { type: "get" },
      config: HeartOptions = defaultHeartOptions,
    ) => {
      const before = Date.now();
      const r = await gameRequest(
        db,
        id
          ? { kind: "block", heartblast: true, id, action }
          : { kind: "block", heartblast: true, config },
      );
      return { ...r, clientMid: (before + Date.now()) / 2 };
    },
    [db],
  );
  const adopt = useCallback(
    (r: {
      match: Match;
      server_now: string;
      clientMid?: number;
      challenge?: { host: string; status: string } | null;
      peer_seen_at?: string | null;
    }) => {
      if (syncingMoves.current) return;
      setPeerSeen(r.peer_seen_at || null);
      setMatch((old) =>
        old?.id === r.match.id && (old.revision || 0) > (r.match.revision || 0)
          ? old
          : r.match,
      );
      if (r.clientMid) setOffset(Date.parse(r.server_now) - r.clientMid);
    },
    [],
  );
  const work = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    if (localStorage.getItem("arcade-open-daily")) {
      dailyRequested.current = true;
      setOptions({ ...defaultHeartOptions, mode: "daily" });
      localStorage.removeItem("arcade-open-daily");
    }
    setBest(Number(localStorage.getItem("arcade-heart-best") || 0));
    setSound(readAudio().sounds);
    const t = setInterval(() => setClock(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (preview || !db || !coupleId) return;
    let live = true;
    if (!dailyRequested.current)
      void db
        .from("block_matches")
        .select("*")
        .eq("couple_id", coupleId)
        .not("state->options", "is", null)
        .neq("state->options->>mode", "daily")
        .in("status", ["waiting", "playing"])
        .order("created_at", { ascending: false })
        .limit(1)
        .then(({ data }) => {
          if (live && data?.[0])
            void request(data[0].id)
              .then((r) => {
                if (live) adopt(r);
              })
              .catch(() => {});
        });
    const refresh = () => {
      if (
        !pageActive ||
        !current.current ||
        syncingMoves.current ||
        lock.current
      )
        return;
      void request(current.current.id)
        .then((r) => {
          if (live) adopt(r);
        })
        .catch(() => {
          if (live) setError("The battle could not reconnect. Try again.");
        });
    };
    const channel = db
      .channel(`block:${coupleId}`, { config: { private: true } })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "block_matches",
          filter: `couple_id=eq.${coupleId}`,
        },
        refresh,
      )
      .on("broadcast", { event: "heart-preview" }, ({ payload }) => {
        if (
          payload.match === current.current?.id &&
          payload.seat !== slot &&
          Array.isArray(payload.board) &&
          payload.board.length === 64 &&
          payload.board.every(
            (v: unknown) =>
              typeof v === "number" && Number.isInteger(v) && v >= -1 && v <= 5,
          ) &&
          Number.isFinite(payload.score)
        )
          setPeer({
            id: payload.match,
            board: payload.board,
            score: payload.score,
          });
      })
      .subscribe();
    broadcast.current = channel;
    const t = setInterval(refresh, 2000);
    void db
      .from("block_matches")
      .select("state")
      .eq("couple_id", coupleId)
      .in("status", ["won", "draw"])
      .limit(500)
      .then(({ data }) => {
        if (live) {
          setSharedBest(
            Math.max(
              0,
              ...(data || [])
                .filter((r) => r.state.options?.coop)
                .map((r) => r.state.scores[0] || 0),
            ),
          );
          setBest(
            Math.max(
              0,
              ...(data || [])
                .filter((r) => !r.state.options?.coop)
                .map((r) => r.state.scores[slot] || 0),
            ),
          );
        }
      });
    return () => {
      live = false;
      clearInterval(t);
      broadcast.current = null;
      void db.removeChannel(channel);
    };
  }, [db, coupleId, preview, pageActive, slot, request, adopt]);
  const now = clock + offset,
    start = match?.starts_at ? Date.parse(match.starts_at) : 0,
    end = match?.ends_at ? Date.parse(match.ends_at) : 0,
    remaining =
      opts.mode === "timed" ? Math.max(0, Math.ceil((end - now) / 1000)) : 0,
    countdown =
      match?.status === "playing"
        ? Math.max(0, Math.ceil((start - now) / 1000))
        : 0,
    dailyFinished = !!match && heartRunFinished(match.state, actor),
    dailyWaiting = dailyFinished && !["won", "draw"].includes(match!.status),
    terminal =
      !!match && (["won", "draw"].includes(match.status) || dailyFinished),
    board = match?.state.boards[seat] || Array(64).fill(0),
    shape = match?.state.hands[seat][piece],
    used = match?.state.used[seat] || [false, false, false],
    valid =
      shape !== undefined &&
      !used[piece] &&
      heartFits(board, shape, anchor[0], anchor[1]),
    playing =
      match?.status === "playing" &&
      !countdown &&
      !terminal &&
      !match.state.stuck[seat] &&
      (asyncMode || preview || presence.paired) &&
      (opts.mode !== "timed" || remaining > 0) &&
      (!opts.coop || match.state.turn === actor) &&
      (opts.mode !== "endless" || match.state.ready[actor]);
  useSoundPreference(setSound);
  useGameMusic("block", pageActive && match?.status === "playing" && !terminal);
  const projected =
    playing && valid
      ? heartPlace(
          board,
          shape,
          anchor[0],
          anchor[1],
          match?.state.combos[seat],
        )
      : null;
  useEffect(() => {
    if (shape === undefined || used[piece] || held.current?.moved) return;
    const open = firstHeartPlacement(board, shape);
    if (open) setAnchor(open);
  }, [match?.id, shape, piece, match?.state.rounds[seat]]);
  useEffect(() => {
    if (
      !match ||
      match.status !== "playing" ||
      opts.mode !== "timed" ||
      now <= end + 1000
    )
      return;
    if (preview) {
      const winner = heartWinner(match.state);
      setMatch({ ...match, status: winner === null ? "draw" : "won", winner });
    } else
      void request(match.id, { type: "finish" })
        .then(adopt)
        .catch(() => {});
  }, [
    match?.id,
    match?.status,
    remaining,
    now,
    end,
    preview,
    opts.mode,
    request,
    adopt,
  ]);
  useEffect(() => {
    if (
      !match ||
      !["won", "draw"].includes(match.status) ||
      seenResult.current === match.id
    )
      return;
    seenResult.current = match.id;
    onResult(match.winner);
    const n = Math.max(opts.coop ? sharedBest : best, match.state.scores[seat]);
    if (opts.coop) setSharedBest(n);
    else setBest(n);
    localStorage.setItem(
      opts.coop ? "arcade-heart-shared-best" : "arcade-heart-best",
      String(n),
    );
  }, [match?.id, match?.status, terminal]);
  useEffect(() => {
    if (!match) return;
    setPiece(match.state.used[seat].findIndex((v) => !v));
    setAnchor([0, 0]);
  }, [match?.id, match?.state.rounds[seat], seat]);
  useEffect(() => {
    const last = match?.state.last,
      key = match ? `${match.id}:${match.state.pieces[seat]}` : "";
    if (!last || last.seat !== seat || key === lastPopup.current) return;
    lastPopup.current = key;
    setCleared(last.cleared);
    setPopup(
      `+${last.points}${last.combo >= 4 ? " Perfect!" : last.combo >= 3 ? " Delicious!" : last.combo >= 2 ? " Sweet!" : ""}`,
    );
    const t = setTimeout(() => {
      setCleared([]);
      setPopup("");
    }, 1500);
    return () => clearTimeout(t);
  }, [match?.state.pieces[seat], match?.id, seat]);
  async function feedback(lines: number, combo: number) {
    if (readAudio().haptics && Capacitor.isNativePlatform()) {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({
        style:
          combo > 1
            ? ImpactStyle.Heavy
            : lines
              ? ImpactStyle.Medium
              : ImpactStyle.Light,
      }).catch(() => {});
    } else if (readAudio().haptics)
      navigator.vibrate?.(combo > 1 ? [20, 30, 40] : lines ? 30 : 10);
    if (!sound || !readAudio().sounds || !lines) return;
    playGameSound(
      lines >= 3 ? "win-fanfare" : lines === 2 ? "coin-win" : "chip-stack",
    );
  }
  async function begin(config = options) {
    await work(async () => {
      if (preview) {
        const seed =
          config.mode === "daily"
            ? Math.floor(Date.now() / 86400000) + 100000
            : 32767;
        setMatch({
          id: crypto.randomUUID(),
          seed,
          duration: config.seconds,
          status: config.mode === "daily" ? "playing" : "waiting",
          starts_at: config.mode === "daily" ? new Date().toISOString() : null,
          ends_at:
            config.mode === "daily"
              ? new Date(Date.now() + 86400000).toISOString()
              : null,
          winner: null,
          state: initialHeartState(seed, config),
        });
      } else {
        const r = await request(null, {}, config);
        adopt(r);
      }
    });
  }
  async function ready() {
    await work(async () => {
      if (preview) {
        const m = structuredClone(match!);
        m.state.ready[actor] = true;
        if (
          !m.starts_at &&
          (opts.mode === "endless" || m.state.ready.every(Boolean))
        ) {
          m.status = "playing";
          m.starts_at = new Date(Date.now() + 3000).toISOString();
          m.ends_at =
            opts.mode === "timed"
              ? new Date(Date.now() + 3000 + opts.seconds * 1000).toISOString()
              : null;
        }
        setMatch(m);
      } else adopt(await request(match!.id, { type: "ready" }));
    });
  }
  async function place(p = piece, target = anchor) {
    const base = current.current;
    if (
      !playing ||
      lock.current ||
      !base ||
      (opts.coop && base.state.turn !== actor) ||
      base.state.used[seat][p] ||
      !heartFits(
        base.state.boards[seat],
        base.state.hands[seat][p],
        target[0],
        target[1],
      )
    )
      return;
    const state = heartStep(
      base.state,
      base.seed,
      actor,
      p,
      target[0],
      target[1],
    );
    const projected: Match = { ...base, state };
    if (
      preview &&
      ((opts.mode === "race" && state.scores[seat] >= opts.target) ||
        (opts.coop && state.stuck[0]) ||
        (opts.mode !== "timed" && state.stuck.every(Boolean)))
    ) {
      projected.winner =
        opts.mode === "race" && !opts.coop ? actor : heartWinner(state);
      projected.status = projected.winner === null ? "draw" : "won";
    }
    current.current = projected;
    setMatch(projected);
    setError("");
    setPiece(
      Math.max(
        0,
        state.used[seat].findIndex((v) => !v),
      ),
    );
    setPlacedCells(
      heartShapes[base.state.hands[seat][p]].map(
        (o) => (target[0] + Math.floor(o / 8)) * 8 + target[1] + (o % 8),
      ),
    );
    setTimeout(() => setPlacedCells([]), 180);
    void feedback(state.last?.lines || 0, state.last?.combo || 0).catch(
      () => {},
    );
    if (preview) return;
    pendingMoves.current.push({
      piece: p,
      row: target[0],
      col: target[1],
      move_id: crypto.randomUUID(),
    });
    if (syncingMoves.current) return;
    syncingMoves.current = true;
    let accepted = base;
    try {
      while (pendingMoves.current.length) {
        const move = pendingMoves.current[0];
        const r = await request(base.id, { type: "place", ...move });
        accepted = r.match;
        pendingMoves.current.shift();
        if (accepted.status !== "playing") pendingMoves.current = [];
        const visible = {
          ...accepted,
          state: heartReplayPending(
            accepted.state,
            accepted.seed,
            actor,
            pendingMoves.current,
          ),
        };
        current.current = visible;
        setMatch(visible);
        if (r.clientMid) setOffset(Date.parse(r.server_now) - r.clientMid);
        if (broadcast.current && Date.now() - lastBroadcast.current > 500) {
          lastBroadcast.current = Date.now();
          void broadcast.current.send({
            type: "broadcast",
            event: "heart-preview",
            payload: {
              match: accepted.id,
              seat: actor,
              board: accepted.state.boards[seat],
              score: accepted.state.scores[seat],
            },
          });
        }
      }
    } catch (e) {
      pendingMoves.current = [];
      try {
        accepted = (await request(base.id)).match;
      } catch {
        /* Keep last accepted state if reconnect fails. */
      }
      current.current = accepted;
      setMatch(accepted);
      setPiece(
        Math.max(
          0,
          accepted.state.used[seat].findIndex((v) => !v),
        ),
      );
      setError(
        e instanceof Error ? e.message : "Move could not sync. Try again.",
      );
    } finally {
      syncingMoves.current = false;
    }
  }
  function aim(r: number, c: number, p = piece) {
    const s = match?.state.hands[seat][p];
    if (s === undefined) return;
    const cells = heartShapes[s],
      w = Math.max(...cells.map((o) => o % 8)) + 1,
      h = Math.max(...cells.map((o) => Math.floor(o / 8))) + 1;
    setAnchor([
      Math.max(0, Math.min(8 - h, r)),
      Math.max(0, Math.min(8 - w, c)),
    ]);
  }
  function moveDrag(e: React.PointerEvent) {
    const h = held.current;
    if (!h || !grid.current) return;
    if (!h.moved && Math.hypot(e.clientX - h.x, e.clientY - h.y) < 6) return;
    h.moved = true;
    const first = grid.current.children[0].getBoundingClientRect(),
      last = grid.current.children[63].getBoundingClientRect(),
      y = e.clientY - 60,
      inside =
        e.clientX >= first.left &&
        e.clientX <= last.right &&
        y >= first.top &&
        y <= last.bottom;
    setDrag({ x: e.clientX, y, inside });
    if (!inside) {
      h.anchor = null;
      return;
    }
    const s = match!.state.hands[seat][h.piece],
      cells = heartShapes[s],
      w = Math.max(...cells.map((o) => o % 8)) + 1,
      hh = Math.max(...cells.map((o) => Math.floor(o / 8))) + 1;
    h.anchor = [
      Math.max(
        0,
        Math.min(
          8 - hh,
          Math.floor((y - first.top) / ((last.bottom - first.top) / 8)) -
            Math.floor(hh / 2),
        ),
      ),
      Math.max(
        0,
        Math.min(
          8 - w,
          Math.floor(
            (e.clientX - first.left) / ((last.right - first.left) / 8),
          ) - Math.floor(w / 2),
        ),
      ),
    ];
    setAnchor(h.anchor);
  }
  function endDrag() {
    const h = held.current;
    held.current = null;
    setDrag(null);
    if (h?.moved && h.anchor) void place(h.piece, h.anchor);
  }
  const clockLabel = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  return (
    <section
      className={`block-duel heart-duel ${match?.status === "playing" ? "is-playing" : ""}`}
    >
      <Slot
        name="heartblast-background"
        alt=""
        className="heart-duel-background"
      >
        <span />
      </Slot>
      <div className="station-top">
        <button
          className="text-button"
          disabled={busy}
          onClick={() =>
            void work(async () => {
              if (!preview && match) await presence.exit();
              back();
            })
          }
        >
          <ArrowLeft size={18} />
          {match && !terminal && match.status !== "cancelled"
            ? "Exit game"
            : "Back to Play"}
        </button>
        <button
          className="icon-button"
          aria-label={sound ? "Mute game sounds" : "Enable game sounds"}
          onClick={() => {
            setSound(!sound);
            saveAudio({ ...readAudio(), sounds: !sound });
            localStorage.setItem("arcade-heart-sound", String(!sound));
          }}
        >
          {sound ? <Volume2 /> : <VolumeX />}
        </button>
      </div>
      <div className="page-heading">
        <h1>Block Hearts Duel</h1>
        <Heart />
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {!match || match.status === "cancelled" ? (
        <div className="block-start">
          <Slot
            name="heartblast-cover"
            alt="Block Hearts Duel artwork"
            className="block-cover"
          >
            <div className="block-cover-pieces">
              <Piece shape={5} />
              <Piece shape={9} />
              <Heart size={40} />
            </div>
          </Slot>
          <fieldset className="heart-mode">
            <legend>Mode</legend>
            {(
              [
                ["timed", "Timed Score Attack"],
                ["endless", "Endless Duel"],
                ["race", "Race"],
                ["daily", "Daily Challenge"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                className={options.mode === mode ? "" : "secondary"}
                aria-pressed={options.mode === mode}
                onClick={() =>
                  setOptions({
                    ...options,
                    mode,
                    coop: mode === "daily" ? false : options.coop,
                  })
                }
              >
                {label}
              </button>
            ))}
          </fieldset>
          {options.mode === "timed" && (
            <fieldset className="duration-picker">
              <legend>Time</legend>
              {[60, 120, 180, 300, 600].map((seconds) => (
                <button
                  key={seconds}
                  className={options.seconds === seconds ? "" : "secondary"}
                  aria-pressed={options.seconds === seconds}
                  onClick={() => setOptions({ ...options, seconds })}
                >
                  {seconds / 60} min
                </button>
              ))}
              <label>
                Custom · {Math.floor(options.seconds / 60)}:
                {String(options.seconds % 60).padStart(2, "0")}
                <input
                  type="range"
                  min="30"
                  max="1800"
                  step="30"
                  value={options.seconds}
                  onChange={(e) =>
                    setOptions({ ...options, seconds: Number(e.target.value) })
                  }
                />
              </label>
            </fieldset>
          )}
          {options.mode === "race" && (
            <fieldset className="duration-picker">
              <legend>Target score</legend>
              {[500, 1000, 2000].map((target) => (
                <button
                  key={target}
                  aria-pressed={options.target === target}
                  className={options.target === target ? "" : "secondary"}
                  onClick={() => setOptions({ ...options, target })}
                >
                  {target}
                </button>
              ))}
            </fieldset>
          )}
          {options.mode !== "daily" && (
            <div className="heart-toggles">
              {(
                [
                  ["coop", "Co-op Mode"],
                  ["junk", "Versus Junk"],
                  ["preview", "Show Opponent Preview"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={options[key]}
                    disabled={key === "junk" && options.coop}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        [key]: e.target.checked,
                        ...(key === "coop" && e.target.checked
                          ? { junk: false }
                          : {}),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
          <button disabled={busy} onClick={() => void begin()}>
            {busy
              ? "Opening…"
              : options.mode === "daily"
                ? "Play today"
                : "Create or join room"}
          </button>
        </div>
      ) : (
        <>
          <div className="battle-hud">
            <div className="heart-clock">
              {opts.mode === "timed" ? (
                <>
                  <svg viewBox="0 0 48 48" aria-hidden="true">
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      fill="none"
                      stroke="var(--line)"
                      strokeWidth="4"
                    />
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      fill="none"
                      stroke="var(--cherry)"
                      strokeWidth="4"
                      strokeDasharray={`${126 * Math.min(1, remaining / match.duration)} 126`}
                      transform="rotate(-90 24 24)"
                    />
                  </svg>
                  <strong>{countdown ? countdown : clockLabel}</strong>
                </>
              ) : (
                <strong>
                  {countdown
                    ? countdown
                    : opts.mode === "race"
                      ? `Race to ${opts.target}`
                      : opts.mode === "daily"
                        ? "Daily Challenge"
                        : "Endless Duel"}
                </strong>
              )}
            </div>
            <div>
              {opts.coop ? "Together" : names[actor]}{" "}
              <b>{match.state.scores[seat]}</b>
              {!opts.coop && (!asyncMode || terminal) && (
                <>
                  {names[other]} <b>{match.state.scores[other]}</b>
                </>
              )}
            </div>
            <span>
              {opts.coop ? "Shared record" : "Best"}{" "}
              {opts.coop ? sharedBest : best}
            </span>
          </div>
          {preview && (
            <div className="demo-seats">
              {names.map((n, i) => (
                <button
                  className="secondary"
                  key={i}
                  aria-pressed={actor === i}
                  onClick={() => setSeatDemo(i)}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          {match.status === "waiting" ||
          (opts.mode === "endless" && !match.state.ready[actor]) ? (
            <div className="block-lobby">
              <h2>Ready?</h2>
              <div className="ready-list">
                {names.map((n, i) => (
                  <p key={i}>
                    {n}
                    <strong>
                      {match.state.ready[i] ? "Ready" : "Not ready yet"}
                    </strong>
                  </p>
                ))}
              </div>
              <button
                disabled={
                  busy ||
                  (!preview && !asyncMode && !presence.paired) ||
                  match.state.ready[actor]
                }
                onClick={() => void ready()}
              >
                <Check />
                {match.state.ready[actor] ? "Waiting" : "I’m ready"}
              </button>
            </div>
          ) : (
            <>
              <div
                className="heart-combo"
                role="meter"
                aria-label="Combo multiplier"
                aria-valuemin={1}
                aria-valuemax={3}
                aria-valuenow={Math.min(
                  3,
                  1 + Math.max(0, match.state.combos[seat] - 1) * 0.5,
                )}
              >
                <i
                  style={{
                    width: `${Math.min(100, Math.max(0, match.state.combos[seat] - 1) * 25)}%`,
                  }}
                  aria-hidden="true"
                />
                <span>
                  Combo ×
                  {Math.min(
                    3,
                    1 + Math.max(0, match.state.combos[seat] - 1) * 0.5,
                  )}
                </span>
              </div>
              {!asyncMode && !preview && !presence.paired && !terminal && (
                <p role="status" className="notice">
                  {peerSeen
                    ? `Reconnecting · ${Math.max(0, 60 - Math.floor((clock + offset - Date.parse(peerSeen)) / 1000))}s grace`
                    : "Waiting for Partner."}
                  {match.status === "playing" &&
                    peerSeen &&
                    clock + offset - Date.parse(peerSeen) >= 60000 && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void work(async () =>
                            adopt(await request(match.id, { type: "claim" })),
                          )
                        }
                      >
                        Claim win
                      </button>
                    )}
                </p>
              )}
              <div className="battle-layout">
                <div className="own-block-board">
                  <h2 className="hb-board-chip">
                    {opts.coop
                      ? `Our board · ${names[match.state.turn]}’s turn`
                      : "Your board"}
                  </h2>
                  <div className="heart-board-wrap">
                    <Slot
                      name="heartblast-board-background"
                      alt=""
                      className="heart-board-background"
                    >
                      <span />
                    </Slot>
                    <div
                      ref={grid}
                      className={`block-grid ${valid ? "valid" : "invalid"}`}
                      role="grid"
                      tabIndex={0}
                      aria-label="Block board. Select a piece with 1, 2 or 3. Arrow keys aim; Enter places."
                      aria-activedescendant={`heart-cell-${anchor[0] * 8 + anchor[1]}`}
                      onKeyDown={(e) => {
                        if (["1", "2", "3"].includes(e.key)) {
                          e.preventDefault();
                          setPiece(Number(e.key) - 1);
                        }
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void place();
                        }
                        if (e.key.startsWith("Arrow")) {
                          e.preventDefault();
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
                    >
                      {board.map((v, i) => {
                        const r = Math.floor(i / 8),
                          c = i % 8,
                          ghost =
                            playing &&
                            !used[piece] &&
                            (drag ? true : valid) &&
                            (!drag || drag.inside) &&
                            shape !== undefined &&
                            heartShapes[shape].some(
                              (o) =>
                                r === anchor[0] + Math.floor(o / 8) &&
                                c === anchor[1] + (o % 8),
                            ),
                          line =
                            projected &&
                            (projected.rows.includes(r) ||
                              projected.cols.includes(c));
                        return (
                          <button
                            key={i}
                            id={`heart-cell-${i}`}
                            role="gridcell"
                            tabIndex={-1}
                            aria-label={`Row ${r + 1}, column ${c + 1}, ${v === -1 ? "sleepy cloud" : v ? "filled" : "empty"}`}
                            className={`${v ? `filled hb-tile hb-style-${v > 0 ? v : 6}` : ""} ${(Math.floor(r / 2) + Math.floor(c / 2)) % 2 ? "empty-alt" : ""} ${ghost ? `ghost hb-style-${((shape ?? 0) % 5) + 1}` : ""} ${line ? "will-clear" : ""} ${cleared.includes(i) ? "burst" : ""} ${placedCells.includes(i) ? "just-placed" : ""}`}
                            onClick={() => void place(piece, [r, c])}
                            disabled={!playing || busy}
                          >
                            {ghost && <span className="hb-ghost-tile" />}
                          </button>
                        );
                      })}
                    </div>
                    {popup && (
                      <div className="heart-score-popup" role="status">
                        {popup}
                      </div>
                    )}
                    {!!cleared.length && (
                      <div className="heart-particles" aria-hidden="true">
                        {cleared.flatMap((cell) =>
                          [0, 1].map((n) => (
                            <i
                              key={`${cell}-${n}`}
                              style={
                                {
                                  left: `${((cell % 8) + 0.5) * 12.5}%`,
                                  top: `${(Math.floor(cell / 8) + 0.5) * 12.5}%`,
                                  background: colors[cell % 5],
                                  "--dx": `${(n ? 1 : -1) * (20 + (cell % 20))}px`,
                                  "--dy": `${-30 - (cell % 40)}px`,
                                } as React.CSSProperties
                              }
                            />
                          )),
                        )}
                      </div>
                    )}
                  </div>
                  {!terminal && (
                    <>
                      <div className="block-tray">
                        {match.state.hands[seat].map((s, i) => (
                          <button
                            key={`${match.state.rounds[seat]}-${i}`}
                            className={`block-piece ${piece === i ? "selected" : ""} ${!fitsAnywhere(board, s) ? "no-room" : ""}`}
                            disabled={!playing || busy || used[i]}
                            aria-pressed={piece === i}
                            aria-label={`Piece ${i + 1}: ${heartShapes[s].length} blocks`}
                            onClick={() => {
                              setPiece(i);
                              const open = firstHeartPlacement(board, s);
                              if (open) setAnchor(open);
                            }}
                            onPointerDown={(e) => {
                              setPiece(i);
                              e.currentTarget.setPointerCapture(e.pointerId);
                              held.current = {
                                piece: i,
                                x: e.clientX,
                                y: e.clientY,
                                moved: false,
                                anchor: null,
                              };
                            }}
                            onPointerMove={moveDrag}
                            onPointerUp={endDrag}
                            onPointerCancel={() => {
                              held.current = null;
                              setDrag(null);
                            }}
                          >
                            <Piece shape={s} />
                            {!used[i] && !fitsAnywhere(board, s) && (
                              <small>No room</small>
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="block-controls">
                        <button
                          disabled={!playing || busy || !valid}
                          onClick={() => void place()}
                        >
                          Place piece
                        </button>
                        {asyncMode && (
                          <button
                            className="secondary"
                            disabled={busy || match.state.stuck[seat]}
                            onClick={() =>
                              void work(async () => {
                                if (preview) {
                                  const m = structuredClone(match);
                                  m.state.stuck[seat] = true;
                                  if (m.state.stuck.every(Boolean)) {
                                    m.winner = heartWinner(m.state);
                                    m.status =
                                      m.winner === null ? "draw" : "won";
                                  }
                                  setMatch(m);
                                } else
                                  adopt(
                                    await request(match.id, {
                                      type: "out",
                                      move_id: crypto.randomUUID(),
                                    }),
                                  );
                              })
                            }
                          >
                            Finish my run
                          </button>
                        )}
                      </div>
                      {match.state.stuck[seat] && (
                        <p role="status">
                          Your score is locked
                          {!terminal ? ". Waiting for the finish." : "."}
                        </p>
                      )}
                    </>
                  )}
                </div>
                {opts.preview &&
                  !opts.coop &&
                  !dailyWaiting &&
                  (!asyncMode || terminal) && (
                    <aside
                      className="opponent-block"
                      aria-label="Opponent preview"
                      data-expanded={opponentOpen}
                    >
                      <button
                        className="hb-opponent-toggle"
                        aria-label={
                          opponentOpen
                            ? "Hide opponent board"
                            : "Show opponent board"
                        }
                        aria-expanded={opponentOpen}
                        onClick={() => setOpponentOpen(!opponentOpen)}
                      >
                        <Eye size={16} />
                      </button>
                      <h2>{names[other]}</h2>
                      <strong>
                        {!terminal && peer?.id === match.id
                          ? peer.score
                          : match.state.scores[other]}
                      </strong>
                      <MiniBoard
                        board={
                          !terminal && peer?.id === match.id
                            ? peer.board
                            : match.state.boards[other]
                        }
                      />
                    </aside>
                  )}
              </div>
              {terminal && (
                <div className="block-result">
                  <h2>
                    {dailyWaiting
                      ? "Daily run complete"
                      : opts.coop
                        ? "Our shared score"
                        : match.winner === null
                          ? "A perfect match!"
                          : `${names[match.winner]} wins!`}
                  </h2>
                  <div className="heart-final-boards">
                    {(dailyWaiting ? [seat] : opts.coop ? [0] : [0, 1]).map(
                      (p) => (
                        <div key={p}>
                          <h3>
                            {opts.coop ? "Together" : names[p]} ·{" "}
                            {match.state.scores[p]}
                          </h3>
                          <MiniBoard board={match.state.boards[p]} />
                          <p>{match.state.pieces[p]} pieces</p>
                          <dl>
                            <dt>Placement</dt>
                            <dd>{match.state.breakdown[p][0]}</dd>
                            <dt>Line clears</dt>
                            <dd>{match.state.breakdown[p][1]}</dd>
                            <dt>Clear-board bonus</dt>
                            <dd>{match.state.breakdown[p][2]}</dd>
                          </dl>
                        </div>
                      ),
                    )}
                  </div>
                  {dailyWaiting && (
                    <p role="status">
                      Your run has ended. The comparison appears when Partner
                      finishes.
                    </p>
                  )}
                  <button
                    disabled={busy}
                    onClick={() =>
                      opts.mode === "daily" ? back() : void begin({ ...opts })
                    }
                  >
                    {opts.mode === "daily" ? "Done" : "Rematch"}
                  </button>
                </div>
              )}
            </>
          )}
          {terminal &&
            !dailyWaiting &&
            (opts.coop || match.winner === actor || match.winner === null) && (
              <div className="wheel-confetti" aria-hidden="true">
                {Array.from({ length: 30 }, (_, i) => (
                  <i
                    key={i}
                    style={{
                      left: `${(i * 37) % 100}%`,
                      background: colors[i % 5],
                      animationDelay: `${(i % 8) * 0.06}s`,
                    }}
                  />
                ))}
              </div>
            )}
        </>
      )}
      {drag && shape !== undefined && (
        <div className="heart-drag" style={{ left: drag.x, top: drag.y }}>
          <Piece shape={shape} />
        </div>
      )}
    </section>
  );
}
