"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Brain, Check, Users } from "lucide-react";
import { gameRequest } from "@/lib/game-request";
import type { Game } from "@/lib/games";
import { topics } from "@/lib/ai/topics";
import GameSurface from "./GameSurface";
type Lobby = {
  id: string;
  host_id: string;
  topic: string;
  count: number;
  difficulty: string;
  status: string;
  bothReady: boolean;
  serverTime: string;
  members: Record<string, { seen: string; ready: boolean }>;
  game: Game | null;
};
export default function BrainDuel({
  db,
  session,
  slot,
  names,
  back,
}: {
  db: SupabaseClient | null;
  session: Session | null;
  slot: number;
  names: string[];
  back: () => void;
}) {
  const [lobby, setLobby] = useState<Lobby | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [topic, setTopic] = useState("Surprise Mix"),
    [custom, setCustom] = useState(""),
    [count, setCount] = useState(5),
    [difficulty, setDifficulty] = useState("Medium");
  const joined = useRef(false),
    alive = useRef(true),
    polling = useRef(false);
  const uid = session?.user.id || "",
    host = lobby?.host_id === uid;
  const request = useCallback(
    async (op: string, options: Record<string, unknown> = {}) => {
      const next = (await gameRequest(
        db,
        { op, options },
        fetch,
        "/api/brain",
      )) as Lobby | null;
      if (alive.current) {
        joined.current = !!next?.members[session?.user.id || ""];
        setLobby(next);
      }
      return next;
    },
    [db, session?.user.id],
  );
  useEffect(() => {
    alive.current = true;
    void request("inspect").catch((e) => setError(e.message));
    const timer = setInterval(() => {
      if (polling.current || document.visibilityState !== "visible") return;
      polling.current = true;
      void request(joined.current ? "heartbeat" : "inspect")
        .catch((e) => setError(e.message))
        .finally(() => {
          polling.current = false;
        });
    }, 4000);
    return () => {
      alive.current = false;
      clearInterval(timer);
      if (joined.current)
        void gameRequest(db, { op: "leave" }, fetch, "/api/brain").catch(
          () => {},
        );
    };
  }, [db, request]);
  async function act(op: string, options: Record<string, unknown> = {}) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (op === "create" || op === "join") joined.current = true;
      await request(op, options);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The lobby could not update. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (lobby?.host_id === uid) {
      setTopic(
        (topics as readonly string[]).includes(lobby.topic)
          ? lobby.topic
          : "Custom Topic",
      );
      setCustom(lobby.topic);
      setCount(lobby.count);
      setDifficulty(lobby.difficulty);
    }
  }, [lobby?.id, uid]);
  const mine = lobby?.members[uid],
    serverTime = Date.parse(lobby?.serverTime || "");
  const present = Object.entries(lobby?.members || {}).filter(
    ([, m]) => Date.parse(m.seen) > serverTime - 20000,
  );
  const finished =
    lobby?.status === "finished" ||
    (lobby?.game && lobby.game.state.status !== "playing");
  const configured =
    lobby?.topic === (topic === "Custom Topic" ? custom.trim() : topic) &&
    lobby?.count === count &&
    lobby?.difficulty === difficulty;
  return (
    <div className="extra-station trivia brain-lobby">
      <div className="station-top">
        <button className="text-button" onClick={back}>
          <ArrowLeft size={18} />
          Back to Play
        </button>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void act("inspect")}
          >
            Retry connection
          </button>
        </div>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {!lobby || finished ? (
        <section className="extra-start">
          <Brain size={64} />
          <h1>A little brain duel</h1>
          <p>
            Pick your curiosity. Bring your person. Reveal your answers
            together.
          </p>
          <button disabled={busy} onClick={() => void act("create")}>
            {busy ? "Opening the lobby…" : "Create a lobby"}
          </button>
          <p className="small">
            The host chooses the topic, difficulty and number of questions. Both
            players must join and be ready.
          </p>
          {finished && lobby?.game && (
            <GameSurface
              hideBack
              word={null}
              strokes={[]}
              onStroke={async () => {}}
              game={lobby.game}
              slot={slot}
              names={names}
              move={async () => {}}
              newGame={async () => {
                await act("create");
              }}
              back={back}
              busy={busy}
            />
          )}
        </section>
      ) : (
        <>
          {lobby.status !== "playing" && <h1>A little brain duel</h1>}
          {(lobby.status !== "playing" || !lobby.bothReady) && (
            <section className="brain-setup" aria-label="Brain Duel lobby">
              <h2>
                <Users size={24} /> Our lobby
              </h2>
              <p role="status">
                {present.length}/2 players here ·{" "}
                {lobby.status === "preparing"
                  ? "Preparing Gemini questions…"
                  : lobby.bothReady
                    ? "Both ready"
                    : "Waiting for both players to be ready"}
              </p>
              <ul className="lobby-players">
                {[slot, 1 - slot].map((s) => {
                  const entry =
                    s === slot
                      ? mine
                      : Object.entries(lobby.members).find(
                          ([id]) => id !== uid,
                        )?.[1];
                  const here =
                    !!entry && Date.parse(entry.seen) > serverTime - 20000;
                  return (
                    <li key={s}>
                      <strong>
                        {names[s]}
                        {s === slot ? " (you)" : ""}
                      </strong>
                      <span>
                        {here
                          ? entry?.ready
                            ? "Ready"
                            : "Here · not ready"
                          : "Not in the lobby"}
                        {here && entry?.ready && <Check size={18} />}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {!mine && (
                <button disabled={busy} onClick={() => void act("join")}>
                  Join lobby
                </button>
              )}
              {host && lobby.status === "waiting" ? (
                <>
                  <fieldset disabled={busy}>
                    <legend>What are we curious about?</legend>
                    <select
                      aria-label="Topic"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                    >
                      {[...topics, "Custom Topic"].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
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
                  </fieldset>
                  <fieldset disabled={busy}>
                    <legend>Difficulty</legend>
                    <div className="topic-chips">
                      {["Easy", "Medium", "Hard"].map((d) => (
                        <button
                          className="secondary"
                          aria-pressed={difficulty === d}
                          key={d}
                          onClick={() => setDifficulty(d)}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset disabled={busy}>
                    <legend>How many questions?</legend>
                    <div className="topic-chips">
                      {[3, 5, 10].map((n) => (
                        <button
                          className="secondary"
                          aria-pressed={count === n}
                          key={n}
                          onClick={() => setCount(n)}
                        >
                          {n} questions
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  {!configured && (
                    <button
                      disabled={
                        busy || (topic === "Custom Topic" && !custom.trim())
                      }
                      onClick={() =>
                        void act("configure", {
                          topic: topic === "Custom Topic" ? custom : topic,
                          count,
                          difficulty,
                        })
                      }
                    >
                      Save duel setup
                    </button>
                  )}
                </>
              ) : (
                <p>
                  <strong>{lobby.topic}</strong> · {lobby.difficulty} ·{" "}
                  {lobby.count} questions
                  {lobby.status === "waiting" && " · Chosen by the host"}
                </p>
              )}
              {mine && lobby.status !== "preparing" && (
                <button
                  className="secondary"
                  disabled={
                    busy || (host && lobby.status === "waiting" && !configured)
                  }
                  onClick={() => void act("ready", { ready: !mine.ready })}
                >
                  {mine.ready ? "Not ready" : "I’m ready"}
                </button>
              )}
              {host && lobby.status === "waiting" && (
                <button
                  disabled={busy || !lobby.bothReady || !configured}
                  onClick={() => void act("start")}
                >
                  {busy ? "Preparing Gemini questions…" : "Start duel together"}
                </button>
              )}
              <p className="small">
                Changing the setup resets both ready checks. Stay on this page
                while your questions load.
              </p>
            </section>
          )}
          {lobby.status === "playing" && lobby.game && (
            <>
              <p className="small">
                {lobby.topic} · {lobby.difficulty} · {lobby.count} questions ·
                Gemini
              </p>
              <GameSurface
                hideBack
                word={null}
                strokes={[]}
                onStroke={async () => {}}
                game={lobby.game}
                slot={slot}
                names={names}
                busy={busy || !lobby.bothReady}
                back={back}
                newGame={async () => {
                  await act("create");
                }}
                move={async (action) => {
                  setBusy(true);
                  try {
                    setError("");
                    await gameRequest(db, { id: lobby.game!.id, action });
                    await request("heartbeat");
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Your answer could not save. Retry when connected.",
                    );
                    throw e;
                  } finally {
                    setBusy(false);
                  }
                }}
                report={async (position) => {
                  try {
                    const { error } = await db!.rpc("report_question", {
                      gid: lobby.game!.id,
                      pos: position,
                    });
                    if (error) throw error;
                    setNotice(
                      "Question reported. It will not be reused in future duels.",
                    );
                  } catch {
                    setError(
                      "Your report could not save. Check the connection and retry.",
                    );
                    throw new Error("Your report could not save.");
                  }
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
