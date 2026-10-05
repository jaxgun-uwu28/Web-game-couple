"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Heart,
  Pencil,
  Brain,
  Volume2,
  VolumeX,
  RefreshCw,
} from "lucide-react";
import { type Game, type GameKind, registry } from "@/lib/games";
import {
  extraMove,
  startExtraPreview,
  updateExtraPreview,
} from "@/lib/extra-games";
import { recordPreview } from "@/lib/preview-progress";
import { gameRequest } from "@/lib/game-request";
import GameSurface from "./GameSurface";
import BrainDuel from "./BrainDuel";
import type { Stroke } from "./Doodle";
import { topics, cleanTopic } from "@/lib/ai/topics";
export type ExtraKind = "draw" | "know" | "trivia";
function ExtraGameInternal({
  kind,
  db,
  session,
  coupleId,
  slot,
  names,
  preview,
  back,
}: {
  kind: ExtraKind;
  db: SupabaseClient | null;
  session: Session | null;
  coupleId: string | null;
  slot: number;
  names: string[];
  preview: boolean;
  back: () => void;
}) {
  const [game, setGame] = useState<Game | null>(null),
    [strokes, setStrokes] = useState<Stroke[]>([]),
    [word, setWord] = useState<string | null>(null),
    [seat, setSeat] = useState(slot),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sound, setSound] = useState(false);
  const [topic, setTopic] = useState("Surprise Mix"),
    [custom, setCustom] = useState(""),
    [count, setCount] = useState(5),
    [difficulty, setDifficulty] = useState("Easy-Medium"),
    [savedNote, setSavedNote] = useState("");
  useEffect(() => {
    setTopic(localStorage.getItem("arcade-trivia-topic") || "Surprise Mix");
    setCustom(localStorage.getItem("arcade-trivia-custom") || "");
  }, []);
  const lock = useRef(false),
    current = useRef<Game | null>(null),
    answers = useRef<Record<number, Record<string, string>>>({}),
    secret = useRef(""),
    artist = useRef(0),
    audio = useRef<AudioContext | null>(null),
    requestVersion = useRef(0);
  const wakeShuffle = useRef<() => void>(() => {});
  useEffect(() => {
    if (preview || kind !== "trivia" || !db || !coupleId) return;
    const live = db
      .channel(`ai-trivia:${coupleId}`, { config: { private: true } })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "generation_jobs",
          filter: `couple_id=eq.${coupleId}`,
        },
        () => wakeShuffle.current(),
      )
      .subscribe();
    return () => {
      void db.removeChannel(live);
    };
  }, [db, coupleId, kind, preview]);
  current.current = game;
  const player = preview ? seat : slot,
    definition = registry.find((g) => g.id === kind)!,
    Icon = kind === "draw" ? Pencil : kind === "know" ? Heart : Brain;
  const refresh = useCallback(async () => {
    const active = current.current;
    if (!active || !db || preview || lock.current) return;
    const generation = ++requestVersion.current;
    const [g, s, w] = await Promise.all([
      db.from("games").select("*").eq("id", active.id).maybeSingle(),
      db
        .from("entries")
        .select("body")
        .eq("couple_id", coupleId!)
        .eq("kind", "stroke")
        .eq("body->>game", active.id)
        .order("created_at")
        .limit(3000),
      kind === "draw"
        ? db.rpc("drawing_word", { gid: active.id })
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (
      generation !== requestVersion.current ||
      current.current?.id !== active.id
    )
      return;
    if (g.error || s.error || w.error) {
      setError(
        "Your live game could not load. Check your connection and retry.",
      );
      return;
    }
    if (g.data) setGame(g.data as Game);
    setStrokes((s.data || []).map((x) => x.body as Stroke));
    setWord(w.data);
    setError("");
  }, [db, preview, coupleId, kind, slot]);
  useEffect(() => {
    if (!game || preview) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    if (!db || !session || !coupleId) return () => clearInterval(timer);
    // PlayArcade stays mounted and owns this private channel and its auth.
    const update = () => void refresh();
    window.addEventListener("arcade:couple-update", update);
    return () => {
      clearInterval(timer);
      ++requestVersion.current;
      window.removeEventListener("arcade:couple-update", update);
    };
  }, [game?.id, db, session?.access_token, coupleId, preview, refresh]);
  useEffect(
    () => () => {
      ++requestVersion.current;
      void audio.current?.close();
    },
    [],
  );
  function feedback(win = false) {
    navigator.vibrate?.(win ? [30, 40, 30] : 10);
    if (!sound) return;
    try {
      const ctx = (audio.current ??= new AudioContext());
      void ctx.resume();
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.frequency.value = win ? 660 : 440;
      g.gain.setValueAtTime(0.025, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.12);
    } catch {}
  }
  async function work(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    ++requestVersion.current;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your action could not save. Retry when connected.",
      );
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
      void refresh();
    }
  }
  async function start(_kind: GameKind = kind) {
    await work(async () => {
      let next: Game;
      if (preview) {
        const local = startExtraPreview(kind);
        next = local.game;
        secret.current = local.secret;
        answers.current = local.answers;
        setStrokes(local.strokes);
      } else if (kind === "trivia") {
        const picked = cleanTopic(topic === "Custom Topic" ? custom : topic);
        localStorage.setItem("arcade-trivia-topic", topic);
        localStorage.setItem("arcade-trivia-custom", cleanTopic(custom));
        const end = Date.now() + 15000;
        const timeout = new AbortController();
        const timer = setTimeout(() => timeout.abort(), 15000);
        let result;
        try {
          result = await gameRequest(
            db,
            { kind, topic: picked, count, difficulty },
            fetch,
            "/api/game",
            timeout.signal,
          );
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError")
            result = { pending: true };
          else throw e;
        } finally {
          clearTimeout(timer);
        }
        while (result.pending && Date.now() < end) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 1500);
            wakeShuffle.current = () => {
              clearTimeout(timer);
              resolve();
            };
          });
          result = await gameRequest(db, {
            kind,
            topic: picked,
            count,
            difficulty,
          });
        }
        if (!result.game)
          result = await gameRequest(db, {
            kind,
            topic: picked,
            count,
            difficulty,
            savedOnly: true,
          });
        if (!result.game)
          throw new Error(
            "The shared question shuffle is still finishing. Try joining again.",
          );
        next = result.game;
        setSavedNote(
          next.state.source === "saved"
            ? "Using our saved questions today."
            : "",
        );
      } else next = await gameRequest(db, { kind });
      ++requestVersion.current;
      setWord(null);
      setGame(next);
    });
  }
  async function move(action: Record<string, unknown>) {
    await work(async () => {
      if (!current.current) return;
      const next = preview
        ? extraMove(
            current.current,
            player,
            action,
            answers.current,
            secret.current,
          )
        : ((await gameRequest(db, { id: current.current.id, action })) as Game);
      setGame(next);
      feedback(next.state.status !== "playing");
      if (preview) {
        updateExtraPreview(kind, { game: next });
        recordPreview(next);
      }
    });
  }
  async function stroke(s: Stroke) {
    if (lock.current)
      throw new Error("Your previous mark is still saving. Try again shortly.");
    await work(async () => {
      if (!current.current) return;
      if (preview) {
        if (player !== current.current.state.artist)
          throw new Error("Only the artist can draw.");
        setStrokes((xs) => {
          const next = [...xs, s];
          updateExtraPreview(kind, { strokes: next });
          return next;
        });
      } else {
        const r = await db!.rpc("save_entry", {
          k: "stroke",
          content: { ...s, game: current.current.id },
        });
        if (r.error) throw new Error(r.error.message);
        await refresh();
      }
    });
  }
  const finished = game && game.state.status !== "playing";
  return (
    <div className={`extra-station ${kind}`}>
      <div className="station-top">
        <button className="text-button" onClick={back}>
          <ArrowLeft size={18} />
          Back to Play
        </button>
        <button
          className="icon-button"
          aria-label={sound ? "Turn game sound off" : "Turn game sound on"}
          aria-pressed={sound}
          onClick={() => setSound((v) => !v)}
        >
          {sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button className="secondary" onClick={() => void refresh()}>
            Retry connection <RefreshCw size={16} />
          </button>
        </div>
      )}
      {preview && (
        <div className="preview-seats">
          <span>Local pass-and-play</span>
          {names.map((n, i) => (
            <button
              key={i}
              className="secondary"
              aria-pressed={seat === i}
              onClick={() => {
                setSeat(i);
                setWord(null);
              }}
            >
              {n}
            </button>
          ))}
        </div>
      )}
      {!game ? (
        <section className="extra-start">
          <Icon size={72} />
          <h1>{definition.name}</h1>
          <p>
            {kind === "draw"
              ? "One secret word. Five guesses. Take turns holding the pencil."
              : kind === "know"
                ? "Choose your own answer and predict your person’s. Both answers stay sealed until you submit together."
                : preview
                  ? "Five sample questions. Two curious minds. Scores stay on this device."
                  : "Pick a topic. Answers reveal together, and the server keeps score."}
          </p>
          {kind === "trivia" && (
            <div className="brain-setup">
              <fieldset disabled={busy}>
                <legend>What are we curious about?</legend>
                <div className="topic-chips">
                  {[...topics, "Custom Topic"].map((t) => (
                    <button
                      type="button"
                      className="secondary"
                      key={t}
                      aria-pressed={topic === t}
                      onClick={() => setTopic(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </fieldset>
              {topic === "Custom Topic" && (
                <label>
                  Our topic
                  <input
                    maxLength={40}
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder="Dinosaurs, baking, ocean life…"
                  />
                </label>
              )}
              <fieldset disabled={busy || preview}>
                <legend>How many questions?</legend>
                <div className="topic-chips">
                  {[3, 5, 10].map((n) => (
                    <button
                      type="button"
                      className="secondary"
                      key={n}
                      aria-pressed={count === n}
                      onClick={() => setCount(n)}
                    >
                      {n} questions
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset disabled={busy || preview}>
                <legend>Difficulty</legend>
                <div className="topic-chips">
                  {["Easy", "Easy-Medium"].map((d) => (
                    <button
                      type="button"
                      className="secondary"
                      key={d}
                      aria-pressed={difficulty === d}
                      onClick={() => setDifficulty(d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </fieldset>
              {preview && (
                <p className="small">
                  Topic choices apply online. This local demo uses the
                  five-question sample pack.
                </p>
              )}
            </div>
          )}
          <button disabled={busy} onClick={() => void start().catch(() => {})}>
            {busy
              ? kind === "trivia"
                ? "Shuffling the questions…"
                : "Opening our game…"
              : "Create or join our game"}
          </button>
          <p className="small">
            {preview
              ? "Nothing is saved online in this preview."
              : "Starting joins an unfinished game of this type."}
          </p>
        </section>
      ) : (
        <>
          {kind === "trivia" && (
            <p className="small" role="status">
              {game.state.topic || "Sample pack"} · {game.state.count || 5}{" "}
              questions{savedNote && ` · ${savedNote}`}
            </p>
          )}
          {finished && (
            <div className="game-confetti" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} style={{ "--i": i } as React.CSSProperties} />
              ))}
            </div>
          )}
          <GameSurface
            hideBack
            key={game.id}
            game={game}
            slot={player}
            names={names}
            move={move}
            newGame={async (k) => {
              try {
                await start(k);
              } catch {}
            }}
            back={back}
            word={
              preview
                ? player === game.state.artist
                  ? secret.current
                  : null
                : word
            }
            strokes={strokes}
            onStroke={stroke}
            busy={busy}
            report={
              !preview && game.state.pack === "gemini-v1"
                ? async (position) => {
                    await work(async () => {
                      const { error } = await db!.rpc("report_question", {
                        gid: game.id,
                        pos: position,
                      });
                      if (error)
                        throw new Error(
                          "The report could not save. Try again.",
                        );
                      setSavedNote("Question reported. It will not be reused.");
                    });
                  }
                : undefined
            }
          />
        </>
      )}
    </div>
  );
}

export default function ExtraGame(
  props: Parameters<typeof ExtraGameInternal>[0],
) {
  return props.kind === "trivia" && !props.preview ? (
    <BrainDuel
      db={props.db}
      session={props.session}
      slot={props.slot}
      names={props.names}
      back={props.back}
    />
  ) : (
    <ExtraGameInternal {...props} />
  );
}
