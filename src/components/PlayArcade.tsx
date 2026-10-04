"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowDown,
  ArrowRight,
  Circle,
  Heart,
  X,
  Trophy,
  Volume2,
  VolumeX,
  RotateCcw,
  Wifi,
  Gamepad2,
  Sparkles,
} from "lucide-react";
import { type Game, registry } from "@/lib/games";
import { previewBoard, previewMove, type BoardKind } from "@/lib/board-preview";
import { Slot } from "./ArtSlots";

export default function PlayArcade({
  db,
  session,
  coupleId,
  slot,
  names,
  preview,
}: {
  db: SupabaseClient | null;
  session: Session | null;
  coupleId: string | null;
  slot: number;
  names: string[];
  preview: boolean;
}) {
  const [games, setGames] = useState<Game[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [start, setStart] = useState<BoardKind | null>(null),
    [score, setScore] = useState<number[]>([0, 0]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sound, setSound] = useState(false),
    [connection, setConnection] = useState("Connecting…"),
    [online, setOnline] = useState<string[]>([]);
  const locked = useRef(false),
    channel = useRef<ReturnType<SupabaseClient["channel"]> | null>(null),
    audio = useRef<AudioContext | null>(null);
  const game = games.find((g) => g.id === selected),
    finished = game && game.state.status !== "playing";
  const refresh = useCallback(async () => {
    if (!db || !session || preview || !coupleId) return;
    const [g, s] = await Promise.all([
      db
        .from("games")
        .select("*")
        .eq("couple_id", coupleId)
        .in("kind", ["tic", "connect"])
        .order("created_at", { ascending: false })
        .limit(100),
      db.rpc("scoreboard"),
    ]);
    if (g.error || s.error) {
      setError("Saved games could not load. Check your connection and retry.");
      return;
    }
    setGames(g.data as Game[]);
    setScore(s.data);
    setError("");
  }, [db, session, coupleId, preview]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!db || !session || !coupleId || preview) return;
    let canceled = false;
    const live = db.channel(`couple:${coupleId}`, {
      config: { private: true, presence: { key: session.user.id } },
    });
    channel.current = live;
    live
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `couple_id=eq.${coupleId}`,
        },
        () => void refresh(),
      )
      .on("broadcast", { event: "move" }, () => void refresh())
      .on("presence", { event: "sync" }, () =>
        setOnline(Object.keys(live.presenceState())),
      );
    void db.realtime.setAuth(session.access_token).then(() => {
      if (canceled) return;
      live.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnection("Live together");
          void live.track({ here: true });
          void refresh();
        } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status))
          setConnection("Reconnecting · checking saved games");
      });
    });
    return () => {
      canceled = true;
      channel.current = null;
      void db.removeChannel(live);
    };
  }, [db, session, coupleId, preview, refresh]);
  useEffect(() => {
    const back = () => {
      setSelected(null);
      setStart(null);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  function tactile(win = false) {
    navigator.vibrate?.(win ? [35, 50, 35] : 12);
    if (!sound) return;
    try {
      const ctx = (audio.current ??= new AudioContext());
      void ctx.resume();
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(win ? 660 : 440, ctx.currentTime);
      gain.gain.setValueAtTime(0.035, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.12);
    } catch {
      /* Sound is optional. */
    }
  }
  async function request(kind: BoardKind, id?: string, cell?: number) {
    if (!session) throw new Error("Sign in to play together.");
    const response = await fetch("/api/game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(id ? { id, action: { cell } } : { kind }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Your move could not save.");
    return data as Game;
  }
  async function work(task: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Try again when connected.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function open(kind: BoardKind) {
    window.history.pushState({ arcadeGame: true }, "");
    setStart(kind);
    setSelected(null);
    setError("");
  }
  async function begin(kind: BoardKind) {
    await work(async () => {
      const next = preview
        ? games.find((g) => g.kind === kind && g.state.status === "playing") ||
          previewBoard(kind)
        : await request(kind);
      setGames((gs) => [next, ...gs.filter((g) => g.id !== next.id)]);
      setSelected(next.id);
      setStart(null);
      tactile();
    });
  }
  async function move(cell: number) {
    if (!game) return;
    await work(async () => {
      const next = preview
        ? previewMove(game, cell)
        : await request(game.kind as BoardKind, game.id, cell);
      setGames((gs) => gs.map((g) => (g.id === next.id ? next : g)));
      if (preview && next.state.status === "won")
        setScore((s) => s.map((n, i) => n + (i === next.state.winner ? 1 : 0)));
      tactile(next.state.status !== "playing");
      if (!preview) {
        void refresh();
        void channel.current?.send({
          type: "broadcast",
          event: "move",
          payload: { id: next.id },
        });
      }
    });
  }
  const kind = (game?.kind as BoardKind) || start,
    definition = registry.find((g) => g.id === kind),
    yourTurn = preview || game?.state.turn === slot;
  const scoreboard = (
    <section className="rivalry" aria-label="Couple scoreboard">
      <div>
        <Trophy size={23} />
        <span>
          Our friendly rivalry
          <small>
            {preview ? "Local session wins" : "All-time wins · both accounts"}
          </small>
        </span>
      </div>
      <p>
        <span>
          {names[0]}
          <strong>{score[0]}</strong>
        </span>
        <b>vs</b>
        <span>
          {names[1]}
          <strong>{score[1]}</strong>
        </span>
      </p>
    </section>
  );
  return (
    <div className="play-arcade">
      <div className="page-heading">
        <div>
          <h1>
            {game || start
              ? "A little friendly competition."
              : "Meet me at the arcade."}
          </h1>
          <p>
            {preview
              ? "Pass-and-play on this device · no online data saved."
              : `${connection}${online.length > 1 ? " · your person is here" : " · waiting for your person"}`}
          </p>
        </div>
        <Gamepad2 size={32} />
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button className="secondary" onClick={() => void refresh()}>
            Retry connection
          </button>
        </div>
      )}
      {scoreboard}
      {!game && !start ? (
        <>
          <div className="cartridge-shelf">
            {registry
              .filter((g) => g.id === "tic" || g.id === "connect")
              .map((g) => (
                <button
                  key={g.id}
                  className={`cartridge ${g.id}`}
                  onClick={() => open(g.id as BoardKind)}
                >
                  <div className="cartridge-art">
                    <Slot
                      name={
                        g.id === "tic" ? "tictactoe-cover" : "connect4-cover"
                      }
                      alt={`${g.name} cover`}
                    >
                      <div className={`cartridge-symbols ${g.id}`}>
                        {g.id === "tic" ? (
                          <>
                            <X />
                            <Circle />
                            <X />
                          </>
                        ) : (
                          <>
                            <Heart />
                            <X />
                            <Heart />
                            <X />
                          </>
                        )}
                      </div>
                    </Slot>
                  </div>
                  <div className="cartridge-label">
                    <h2>{g.name}</h2>
                    <p>{g.note}</p>
                    <span>
                      {games.some(
                        (x) => x.kind === g.id && x.state.status === "playing",
                      )
                        ? "Continue our game"
                        : "Let’s play"}{" "}
                      <ArrowRight size={20} />
                    </span>
                  </div>
                </button>
              ))}
          </div>
          <p className="arcade-later">
            <Sparkles size={18} /> Drawing, knowing each other and trivia join
            in a later stage.
          </p>
        </>
      ) : (
        <section className={`board-station ${kind}`}>
          <div className="station-top">
            <button
              className="text-button"
              onClick={() => window.history.back()}
            >
              <ArrowLeft size={18} /> Back to Play
            </button>
            <button
              className="icon-button"
              aria-label={sound ? "Turn game sound off" : "Turn game sound on"}
              aria-pressed={sound}
              onClick={() => setSound(!sound)}
            >
              {sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
          </div>
          <h2>{definition?.name}</h2>
          {!game ? (
            <div className="game-start">
              <div className="start-tokens">
                <X size={64} />
                {kind === "tic" ? <Circle size={64} /> : <Heart size={64} />}
              </div>
              <p>
                {kind === "tic"
                  ? "Three in a row. Nine little chances to outsmart your favorite person."
                  : "Drop a token. Think one move ahead. Four in a row wins."}
              </p>
              <div className="player-key">
                <span>
                  <X />
                  {names[0]}
                </span>
                <span>
                  {kind === "tic" ? <Circle /> : <Heart />}
                  {names[1]}
                </span>
              </div>
              <button disabled={busy} onClick={() => void begin(kind)}>
                {busy
                  ? "Opening…"
                  : games.some(
                        (g) => g.kind === kind && g.state.status === "playing",
                      )
                    ? "Continue game"
                    : "Start our game"}
                <ArrowRight size={19} />
              </button>
              <p className="small">
                {preview
                  ? "Take turns sharing this screen."
                  : "Both players open the same game to join. Moves save before the turn changes."}
              </p>
            </div>
          ) : (
            <>
              <div className="game-hud" role="status" aria-live="polite">
                <span>
                  {finished ? (
                    <Trophy size={20} />
                  ) : game.state.turn === 0 ? (
                    <X size={20} />
                  ) : kind === "tic" ? (
                    <Circle size={20} />
                  ) : (
                    <Heart size={20} />
                  )}
                </span>
                <div>
                  <strong>
                    {finished
                      ? game.state.winner === null
                        ? "A love-love draw."
                        : `${names[game.state.winner]} wins!`
                      : `${names[game.state.turn]}’s turn`}
                  </strong>
                  <small>
                    {finished
                      ? "Same team, even when we compete."
                      : preview
                        ? "Pass the screen after your move."
                        : yourTurn
                          ? "Your move. Make it a good one."
                          : "Waiting for your person’s move."}
                  </small>
                </div>
                <span>
                  {(game.state.board || []).filter(Boolean).length}/
                  {kind === "tic" ? 9 : 42}
                </span>
              </div>
              <div className={`romantic-board ${kind}`}>
                <Slot
                  name="board-background"
                  alt="Custom board artwork"
                  className="board-art"
                >
                  <></>
                </Slot>
                {kind === "connect" && (
                  <div className="drop-controls">
                    {Array.from({ length: 7 }, (_, i) => (
                      <button
                        key={i}
                        aria-label={`Drop into column ${i + 1}`}
                        disabled={
                          busy ||
                          finished ||
                          !yourTurn ||
                          game.state.board![i] !== 0
                        }
                        onClick={() => void move(i)}
                      >
                        <ArrowDown size={18} />
                        <span>{i + 1}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="romantic-cells">
                  {game.state.board!.map((v, i) => {
                    const label = `Row ${Math.floor(i / (kind === "tic" ? 3 : 7)) + 1}, column ${(i % (kind === "tic" ? 3 : 7)) + 1}: ${v ? names[v - 1] : "empty"}`;
                    const piece = v ? (
                      <Slot
                        name={v === 1 ? "piece-cross" : "piece-circle"}
                        alt={
                          v === 1
                            ? "Cross token"
                            : kind === "tic"
                              ? "Ring token"
                              : "Heart token"
                        }
                        className="token-art"
                      >
                        {v === 1 ? (
                          <X />
                        ) : kind === "tic" ? (
                          <Circle />
                        ) : (
                          <Heart />
                        )}
                      </Slot>
                    ) : null;
                    return kind === "tic" ? (
                      <button
                        className={`romantic-cell token-${v}`}
                        key={i}
                        aria-label={label}
                        disabled={busy || finished || !yourTurn || v !== 0}
                        onClick={() => void move(i)}
                      >
                        {piece}
                      </button>
                    ) : (
                      <span
                        className={`romantic-cell token-${v}`}
                        key={i}
                        role="img"
                        aria-label={label}
                      >
                        {piece}
                      </span>
                    );
                  })}
                </div>
              </div>
              {finished ? (
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
                  <Heart size={27} />
                  <h3>
                    {game.state.winner === null
                      ? "A perfect excuse for a rematch."
                      : "One win. Two happy hearts."}
                  </h3>
                  <p>
                    {preview
                      ? "Added to this session’s scoreboard."
                      : "Saved to your couple scoreboard."}
                  </p>
                  <button disabled={busy} onClick={() => void begin(kind)}>
                    <RotateCcw size={18} />
                    Play again
                  </button>
                </div>
              ) : (
                <p className="board-rule">
                  {kind === "tic"
                    ? "Connect three crosses or rings in a row."
                    : "Connect four tokens horizontally, vertically or diagonally."}{" "}
                  <span>
                    {preview ? (
                      "Device-local game"
                    ) : (
                      <>
                        <Wifi size={14} /> Server-validated moves
                      </>
                    )}
                  </span>
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
