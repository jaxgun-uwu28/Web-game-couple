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
import { extraMove, startExtraPreview, updateExtraPreview } from "@/lib/extra-games";
import {recordPreview} from '@/lib/preview-progress';
import { gameRequest } from "@/lib/game-request";
import GameSurface from "./GameSurface";
import type { Stroke } from "./Doodle";
export type ExtraKind = "draw" | "know" | "trivia";
export default function ExtraGame({
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
  const lock = useRef(false),
    current = useRef<Game | null>(null),
    answers = useRef<Record<number, Record<string, string>>>({}),
    secret = useRef(""),
    artist = useRef(0),
    audio = useRef<AudioContext | null>(null),
    requestVersion = useRef(0);
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
    const live = db
      .channel(`couple:${coupleId}`, { config: { private: true } })
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
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "entries",
          filter: `couple_id=eq.${coupleId}`,
        },
        () => void refresh(),
      );
    void db.realtime.setAuth(session.access_token).then(() => live.subscribe());
    return () => {
      clearInterval(timer);
      ++requestVersion.current;
      void db.removeChannel(live);
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
        const local=startExtraPreview(kind);next=local.game;secret.current=local.secret;answers.current=local.answers;setStrokes(local.strokes);
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
      if(preview){updateExtraPreview(kind,{game:next});recordPreview(next);}
    });
  }
  async function stroke(s: Stroke) {
    if (lock.current) throw new Error("Your previous mark is still saving. Try again shortly.");
    await work(async () => {
      if (!current.current) return;
      if (preview) {
        if (player !== current.current.state.artist)
          throw new Error("Only the artist can draw.");
        setStrokes((xs) => {const next=[...xs,s];updateExtraPreview(kind,{strokes:next});return next;});
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
                : preview ? "Five questions. Two curious minds. Reveal your answers together, with scores kept on this device." : "Five questions. Two curious minds. Answers reveal together, and the server keeps score."}
          </p>
          <button disabled={busy} onClick={() => void start().catch(() => {})}>
            {busy ? "Opening our game…" : "Create or join our game"}
          </button>
          <p className="small">
            {preview
              ? "Nothing is saved online in this preview."
              : "Starting joins an unfinished game of this type."}
          </p>
        </section>
      ) : (
        <>
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
          />
        </>
      )}
    </div>
  );
}
