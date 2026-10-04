"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import type { Session, RealtimeChannel } from "@supabase/supabase-js";
import {
  Heart,
  ArrowUpRight,
  KeyRound,
  Mail,
  LogOut,
  Settings,
  Send,
  Leaf,
  Cat,
  Gamepad2,
  ArrowRight,
  Bell,
  Check,
} from "lucide-react";
import { createBrowserDb } from "@/lib/supabase";
import {
  Game,
  GameKind,
  registry,
  manilaDay,
  dayIndex,
  daysTogether,
  dailyQuestions,
  choices,
  boardWinner,
} from "@/lib/games";
import { gameIcons } from "./GameSurface";
import type { Entry } from "./Activities";
import type { Stroke } from "./Doodle";
import Ambience from "./Ambience";
const GameSurface = dynamic(() => import("./GameSurface"));
const Activities = dynamic(() => import("./Activities"));
type Profile = {
  id: string;
  slot: number;
  couple_id: string;
  name: string;
  color: string;
  nickname: string;
};
type Answer = { user_id: string; answer: string | null };
type Today = {
  day: string;
  daily: Answer[];
  choice: Answer[];
  streak: number;
  matches: number;
  total: number;
};
const previewProfiles: Profile[] = [
  {
    id: "preview-lance",
    slot: 0,
    couple_id: "preview",
    name: "Lance",
    color: "#262821",
    nickname: "",
  },
  {
    id: "preview-elaine",
    slot: 1,
    couple_id: "preview",
    name: "Elaine",
    color: "#344f3f",
    nickname: "",
  },
];
const emptyToday = (): Today => ({
  day: manilaDay(),
  daily: [],
  choice: [],
  streak: 0,
  matches: 0,
  total: 0,
});
export default function Arcade() {
  const db = useMemo(createBrowserDb, []);
  const [session, setSession] = useState<Session | null>(null),
    [authReady, setAuthReady] = useState(false),
    [preview, setPreview] = useState(false),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [games, setGames] = useState<Game[]>([]),
    [entries, setEntries] = useState<Entry[]>([]),
    [today, setToday] = useState<Today>(emptyToday),
    [selected, setSelected] = useState<string | null>(null),
    [word, setWord] = useState<string | null>(null),
    [answer, setAnswer] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [online, setOnline] = useState<string[]>([]),
    [connection, setConnection] = useState("Connecting…"),
    [settings, setSettings] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [authMode, setAuthMode] = useState("password"),
    [profileName, setProfileName] = useState(""),
    [profileColor, setProfileColor] = useState("#344f3f"),
    [nickname, setNickname] = useState(""),
    [notification, setNotification] = useState(false),
    [scoreboard, setScoreboard] = useState<number[]>([0, 0]);
  const channel = useRef<RealtimeChannel | null>(null),
    selectedRef = useRef(selected),
    previousTurn = useRef("");
  selectedRef.current = selected;
  const me =
    profiles.find((p) => p.id === session?.user.id) ||
    (preview ? profiles[0] : undefined);
  const slot = me?.slot ?? 0;
  const names = [
    profiles.find((p) => p.slot === 0)?.name || "Lance",
    profiles.find((p) => p.slot === 1)?.name || "Elaine",
  ];
  const partner = profiles.find((p) => p.slot !== slot);
  const game = games.find((g) => g.id === selected);
  const day = dayIndex(today.day);
  const daily = dailyQuestions[day % dailyQuestions.length],
    choice = choices[day % choices.length];
  useEffect(() => {
    if (!db) {
      setAuthReady(true);
      return;
    }
    void db.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = db.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setError("");
      setNotice("");
    });
    return () => data.subscription.unsubscribe();
  }, [db]);
  const refresh = useCallback(async () => {
    if (!db || !session) return;
    const results = await Promise.all([
      db.from("profiles").select("*").order("slot"),
      db.from("games").select("*").order("created_at", { ascending: false }),
      db
        .from("entries")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(3000),
      db.rpc("today_answers"),
      db.rpc("scoreboard"),
    ]);
    const failed = results.find((r) => r.error);
    if (failed) {
      setError(
        `Our table could not load: ${failed.error?.message}. Check the Supabase setup, then retry.`,
      );
      return;
    }
    setProfiles(results[0].data as Profile[]);
    setGames(results[1].data as Game[]);
    setEntries(results[2].data as Entry[]);
    setToday(results[3].data as Today);
    setScoreboard(results[4].data as number[]);
  }, [db, session]);
  useEffect(() => {
    if (!session || preview) return;
    void refresh();
    const interval = setInterval(() => void refresh(), 30000);
    return () => clearInterval(interval);
  }, [session, refresh, preview]);
  useEffect(() => {
    if (!db || !session || !me || preview) return;
    let canceled = false;
    const live = db.channel(`couple:${me.couple_id}`, {
      config: { private: true, presence: { key: me.id } },
    });
    channel.current = live;
    live
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `couple_id=eq.${me.couple_id}`,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "entries",
          filter: `couple_id=eq.${me.couple_id}`,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `couple_id=eq.${me.couple_id}`,
        },
        () => void refresh(),
      )
      .on("presence", { event: "sync" }, () =>
        setOnline(Object.keys(live.presenceState())),
      )
      .on("broadcast", { event: "refresh" }, () => void refresh())
      .on("broadcast", { event: "nudge" }, ({ payload }) => {
        if (payload.to === me.id) {
          setNotice("Your person is waiting for you at the table.");
          if (
            notification &&
            "Notification" in window &&
            Notification.permission === "granted"
          )
            new Notification("Our Little Arcade", {
              body: "Your person is waiting for you.",
            });
        }
      });
    void db.realtime.setAuth(session.access_token).then(() => {
      if (canceled) return;
      live.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setConnection("Live at our table");
          await live.track({ user: me.id });
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setConnection("Reconnecting · saved games still here");
        }
      });
    });
    return () => {
      canceled = true;
      channel.current = null;
      void db.removeChannel(live);
    };
  }, [db, session, me?.id, me?.couple_id, refresh, preview, notification]);
  useEffect(() => {
    if (!db || !game || game.kind !== "draw" || preview) {
      setWord(preview && game?.kind === "draw" ? "cat" : null);
      return;
    }
    void db
      .rpc("drawing_word", { gid: game.id })
      .then(({ data }) => setWord(data));
  }, [db, game?.id, game?.state.round, preview]);
  useEffect(() => {
    if (!game) return;
    const key = `${game.id}:${game.state.turn}:${game.state.round}`;
    if (
      previousTurn.current &&
      previousTurn.current !== key &&
      game.state.turn === slot &&
      game.state.status === "playing"
    ) {
      setNotice("Your turn. Make it a good one.");
      if (
        notification &&
        "Notification" in window &&
        Notification.permission === "granted"
      )
        new Notification("Your turn", {
          body: "Your next move is waiting in Our Little Arcade.",
        });
    }
    previousTurn.current = key;
  }, [game, slot, notification]);
  const work = async (task: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(
        e && typeof e === "object" && "message" in e
          ? String(e.message)
          : "Something interrupted us. Try again.",
      );
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (!db || !session) throw new Error("Sign in to save this to our table.");
    const { data, error } = await db.rpc(name, args);
    if (error) throw error;
    await refresh();
    return data;
  };
  const authenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await work(async () => {
        if (!db)
          throw new Error(
            "Add the Supabase connection to .env.local, then restart the app.",
          );
        if (authMode === "magic") {
          const { error } = await db.auth.signInWithOtp({
            email,
            options: {
              shouldCreateUser: false,
              emailRedirectTo: window.location.origin,
            },
          });
          if (error) throw error;
          setNotice(
            "Your invitation is in your inbox. Open it on this device.",
          );
        } else {
          const { error } = await db.auth.signInWithPassword({
            email,
            password,
          });
          if (error) throw error;
        }
      });
    } catch {
      /* displayed above */
    }
  };
  const newGame = async (kind: GameKind) => {
    try {
      await work(async () => {
        if (preview) {
          const active = games.find(
            (g) => g.kind === kind && g.state.status === "playing",
          );
          if (active) {
            setSelected(active.id);
            return;
          }
          const next: Game = {
            id: crypto.randomUUID(),
            kind,
            state: {
              status: "playing",
              turn: 0,
              round: 0,
              scores: [0, 0],
              winner: null,
              ...(kind === "tic" || kind === "connect"
                ? { board: Array(kind === "tic" ? 9 : 42).fill(0) }
                : {}),
              ...(kind === "draw" ? { artist: 0, guesses: [] } : {}),
            },
          };
          setGames((gs) => [next, ...gs]);
          setSelected(next.id);
          return;
        }
        const response = await fetch("/api/game", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session!.access_token}`,
          },
          body: JSON.stringify({ kind }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setSelected(data.id);
        await refresh();
      });
    } catch {
      /* displayed above */
    }
  };
  const move = async (action: Record<string, unknown>) => {
    if (!game) return;
    try {
      await work(async () => {
        if (preview) {
          if (game.kind !== "tic" && game.kind !== "connect")
            throw new Error(
              "This is a local design preview. Sign in with both accounts to play this game.",
            );
          const b = [...game.state.board!];
          let idx = Number(action.cell);
          if (game.kind === "connect") {
            const column = idx;
            idx = -1;
            for (let r = 5; r >= 0; r--)
              if (!b[r * 7 + column]) {
                idx = r * 7 + column;
                break;
              }
          }
          if (idx < 0 || b[idx]) return;
          b[idx] = game.state.turn + 1;
          const winner = boardWinner(
            b,
            game.kind === "tic" ? 3 : 7,
            game.kind === "tic" ? 3 : 4,
          );
          setGames((gs) =>
            gs.map((g) =>
              g.id === game.id
                ? {
                    ...g,
                    state: {
                      ...g.state,
                      board: b,
                      turn: 1 - g.state.turn,
                      winner,
                      status:
                        winner !== null
                          ? "won"
                          : b.every(Boolean)
                            ? "draw"
                            : "playing",
                    },
                  }
                : g,
            ),
          );
          return;
        }
        const response = await fetch("/api/game", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session!.access_token}`,
          },
          body: JSON.stringify({ id: game.id, action }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        await refresh();
      });
    } catch {
      /* displayed above */
    }
  };
  const save = async (
    kind: string,
    body: Record<string, unknown>,
    id?: string,
  ) => {
    try {
      await work(async () => {
        if (preview) {
          if (id) {
            setEntries((es) =>
              kind === "delete"
                ? es.filter((e) => e.id !== id)
                : es.map((e) => (e.id === id ? { ...e, done: !e.done } : e)),
            );
          } else
            setEntries((es) => [
              ...es,
              {
                id: crypto.randomUUID(),
                kind,
                body,
                author: "preview-lance",
                done: false,
              },
            ]);
          return;
        }
        await rpc("save_entry", { k: kind, content: body, eid: id || null });
      });
    } catch {
      /* displayed above */
    }
  };
  const answerToday = async (kind: string, content: string) => {
    try {
      await work(async () => {
        if (preview) {
          setToday((t) => ({
            ...t,
            [kind]: [{ user_id: me!.id, answer: content }],
          }));
          return;
        }
        await rpc("answer_today", { k: kind, content });
        await channel.current?.send({
          type: "broadcast",
          event: "refresh",
          payload: {},
        });
      });
      setAnswer("");
    } catch {
      /* displayed above */
    }
  };
  const wins = preview
    ? [0, 1].map(
        (i) =>
          games.filter((g) => g.state.status === "won" && g.state.winner === i)
            .length,
      )
    : scoreboard;
  const streak = today.streak;
  const openPreview = () => {
    setPreview(true);
    setProfiles(previewProfiles);
    setNotice(
      "Local design preview · changes stay in this tab. Online play requires the two private accounts.",
    );
    setConnection("Local preview");
  };
  return (
    <div className="arcade-shell">
      <a className="skip-link" href="#main">
        Skip to our table
      </a>
      <header className="masthead">
        <a href="/" className="wordmark" aria-label="Our Little Arcade home">
          <Gamepad2 size={24} />
          <span>
            our little <em>arcade</em>
          </span>
        </a>
        <div className="header-right">
          <Ambience />
          {me && (
            <button
              className="icon-button"
              aria-label="Personal settings"
              onClick={() => {
                setSettings(!settings);
                setProfileName(me.name);
                setProfileColor(me.color);
                setNickname(me.nickname);
              }}
            >
              <Settings size={19} />
            </button>
          )}
          {(session || preview) && (
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={() => {
                if (preview) {
                  setPreview(false);
                  setProfiles([]);
                  setGames([]);
                  setEntries([]);
                  setToday(emptyToday());
                  setSelected(null);
                  setNotice("");
                } else
                  void db?.auth.signOut().then(() => {
                    setProfiles([]);
                    setGames([]);
                    setEntries([]);
                    setSelected(null);
                    setToday(emptyToday());
                  });
              }}
            >
              <LogOut size={19} />
            </button>
          )}
        </div>
      </header>
      <main id="main">
        {(error || notice) && (
          <div
            className={`message ${error ? "error" : ""}`}
            role={error ? "alert" : "status"}
          >
            {error || notice}
            <button
              className="text-button"
              onClick={() => {
                setError("");
                setNotice("");
              }}
            >
              Dismiss
            </button>
            {error && session && (
              <button className="text-button" onClick={() => void refresh()}>
                Retry
              </button>
            )}
          </div>
        )}
        {!authReady ? (
          <div className="loading-paper">
            <Heart size={28} />
            <p>Opening our little place…</p>
          </div>
        ) : !session && !preview ? (
          <div className="invitation-layout">
            <div className="invitation-window">
              <Image
                src="/forest.jpg"
                alt="Sunlight falling through a quiet forest outside our cabin"
                fill
                priority
                sizes="(max-width: 760px) 100vw, 55vw"
              />
              <div className="window-caption">
                <span className="handwriting">
                  a little place, just for us.
                </span>
                <h1>
                  Come in.
                  <br />
                  Stay a while.
                </h1>
                <p>Lance & Elaine · since September 6, 2025</p>
              </div>
            </div>
            <section className="invitation-paper">
              <span className="seal">
                <Heart size={27} />
              </span>
              <h2>
                Our favorite
                <br />
                <em>kind of together.</em>
              </h2>
              <p>
                A game on the table. A film queued up.
                <br />
                And you, right here.
              </p>
              <form onSubmit={authenticate}>
                <div className="auth-tabs">
                  <button
                    type="button"
                    aria-pressed={authMode === "password"}
                    className={authMode === "password" ? "active" : ""}
                    onClick={() => setAuthMode("password")}
                  >
                    <KeyRound size={16} />
                    Password
                  </button>
                  <button
                    type="button"
                    aria-pressed={authMode === "magic"}
                    className={authMode === "magic" ? "active" : ""}
                    onClick={() => setAuthMode("magic")}
                  >
                    <Mail size={16} />
                    Email link
                  </button>
                </div>
                <label htmlFor="email">Your email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="The email on your invitation"
                  required
                />
                {authMode === "password" && (
                  <>
                    <label htmlFor="password">Your password</label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      autoComplete="current-password"
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </>
                )}
                <button className="enter-button" disabled={busy}>
                  {busy
                    ? "Opening the door…"
                    : authMode === "magic"
                      ? "Send my invitation"
                      : "Come to our table"}
                  <ArrowRight size={19} />
                </button>
              </form>
              <p className="private-note">
                <KeyRound size={14} />
                Two invitations. One little world.
              </p>
              {process.env.NODE_ENV === "development" && (
                <button
                  className="text-button preview-button"
                  onClick={openPreview}
                >
                  Open local design preview <ArrowUpRight size={16} />
                </button>
              )}
              <div className="invitation-footer">
                <Cat size={24} />
                <span className="handwriting">
                  cats, cars & a little competition
                </span>
              </div>
            </section>
          </div>
        ) : !me ? (
          <section className="access-paper">
            <KeyRound size={30} />
            <h1>Your seat isn’t ready yet.</h1>
            <p>
              This account needs to be linked to Lance or Elaine’s invitation.
              Ask the project owner to run the account setup.
            </p>
            <button onClick={() => void refresh()}>
              Check my invitation again
            </button>
          </section>
        ) : (
          <>
            <section className="table-intro">
              <div>
                <div className="presence">
                  <span
                    className={
                      partner && online.includes(partner.id)
                        ? "presence-dot online"
                        : "presence-dot"
                    }
                  />
                  {partner && online.includes(partner.id)
                    ? `${partner.name} is here, too.`
                    : "A little quiet until your person arrives."}
                  <span className="connection">{connection}</span>
                </div>
                <h1>
                  A little play.
                  <br />
                  <em>A lot of us.</em>
                </h1>
                <p>What shall we get up to, {me.nickname || me.name}?</p>
                <div className="anniversary">
                  <Heart size={16} />
                  <strong>{daysTogether()} days</strong> of choosing each other.
                  <span>06 September 2025</span>
                </div>
              </div>
              <figure className="forest-print">
                <div className="photo-wrap">
                  <Image
                    src="/forest.jpg"
                    alt="A warm forest view from our little cabin"
                    fill
                    priority
                    sizes="(max-width: 760px) 85vw, 340px"
                  />
                </div>
                <figcaption className="handwriting">
                  you & me, and nowhere to rush.
                </figcaption>
                <span className="season-note">
                  <Leaf size={13} />
                  {
                    [
                      "A winter window",
                      "A spring window",
                      "A summer window",
                      "An autumn window",
                    ][Math.floor(((new Date().getMonth() + 1) % 12) / 3)]
                  }
                </span>
              </figure>
            </section>
            {settings && (
              <section className="settings-paper">
                <h2>Your little details</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (preview) {
                      setProfiles((ps) =>
                        ps.map((p) =>
                          p.id === me.id
                            ? {
                                ...p,
                                name: profileName,
                                color: profileColor,
                                nickname,
                              }
                            : p,
                        ),
                      );
                      setSettings(false);
                      return;
                    }
                    void work(async () => {
                      await rpc("update_profile", {
                        n: profileName,
                        c: profileColor,
                        nick: nickname,
                      });
                      setSettings(false);
                    }).catch(() => {});
                  }}
                >
                  <label htmlFor="name">Name</label>
                  <input
                    id="name"
                    maxLength={40}
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                  />
                  <label htmlFor="nickname">Nickname or in-joke</label>
                  <input
                    id="nickname"
                    maxLength={60}
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                  />
                  <label htmlFor="color">Your favorite color</label>
                  <input
                    id="color"
                    type="color"
                    value={profileColor}
                    onChange={(e) => setProfileColor(e.target.value)}
                  />
                  <button disabled={busy}>Save my details</button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setSettings(false)}
                  >
                    Close
                  </button>
                </form>
                <button
                  className="text-button"
                  onClick={async () => {
                    if (!("Notification" in window)) {
                      setNotice("This browser supports in-page nudges only.");
                      return;
                    }
                    const permission = await Notification.requestPermission();
                    setNotification(permission === "granted");
                    setNotice(
                      permission === "granted"
                        ? "Turn notifications are on while this page is open."
                        : "In-page nudges are still available.",
                    );
                  }}
                >
                  <Bell size={17} />
                  Enable gentle turn notifications
                </button>
              </section>
            )}
            <div className="rivalry">
              <div>
                <span
                  className="player-mark cross"
                  style={{ color: profiles.find((p) => p.slot === 0)?.color }}
                >
                  ×
                </span>
                <strong>{names[0]}</strong>
                <b>{wins[0]}</b>
              </div>
              <span className="rivalry-middle">
                <Heart size={17} />
                <span>
                  friendly rivals.
                  <br />
                  favorite teammates.
                </span>
              </span>
              <div>
                <b>{wins[1]}</b>
                <strong>{names[1]}</strong>
                <span
                  className="player-mark circle"
                  style={{ color: profiles.find((p) => p.slot === 1)?.color }}
                >
                  ○
                </span>
              </div>
            </div>
            <div className="play-layout">
              <div className="play-area">
                {game ? (
                  <GameSurface
                    game={game}
                    slot={preview ? game.state.turn : slot}
                    names={names}
                    busy={busy}
                    move={move}
                    newGame={newGame}
                    back={() => setSelected(null)}
                    word={word}
                    strokes={entries
                      .filter(
                        (e) => e.kind === "stroke" && e.body.game === game.id,
                      )
                      .map((e) => e.body as unknown as Stroke)}
                    onStroke={(s) => save("stroke", { ...s, game: game.id })}
                  />
                ) : (
                  <section className="game-shelf">
                    <div className="shelf-heading">
                      <h2>Pick a little rivalry.</h2>
                      <span className="handwriting">
                        loser picks the movie?
                      </span>
                    </div>
                    {registry.map((g, i) => {
                      const Icon = gameIcons[g.icon];
                      const active = games.find(
                        (x) => x.kind === g.id && x.state.status === "playing",
                      );
                      return (
                        <button
                          key={g.id}
                          className={`game-ticket ticket-${i}`}
                          disabled={busy}
                          onClick={() => void newGame(g.id)}
                        >
                          <Icon className="ticket-icon" size={28} />
                          <span>
                            <strong>{g.name}</strong>
                            <small>
                              {active ? "Your game is waiting." : g.note}
                            </small>
                          </span>
                          <span className="ticket-action">
                            {active ? "Resume" : "Play"}
                            <ArrowUpRight size={19} />
                          </span>
                        </button>
                      );
                    })}
                    <p className="shelf-note">
                      <Cat size={18} />
                      <span>
                        A small pause for cats, snacks, or a nap is always
                        allowed.
                      </span>
                    </p>
                  </section>
                )}
              </div>
              <aside className="daily-paper">
                <div className="daily-date">
                  <span>
                    {new Date(`${today.day}T12:00:00`).toLocaleDateString(
                      "en",
                      { month: "short", day: "numeric" },
                    )}
                  </span>
                  <Heart size={19} />
                </div>
                <h2>
                  A question
                  <br />
                  <em>for just us.</em>
                </h2>
                <p className="daily-question">{daily}</p>
                {today.daily.length === 2 ? (
                  <div className="revealed-answers">
                    {today.daily.map((a) => (
                      <blockquote key={a.user_id}>
                        <span>
                          {profiles.find((p) => p.id === a.user_id)?.name}
                        </span>
                        {a.answer}
                      </blockquote>
                    ))}
                  </div>
                ) : today.daily.some((a) => a.user_id === me.id) ? (
                  <div className="sealed-answer">
                    <Check size={25} />
                    <p>
                      Your answer is safe here.
                      <br />
                      We’ll open both together.
                    </p>
                    <p className="small">
                      {today.daily.find((a) => a.user_id === me.id)?.answer}
                    </p>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void answerToday("daily", answer);
                    }}
                  >
                    <label className="sr-only" htmlFor="daily">
                      Your private answer
                    </label>
                    <textarea
                      id="daily"
                      value={answer}
                      maxLength={2000}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="A little honesty, in your own words…"
                      required
                    />
                    <button disabled={busy || !answer.trim()}>
                      Tuck my answer away <Send size={16} />
                    </button>
                  </form>
                )}
                <p className="small">
                  Answers open only when both of us reply.
                </p>
                <div className="streak">
                  <Leaf size={18} />
                  <span>
                    {streak} day{streak !== 1 ? "s" : ""} of showing up together
                  </span>
                </div>
                <button
                  className="text-button"
                  disabled={!partner || preview || !online.includes(partner.id)}
                  onClick={() => {
                    void channel.current?.send({
                      type: "broadcast",
                      event: "nudge",
                      payload: { to: partner?.id },
                    });
                    setNotice("A gentle nudge sent to your person.");
                  }}
                >
                  <Bell size={16} />
                  Nudge my person
                </button>
              </aside>
            </div>
            <section className="this-or-that">
              <div>
                <h2>Same wavelength?</h2>
                <p>Choose first. Peek together.</p>
              </div>
              <div className="choice-options">
                {choice.map((c, i) => (
                  <button
                    key={c}
                    aria-pressed={
                      today.choice.find((a) => a.user_id === me.id)?.answer ===
                      String(i)
                    }
                    disabled={
                      busy || today.choice.some((a) => a.user_id === me.id)
                    }
                    onClick={() => void answerToday("choice", String(i))}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <p className="choice-match">
                {today.choice.length === 2 ? (
                  <>
                    {today.choice[0].answer === today.choice[1].answer
                      ? "A perfect little match."
                      : "Different picks. Same team."}
                    <small>
                      {today.choice
                        .map(
                          (a) =>
                            `${profiles.find((p) => p.id === a.user_id)?.name}: ${choice[Number(a.answer)]}`,
                        )
                        .join(" · ")}
                    </small>
                  </>
                ) : today.choice.length ? (
                  "One choice tucked away."
                ) : (
                  "What feels like us today?"
                )}
                <small>
                  {today.total
                    ? `${Math.round((today.matches / today.total) * 100)}% matching over ${today.total} days`
                    : "Our matching story starts here."}
                </small>
              </p>
            </section>
            <Activities
              entries={entries}
              userId={me.id}
              save={save}
              busy={busy}
            />
          </>
        )}
      </main>
      <footer className="site-footer">
        <span>Lance & Elaine</span>
        <Heart size={14} />
        <span>our little world, since 2025.</span>
      </footer>
    </div>
  );
}
