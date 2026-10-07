"use client";
import BlackjackTable, { BlackjackBuyIn } from "./BlackjackTable";
import type { BlackjackState } from "@/lib/plugin-games/blackjack";
import { secureDeck } from "@/lib/cards";
import PlayingCard from "./PlayingCard";
import GameDie from "./GameDie";
import { armGameSounds, playGameSound, coinFly } from "@/lib/game-feel";
import StickerPicker from "./StickerPicker";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Heart,
  Star,
  Cloud,
  Flower,
  Cat,
  Leaf,
  Coins,
  Flag,
  Lock,
  KeyRound,
  Square,
  Undo2,
  RotateCcw,
  Trophy,
  Send,
  MapPin,
  Cherry,
  Apple,
  Rabbit,
  Bird,
  Fish,
  Dog,
  PawPrint,
  Sun,
  CloudRain,
  Snowflake,
  Rainbow,
  Cookie,
  CakeSlice,
  TreePine,
  Sprout,
} from "lucide-react";
import { plugin, pluginRegistry } from "@/lib/plugin-games/registry";
import type { Config, GameId, Move, Seat } from "@/lib/plugin-games/types";
import type { LedgerState } from "@/lib/plugin-games/ledger";
import type { LostState } from "@/lib/plugin-games/lostfound";
import type { MazeState } from "@/lib/plugin-games/syncsteps";
import { gameRequest as sendGameRequest } from "@/lib/game-request";
import { tactile } from "@/lib/music";
import { Slot } from "./ArtSlots";
import Celebration from "./Celebration";
import { softSound } from "@/lib/feel";
function LedgerReveal({ state: s, seat }: { state: LedgerState; seat: Seat }) {
  const dialog = useRef<HTMLDialogElement | null>(null),
    [open, setOpen] = useState(false);
  const last = s.history.at(-1);
  useEffect(() => {
    if (!last) return;
    playGameSound(last.winner === seat ? "coin-win" : "lose-sad");
    const from = document.querySelector<HTMLElement>(
        ".ledger-table .plugin-hud span:nth-child(3)",
      ),
      to = document.querySelector<HTMLElement>(
        `.ledger-table .plugin-hud span:nth-child(${last.winner === seat ? 1 : 2})`,
      );
    if (from && to) coinFly(from, to);
    const t = setTimeout(() => {
      if (last.notes.length) {
        setOpen(true);
        dialog.current?.showModal();
        tactile([30, 40, 30]);
        playGameSound("wax-seal");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [s.history.length]);
  return (
    <dialog
      ref={dialog}
      className="ledger-note-reveal"
      onCancel={() => setOpen(false)}
    >
      {open && (
        <>
          <Slot name="ledger-wax-seal" className="ledger-reveal-seal">
            <Heart />
          </Slot>
          <Slot name="ledger-note-paper" className="ledger-note-art" />
          <h2>{last?.winner === seat ? "You won!" : "Partner won!"}</h2>
          <p>{last?.winner === seat ? "Partner’s promise" : "Your promise"}</p>
          {last?.notes.map((note, i) => (
            <blockquote key={i}>{note}</blockquote>
          ))}
          <button
            onClick={() => {
              setOpen(false);
              dialog.current?.close();
            }}
          >
            Keep it in our ledger
          </button>
        </>
      )}
    </dialog>
  );
}
const gameRequest = (
  db: SupabaseClient | null,
  path: string,
  body: Record<string, unknown>,
) => sendGameRequest(db, body, fetch, path);
const labels: Record<string, string> = {
  ante: "Opening bet",
  end: "Session ends",
  minutes: "Time limit (minutes)",
  notes: "Stake Notes",
  payout: "Blackjack payout",
  double: "Double Down",
  peek: "Next-card Peek",
  duel: "Duel type",
  rounds: "Match length",
  wallet: "Starting coins",
  entry: "Entry fee",
  revealBoth: "Reveal both notes",
  size: "Grid size",
  mode: "Play mode",
  hints: "Hints",
  metric: "Distance",
  limit: "Move or guess limit",
  trend: "Warmer or colder",
  control: "Controls",
  level: "Level",
  reveal: "Reveal both maps",
  infinite: "Infinite maze",
  difficulty: "Difficulty",
  daily: "Daily puzzle",
  timer: "Turn timer (seconds)",
  hearts: "Hearts",
  theme: "Item theme",
};
const optionLabel = (v: string | number | boolean) =>
  typeof v === "boolean"
    ? v
      ? "On"
      : "Off"
    : (
        {
          out: "Until someone is out",
          rounds: "Fixed rounds",
          time: "Time limit",
          card: "High-card draw",
          d6: "Six-sided dice",
          d20: "Twenty-sided dice",
          broke: "Until a wallet is empty",
          race: "Race",
          turns: "Take turns",
          relaxed: "Relaxed",
          both: "Warmth and distance",
          temperature: "Warm or cold",
          distance: "Distance only",
          chebyshev: "Diagonals count as one",
          manhattan: "Across and down",
          shared: "Shared control",
          driver: "Driver and navigator",
        } as Record<string, string>
      )[String(v)] || String(v);
type Snapshot = {
  match: {
    id: string;
    game_id: GameId;
    host: string;
    status: string;
    revision: number;
    ready: string[];
    config: Config;
    started_at?: string;
  };
  state: unknown;
  seat: Seat;
  players: { user_id: string; seat: number; seen_at: string }[];
  result: { winner: Seat | null; scores: number[]; reason: string } | null;
  serverTime?: string;
  wallet?: number;
};
export default function PluginGame({
  id,
  db,
  user,
  couple,
  preview,
  startConfig,
  active = true,
  close,
}: {
  id: GameId;
  db: SupabaseClient | null;
  user: string;
  couple: string | null;
  preview: boolean;
  startConfig?: Config;
  active?: boolean;
  close: () => void;
}) {
  const module = plugin(id),
    [config, setConfig] = useState<Config>(
      () =>
        ({
          ...Object.fromEntries(
            Object.entries(module.setup).map(([k, v]) => [k, v[0]]),
          ),
          ...startConfig,
        }) as Config,
    ),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [partnerHere, setPartnerHere] = useState(false),
    [busy, setBusy] = useState(false),
    [previewSeat, setPreviewSeat] = useState<Seat>(0),
    [now, setNow] = useState(Date.now()),
    [words, setWords] = useState(""),
    [note, setNote] = useState(""),
    [coins, setCoins] = useState(1),
    [hidingChoice, setHidingChoice] = useState<number | null>(null),
    [probeCell, setProbeCell] = useState(1),
    [ideas, setIdeas] = useState([
      "I will make you a snack",
      "I will plan our next date",
      "I will give you a long hug",
    ]),
    [idea, setIdea] = useState("");
  const ref = useRef(snapshot),
    lock = useRef(false),
    liveChannel = useRef<RealtimeChannel | null>(null),
    clockOffset = useRef(0);
  ref.current = snapshot;
  const call = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      if (preview) return null;
      const requestedAt = Date.now();
      const r = await gameRequest(db, "/api/game/plugin", {
        action,
        id: ref.current?.match.id,
        ...extra,
      });
      const next = r as unknown as Snapshot;
      if (next.serverTime)
        clockOffset.current =
          Date.parse(next.serverTime) - (requestedAt + Date.now()) / 2;
      return next;
    },
    [db, preview],
  );
  useEffect(() => {
    if (preview) return;
    void gameRequest(db, "/api/game/plugin", { action: "list" })
      .then((data) => {
        const found = (
          data as unknown as { matches: Snapshot["match"][] }
        ).matches.find(
          (x) =>
            x.game_id === id &&
            ["invited", "waiting", "playing"].includes(x.status),
        );
        if (found)
          void gameRequest(db, "/api/game/plugin", {
            action: "get",
            id: found.id,
          }).then((s) => setSnapshot(s as unknown as Snapshot));
      })
      .catch((e) => setError(e.message));
  }, [db, id, preview]);
  useEffect(() => {
    if (!snapshot || preview || !db || !active || !couple) return;
    let cancelled = false;
    const ch = db
      .channel(`couple:${couple}`, {
        config: { private: true, presence: { key: user } },
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "arcade_matches",
          filter: `id=eq.${snapshot.match.id}`,
        },
        () =>
          void call("get")
            .then((s) => {
              if (s)
                setSnapshot((old) =>
                  old?.match.id === s.match.id &&
                  old.match.revision > s.match.revision
                    ? old
                    : s,
                );
            })
            .catch((e) => setError(e.message)),
      )
      .on("presence", { event: "sync" }, () => {
        setPartnerHere(
          Object.entries(ch.presenceState()).some(
            ([uid, states]) =>
              uid !== user &&
              states.some(
                (x) =>
                  (x as unknown as { gameMatch: string }).gameMatch ===
                  snapshot.match.id,
              ),
          ),
        );
      })
      .on("broadcast", { event: "plugin-move" }, ({ payload }) => {
        if (payload?.matchId === ref.current?.match.id)
          void call("get")
            .then((s) => {
              if (s)
                setSnapshot((old) =>
                  old?.match.id === s.match.id &&
                  old.match.revision > s.match.revision
                    ? old
                    : s,
                );
            })
            .catch(() => {});
      });
    liveChannel.current = ch;
    void db.auth.getSession().then(async ({ data }) => {
      if (!data.session || cancelled) return;
      await db.realtime.setAuth(data.session.access_token);
      if (!cancelled)
        ch.subscribe((status) => {
          if (status === "SUBSCRIBED")
            void ch.track({ gameMatch: snapshot.match.id, here: true });
        });
    });
    const t = setInterval(() => {
      if (document.visibilityState === "visible")
        void call("heartbeat")
          .then((s) => {
            if (s)
              setSnapshot((old) =>
                old?.match.id === s.match.id &&
                old.match.revision > s.match.revision
                  ? old
                  : s,
              );
          })
          .catch((e) => setError(e.message));
    }, 10000);
    return () => {
      clearInterval(t);
      cancelled = true;
      liveChannel.current = null;
      setPartnerHere(false);
      void db.removeChannel(ch);
    };
  }, [db, snapshot?.match.id, preview, call, active, couple, user]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + clockOffset.current), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const start = snapshot?.match.started_at;
    if (
      !start ||
      preview ||
      Date.parse(start) <= Date.now() + clockOffset.current
    )
      return;
    const t = setTimeout(
      () => {
        void call("get")
          .then((next) => {
            if (next) setSnapshot(next);
          })
          .catch(() => {});
      },
      Date.parse(start) - Date.now() - clockOffset.current + 80,
    );
    return () => clearTimeout(t);
  }, [snapshot?.match.started_at, preview, call]);
  useEffect(() => {
    if (id !== "ledger" || !snapshot) return;
    const st = snapshot.state as LedgerState,
      deadline =
        st.status === "flipping"
          ? st.flipDeadline
          : st.status === "suspense"
            ? st.revealAt
            : null;
    if (!deadline) return;
    const t = setTimeout(
      () => {
        void act("move", { type: "reveal" });
      },
      Math.max(0, deadline - Date.now() - clockOffset.current) + 40,
    );
    return () => clearTimeout(t);
  }, [id, snapshot?.match.revision, snapshot?.state]);
  useEffect(() => {
    if (!snapshot?.result) return;
    playGameSound(
      snapshot.result.winner === null ||
        snapshot.result.winner === (preview ? previewSeat : snapshot.seat)
        ? "win-fanfare"
        : "lose-sad",
    );
  }, [snapshot?.result?.winner, snapshot?.match.status]);
  useEffect(() => {
    if (!ref.current && startConfig)
      setConfig((old) => ({ ...old, ...startConfig }));
  }, [startConfig]);
  useEffect(() => {
    if (snapshot?.state && id === "ledger") {
      const s = snapshot.state as LedgerState;
      setCoins(
        Math.min(
          s.wallets[preview ? previewSeat : snapshot.seat],
          Math.max(1, Number(s.config.entry) || 1) * 2 ** s.ties,
        ),
      );
    }
  }, [
    previewSeat,
    (snapshot?.state as LedgerState)?.ties,
    (snapshot?.state as LedgerState)?.round,
    id,
    preview,
  ]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ledger-stake-ideas");
      if (saved) {
        const v = JSON.parse(saved);
        if (Array.isArray(v))
          setIdeas(v.filter((x) => typeof x === "string").slice(0, 40));
      }
    } catch {}
  }, []);
  async function act(action: string, move?: Move) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    softSound("tap");
    void tactile(20);
    try {
      if (preview) {
        if (!snapshot) {
          const state = module.createMatch(
            { ...config, words: words.split("\n").filter(Boolean) },
            Math.floor(Math.random() * 2147483647),
          );
          setSnapshot({
            match: {
              id: "preview",
              game_id: id,
              host: "preview-0",
              status: "waiting",
              revision: 0,
              ready: [],
              config,
            },
            state,
            seat: previewSeat,
            players: [],
            result: null,
          });
        } else if (action === "buyin") {
          setSnapshot({
            ...snapshot,
            wallet: 100 - Number(move!.amount),
            state: module.applyMove(
              snapshot.state as never,
              { type: "buyin", amount: move!.amount, serverNow: Date.now() },
              previewSeat,
            ),
          });
        } else if (action === "ready") {
          const ready = [
            ...new Set([...snapshot.match.ready, `preview-${previewSeat}`]),
          ];
          setSnapshot({
            ...snapshot,
            state:
              id === "blackjack" && ready.length === 2
                ? module.applyMove(
                    snapshot.state as never,
                    { type: "start", serverNow: Date.now() },
                    previewSeat,
                  )
                : snapshot.state,
            match: {
              ...snapshot.match,
              ready,
              status: ready.length === 2 ? "playing" : "waiting",
            },
          });
        } else if (action === "cancel") {
          setSnapshot(null);
          close();
        } else if (move) {
          const next = module.applyMove(
              snapshot.state as never,
              {
                ...move,
                serverNow: Date.now(),
                serverDeck: secureDeck(),
                noteId: crypto.randomUUID(),
                serverValues: [
                  1 + Math.floor(Math.random() * 6),
                  1 + Math.floor(Math.random() * 6),
                ],
              },
              previewSeat,
            ),
            done = module.isOver(next as never);
          setSnapshot({
            ...snapshot,
            state: next,
            match: {
              ...snapshot.match,
              status: done ? "done" : "playing",
              revision: snapshot.match.revision + 1,
            },
            result: done ? module.getResult(next as never) : null,
          });
        }
      } else {
        const next = await call(
          action,
          action === "create"
            ? {
                game: id,
                config: { ...config, words: words.split("\n").filter(Boolean) },
              }
            : move
              ? { move, requestId: crypto.randomUUID() }
              : {},
        );
        if (next) {
          setSnapshot((old) =>
            old?.match.id === next.match.id &&
            old.match.revision > next.match.revision
              ? old
              : next,
          );
          if (action === "move")
            void liveChannel.current?.send({
              type: "broadcast",
              event: "plugin-move",
              payload: { matchId: next.match.id },
            });
        }
        if (action === "create" && next)
          void gameRequest(db, "/api/push/media", {
            kind: "challenge",
            id: next.match.id,
          }).catch(() => {});
        if (action === "cancel" || action === "decline") close();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Game could not update.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    setNote("");
    setHidingChoice(null);
  }, [previewSeat]);
  const seat = preview ? previewSeat : snapshot?.seat || 0,
    publicState = snapshot
      ? preview
        ? module.getPublicState(snapshot.state as never, seat)
        : snapshot.state
      : null,
    peer = snapshot?.players.find((p) => p.seat !== seat),
    away = !!peer && now - Date.parse(peer.seen_at) > 15000;
  return (
    <section
      className={`plugin-game plugin-${id}`}
      tabIndex={0}
      aria-label={`${module.title} game`}
      onKeyDown={(e) => {
        if (
          id !== "syncsteps" ||
          snapshot?.match.status !== "playing" ||
          (e.target as HTMLElement).matches("input,textarea,select")
        )
          return;
        const direction = (
          {
            ArrowUp: "up",
            ArrowDown: "down",
            ArrowLeft: "left",
            ArrowRight: "right",
          } as Record<string, string>
        )[e.key];
        if (direction) {
          e.preventDefault();
          void act("move", { type: "move", direction });
        }
      }}
    >
      {snapshot?.match.started_at &&
        Date.parse(snapshot.match.started_at) > now && (
          <div className="game-countdown" role="status">
            <span className="game-ready">
              {Math.ceil((Date.parse(snapshot.match.started_at) - now) / 1000)}
            </span>
            <p>Ready</p>
          </div>
        )}
      <Slot name={`${id}-background`} className="plugin-background" />
      <header>
        <button
          className="text-button"
          onClick={() =>
            snapshot &&
            ["invited", "waiting", "playing"].includes(snapshot.match.status)
              ? void act("cancel")
              : close()
          }
        >
          <ArrowLeft size={18} />
          {snapshot ? "Exit game" : "Back to Play"}
        </button>
        <h1>{module.title}</h1>
      </header>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {preview && snapshot && (
        <div className="demo-seats">
          {[0, 1].map((s) => (
            <button
              key={s}
              aria-pressed={seat === s}
              onClick={() => setPreviewSeat(s as Seat)}
            >
              Player {s + 1}
            </button>
          ))}
        </div>
      )}
      {!snapshot ? (
        <div className="plugin-setup">
          <p>{module.description}</p>
          {id === "syncsteps" && (
            <p>Talk on a call or in person for the full effect.</p>
          )}
          {Object.entries(module.setup).map(([key, values]) => (
            <StickerPicker
              key={key}
              label={labels[key] || key}
              value={config[key] as string | number | boolean}
              options={values}
              format={optionLabel}
              onChange={(value) => setConfig((x) => ({ ...x, [key]: value }))}
            />
          ))}
          {id === "lostfound" && (
            <label>
              Word mode · one entry per line
              <textarea
                value={words}
                maxLength={2500}
                onChange={(e) => setWords(e.target.value)}
              />
            </label>
          )}
          <button disabled={busy} onClick={() => void act("create")}>
            Challenge
          </button>
        </div>
      ) : snapshot.match.status === "invited" ? (
        <div className="plugin-lobby">
          <h2>
            {snapshot.match.host === user
              ? "Waiting for Partner"
              : "A little challenge for you"}
          </h2>
          <p>The host chose these settings.</p>
          <p>
            {Object.entries(snapshot.match.config)
              .filter(([k]) => k !== "words")
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </p>
          {snapshot.match.host !== user && (
            <>
              <button disabled={busy} onClick={() => void act("accept")}>
                Accept
              </button>
              <button className="secondary" onClick={() => void act("decline")}>
                Decline
              </button>
              <button className="text-button" onClick={close}>
                Play later
              </button>
            </>
          )}
        </div>
      ) : snapshot.match.status === "waiting" ? (
        <div className="plugin-lobby">
          <h2>Meet in the lobby</h2>
          <p>Both players must be here and ready.</p>
          {id === "blackjack" && (
            <BlackjackBuyIn
              state={snapshot.state as BlackjackState}
              seat={seat}
              wallet={preview ? 100 : snapshot.wallet || 0}
              busy={busy}
              onBuyIn={(amount) => void act("buyin", { type: "buyin", amount })}
            />
          )}
          <button
            disabled={
              busy ||
              (id === "blackjack" &&
                (snapshot.state as BlackjackState).buyIns.some(
                  (x) => x < 10,
                )) ||
              snapshot.match.ready.includes(preview ? `preview-${seat}` : user)
            }
            onClick={() => void act("ready")}
          >
            I’m ready
          </button>
          <p>{snapshot.match.ready.length}/2 ready</p>
          {!preview && (
            <p role="status">
              {partnerHere
                ? "Partner is here"
                : "Waiting for Partner to join the room"}
            </p>
          )}
        </div>
      ) : ["cancelled", "declined"].includes(snapshot.match.status) ? (
        <p>This session has ended.</p>
      ) : (
        <>
          {away && (
            <div className="notice" role="status">
              Partner is reconnecting ·{" "}
              {Math.max(
                0,
                60 - Math.floor((now - Date.parse(peer!.seen_at)) / 1000),
              )}
              s
              {now - Date.parse(peer!.seen_at) >= 60000 && (
                <button onClick={() => void act("claim")}>Claim win</button>
              )}
              <button
                className="text-button"
                onClick={() =>
                  void call("get").then((s) => {
                    if (s) setSnapshot(s);
                  })
                }
              >
                Wait for Partner
              </button>
              <button
                className="text-button"
                onClick={() => void act("cancel")}
              >
                End match
              </button>
            </div>
          )}
          {id === "blackjack" && (
            <BlackjackTable
              state={publicState as BlackjackState}
              seat={seat}
              busy={busy}
              now={now}
              onMove={(move) => void act("move", move)}
            />
          )}
          {id === "ledger" &&
            publicState &&
            (() => {
              const s = publicState as LedgerState;
              return (
                <div className="ledger-table">
                  <Slot name="ledger-felt-table" className="ledger-felt-art" />
                  <div className="ledger-deck" aria-hidden="true" />
                  <LedgerReveal state={s} seat={seat} />
                  <div className="plugin-hud">
                    <span>
                      <Coins /> You {s.wallets[seat]}
                    </span>
                    <span>Partner {s.wallets[1 - seat]}</span>
                    <span>Pot {s.pot}</span>
                    <span>Round {s.round}</span>
                    {s.ties > 0 && (
                      <strong>Double or nothing! ×{2 ** s.ties}</strong>
                    )}
                  </div>
                  {s.ties > 0 && (
                    <p className="game-turn" role="status">
                      Double or nothing! ×{2 ** s.ties}
                    </p>
                  )}
                  {s.values && (
                    <div className="ledger-values" aria-live="polite">
                      {[seat, 1 - seat].map((p) => (
                        <div key={`${s.round}:${s.ties}:${p}`}>
                          <small>{p === seat ? "You" : "Partner"}</small>
                          {s.config.duel === "card" ? (
                            <PlayingCard
                              card={
                                s.cards?.[p] || { rank: s.values![p], suit: 0 }
                              }
                              faceUp={
                                s.status !== "flipping" ||
                                (p === seat && !!s.flipped?.[p])
                              }
                              dealing
                              onFlip={
                                p === seat &&
                                s.status === "flipping" &&
                                !s.flipped?.[p]
                                  ? () => void act("move", { type: "flip" })
                                  : undefined
                              }
                              winner={
                                (s.status === "reveal" ||
                                  s.status === "done") &&
                                s.winner === p
                              }
                            />
                          ) : (
                            <GameDie
                              value={s.values![p]}
                              sides={s.config.duel === "d20" ? 20 : 6}
                              rolled={
                                s.status !== "flipping" || !!s.flipped?.[p]
                              }
                              onRoll={
                                p === seat
                                  ? () => void act("move", { type: "flip" })
                                  : undefined
                              }
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {s.status === "flipping" && (
                    <div aria-live="polite">
                      <p>
                        {s.flipped?.[seat]
                          ? "Waiting for Partner…"
                          : s.config.duel === "card"
                            ? "Tap your card"
                            : "Shake and roll"}
                      </p>
                      {!s.flipped?.[seat] && (
                        <button
                          disabled={busy}
                          onClick={() => {
                            armGameSounds();
                            playGameSound(
                              s.config.duel === "card"
                                ? "card-flip"
                                : "dice-roll",
                            );
                            void act("move", { type: "flip" });
                          }}
                        >
                          {s.config.duel === "card" ? "Flip" : "Shake and roll"}
                        </button>
                      )}
                    </div>
                  )}
                  {s.status === "suspense" && (
                    <p className="game-turn" role="status">
                      Here comes the reveal…
                    </p>
                  )}
                  {s.status === "betting" ? (
                    s.locked[seat] ? (
                      <div className="ledger-sealed">
                        <Lock size={44} />
                        <h2>Note sealed</h2>
                        <p>Waiting for Partner…</p>
                      </div>
                    ) : (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void act("move", { type: "lock", coins, note });
                        }}
                      >
                        <label>
                          Coins
                          <input
                            type="number"
                            min={Math.min(
                              s.wallets[seat],
                              Math.max(1, Number(s.config.entry) || 1) *
                                2 ** s.ties,
                            )}
                            max={s.wallets[seat]}
                            value={coins}
                            onChange={(e) => setCoins(Number(e.target.value))}
                          />
                        </label>
                        <label>
                          Your promise · optional
                          <textarea
                            maxLength={140}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="A little favor, a kind promise…"
                          />
                        </label>
                        <p>
                          Keep it kind, fun, and doable. Empty note means coins
                          only.
                        </p>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() =>
                            setNote(
                              ideas[Math.floor(Math.random() * ideas.length)] ||
                                "",
                            )
                          }
                        >
                          Stake ideas
                        </button>
                        <label>
                          Add a stake idea
                          <input
                            value={idea}
                            maxLength={140}
                            onChange={(e) => setIdea(e.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="text-button"
                          disabled={!idea.trim()}
                          onClick={() => {
                            const next = [...ideas, idea.trim()].slice(-40);
                            setIdeas(next);
                            localStorage.setItem(
                              "ledger-stake-ideas",
                              JSON.stringify(next),
                            );
                            setIdea("");
                          }}
                        >
                          Save idea
                        </button>
                        <button disabled={busy}>Lock Bet</button>
                      </form>
                    )
                  ) : s.status === "flipping" ||
                    s.status === "suspense" ? null : (
                    <>
                      <h2>
                        {s.winner === seat
                          ? "You won this round"
                          : "Partner won this round"}
                      </h2>
                      {s.revealed[1 - (s.winner ?? 0)].map((n, i) => (
                        <blockquote key={i}>{n}</blockquote>
                      ))}
                      {s.status === "reveal" && (
                        <button
                          onClick={() => {
                            setNote("");
                            void act("move", { type: "next" });
                          }}
                        >
                          Next round
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })()}
          {id === "lostfound" &&
            publicState &&
            (() => {
              const s = publicState as LostState;
              return (
                <div className="treasure-hunt">
                  <h2>
                    {s.status === "hiding"
                      ? s.hidden[seat]
                        ? "Waiting for Partner to hide…"
                        : "Choose your secret treasure"
                      : "Follow the warmth"}
                  </h2>
                  {s.turnExpiresAt && s.status === "hunting" && (
                    <p role="timer">
                      {Math.max(
                        0,
                        Math.ceil((Date.parse(s.turnExpiresAt) - now) / 1000),
                      )}
                      s · {s.turn === seat ? "Your turn" : "Partner’s turn"}
                    </p>
                  )}
                  <div className="treasure-scroll">
                    <div
                      className="treasure-grid"
                      style={{
                        gridTemplateColumns: `repeat(${s.size},minmax(44px,1fr))`,
                      }}
                    >
                      {s.items.map((item, i) => {
                        const g = s.guesses[seat].find((x) => x.cell === i),
                          Icon = (
                            s.config.theme === "words"
                              ? {}
                              : ({
                                  heart: Heart,
                                  star: Star,
                                  cloud: Cloud,
                                  flower: Flower,
                                  cat: Cat,
                                  leaf: Leaf,
                                  peach: Apple,
                                  strawberry: Cherry,
                                  apple: Apple,
                                  cherry: Cherry,
                                  cookie: Cookie,
                                  cake: CakeSlice,
                                  rabbit: Rabbit,
                                  bird: Bird,
                                  fish: Fish,
                                  dog: Dog,
                                  paw: PawPrint,
                                  sun: Sun,
                                  rain: CloudRain,
                                  snow: Snowflake,
                                  rainbow: Rainbow,
                                  tree: TreePine,
                                  sprout: Sprout,
                                  rose: Flower,
                                  cactus: Leaf,
                                } as Record<string, typeof Heart>)
                          )[item];
                        return (
                          <button
                            key={i}
                            disabled={
                              busy ||
                              s.status === "done" ||
                              (s.status === "hiding" && s.hidden[seat]) ||
                              !!g
                            }
                            className={
                              g
                                ? "is-guessed"
                                : hidingChoice === i && s.status === "hiding"
                                  ? "is-chosen"
                                  : ""
                            }
                            aria-label={`Square ${i + 1}: ${item}${g ? `, ${g.temperature}, ${g.distance}` : ""}`}
                            onClick={() =>
                              s.status === "hiding"
                                ? setHidingChoice(i)
                                : void act("move", { type: "guess", cell: i })
                            }
                          >
                            {Icon ? <Icon size={24} /> : <span>{item}</span>}
                            {g && (
                              <small>
                                {s.config.hints === "temperature"
                                  ? g.temperature
                                  : s.config.hints === "distance"
                                    ? g.distance
                                    : `${g.distance} ${g.temperature}`}
                              </small>
                            )}
                            {s.status === "done" && s.treasures.includes(i) && (
                              <Flag size={16} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {s.status === "hiding" && !s.hidden[seat] && (
                    <button
                      disabled={hidingChoice === null || busy}
                      onClick={() =>
                        void act("move", { type: "hide", cell: hidingChoice })
                      }
                    >
                      Hide it
                    </button>
                  )}
                  <ol className="hunt-history">
                    {s.guesses[seat].map((g) => (
                      <li key={g.cell}>
                        Square {g.cell + 1} · {g.temperature} · {g.distance}
                        {s.config.trend ? ` · ${g.trend}` : ""}
                      </li>
                    ))}
                  </ol>
                  {s.status === "hunting" && (
                    <div className="hunt-powerups">
                      <p>Optional power-ups · 5 reward coins each</p>
                      <label>
                        Look near square
                        <input
                          type="number"
                          min={1}
                          max={s.size * s.size}
                          value={probeCell}
                          onChange={(e) => setProbeCell(Number(e.target.value))}
                        />
                      </label>
                      {["sonar", "magnifier", "skip"].map((kind) => (
                        <button
                          key={kind}
                          className="secondary"
                          disabled={busy || s.powerups[seat].includes(kind)}
                          onClick={() =>
                            void act("move", {
                              type: "powerup",
                              kind,
                              cell: probeCell - 1,
                            })
                          }
                        >
                          {kind === "sonar"
                            ? "Sonar ping"
                            : kind === "magnifier"
                              ? "Magnifying glass"
                              : "Skip"}
                        </button>
                      ))}
                      {s.powerHints[seat].map((hint, i) => (
                        <p key={i} role="status">
                          {hint}
                        </p>
                      ))}
                    </div>
                  )}
                  {s.status === "done" && (
                    <div className="hunt-final-trails">
                      {[0, 1].map((p) => (
                        <section key={p}>
                          <h3>
                            {p === seat ? "Your trail" : "Partner’s trail"}
                          </h3>
                          <p>
                            Treasure: square {Number(s.treasures[1 - p]) + 1}
                          </p>
                          <ol>
                            {s.guesses[p].map((g) => (
                              <li key={g.cell}>
                                Square {g.cell + 1} · {g.temperature}
                              </li>
                            ))}
                          </ol>
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          {id === "syncsteps" &&
            publicState &&
            (() => {
              const s = publicState as MazeState,
                map = s.maps[seat];
              return (
                <div className="sync-maze">
                  <div className="plugin-hud">
                    <span>Moves {s.moves}</span>
                    <span>Best {s.optimal}</span>
                    <span>Falls {s.falls[seat]}</span>
                    {Number(s.config.hearts) > 0 && (
                      <span>
                        <Heart size={18} />
                        {Math.max(0, Number(s.config.hearts) - s.falls[seat])}
                      </span>
                    )}
                  </div>
                  <div
                    className="maze-grid"
                    style={{ gridTemplateColumns: `repeat(${map.size},1fr)` }}
                  >
                    {map.tiles.map((tile, i) => (
                      <button
                        key={i}
                        className={`maze-${tile.split(":")[0]}`}
                        aria-label={`Tile ${String.fromCharCode(65 + (i % map.size))}${Math.floor(i / map.size) + 1}, ${tile}`}
                        onClick={() =>
                          void act("move", { type: "ping", cell: i })
                        }
                      >
                        {s.joint.positions[seat] === i ? (
                          <Cat />
                        ) : i === map.exit ? (
                          <Flag />
                        ) : s.joint.blocks[seat].includes(i) ? (
                          <Square />
                        ) : tile === "key" ? (
                          <KeyRound />
                        ) : tile === "door" ? (
                          <Lock />
                        ) : tile === "wall" ? (
                          <Square />
                        ) : tile === "portal" ? (
                          <RotateCcw />
                        ) : (
                          <span>
                            {tile === "ice"
                              ? "Ice"
                              : tile === "pit"
                                ? "Pit"
                                : tile === "sticky"
                                  ? "Sticky"
                                  : ""}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  {s.maps[1 - seat] && (
                    <details className="partner-maze">
                      <summary>Partner’s map</summary>
                      <div
                        className="maze-grid"
                        style={{
                          gridTemplateColumns: `repeat(${map.size},1fr)`,
                        }}
                      >
                        {s.maps[1 - seat].tiles.map((tile, i) => (
                          <span
                            key={i}
                            className={`maze-${tile.split(":")[0]}`}
                            aria-label={`Partner tile ${i + 1}, ${tile}`}
                          >
                            {s.joint.positions[1 - seat] === i ? (
                              <Cat />
                            ) : i === s.maps[1 - seat].exit ? (
                              <Flag />
                            ) : tile === "wall" ? (
                              <Square />
                            ) : (
                              tile
                            )}
                          </span>
                        ))}
                      </div>
                    </details>
                  )}
                  <div className="maze-dpad">
                    {[
                      ["up", ArrowUp],
                      ["left", ArrowLeft],
                      ["down", ArrowDown],
                      ["right", ArrowRight],
                    ].map(([d, I]) => {
                      const Icon = I as typeof ArrowUp;
                      return (
                        <button
                          key={String(d)}
                          aria-label={`Move ${d}`}
                          disabled={busy || snapshot.match.status === "done"}
                          onClick={() =>
                            void act("move", { type: "move", direction: d })
                          }
                        >
                          <Icon />
                        </button>
                      );
                    })}
                  </div>
                  <button
                    className="secondary"
                    onClick={() => void act("move", { type: "undo" })}
                  >
                    <Undo2 size={18} /> Undo
                  </button>
                  <button
                    className="secondary"
                    onClick={() => void act("move", { type: "reset" })}
                  >
                    <RotateCcw size={18} /> Reset
                  </button>
                  <p>
                    {s.pings
                      .map(
                        (p) =>
                          `${p.seat === seat ? "You" : "Partner"}: ${p.coordinate}`,
                      )
                      .join(" · ")}
                  </p>
                  <div className="maze-chat">
                    <div className="maze-quick-chat">
                      {[
                        "Try up",
                        "Try down",
                        "Try left",
                        "Try right",
                        "Wait",
                        "I’m on my flag",
                      ].map((text) => (
                        <button
                          key={text}
                          className="secondary"
                          onClick={() =>
                            void act("move", { type: "chat", text })
                          }
                        >
                          {text}
                        </button>
                      ))}
                    </div>
                    {s.chat.map((m, i) => (
                      <p key={i}>
                        {m.seat === seat ? "You" : "Partner"}: {m.text}
                      </p>
                    ))}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void act("move", { type: "chat", text: note });
                        setNote("");
                      }}
                    >
                      <input
                        aria-label="Message Partner"
                        maxLength={180}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                      <button aria-label="Send game chat">
                        <Send size={18} />
                      </button>
                    </form>
                  </div>
                </div>
              );
            })()}
          {snapshot.result && (
            <section
              className={`plugin-result ${snapshot.result.winner !== null && snapshot.result.winner !== seat ? "game-lose" : ""}`}
              role="status"
            >
              {(snapshot.result.winner === seat ||
                (id === "syncsteps" && snapshot.result.scores[0] > 0) ||
                snapshot.result.winner === null) && <Celebration />}
              <Trophy size={44} />
              <h2>
                {snapshot.result.winner === null
                  ? id === "syncsteps"
                    ? snapshot.result.reason
                    : "A perfect match"
                  : snapshot.result.winner === seat
                    ? "You win!"
                    : "Partner wins!"}
              </h2>
              <p>{snapshot.result.scores.join(" · ")}</p>
              <button
                onClick={() => {
                  setSnapshot(null);
                  setNote("");
                }}
              >
                Rematch
              </button>
            </section>
          )}
        </>
      )}
    </section>
  );
}
export function PluginCards({ open }: { open: (id: GameId) => void }) {
  return (
    <>
      {pluginRegistry.map((m) => (
        <button
          key={m.id}
          className={`cartridge ${m.id}`}
          onClick={() => open(m.id)}
        >
          <div className="cartridge-art">
            <Slot name={m.coverSlot} alt={`${m.title} cover`}>
              {m.id === "blackjack" ? (
                <div className="blackjack-cover-fallback">
                  <span>A ♥</span>
                  <span>K ♠</span>
                  <i>◉</i>
                </div>
              ) : m.id === "ledger" ? (
                <Coins size={90} />
              ) : m.id === "lostfound" ? (
                <MapPin size={90} />
              ) : (
                <Flag size={90} />
              )}
            </Slot>
          </div>
          <div className="cartridge-label">
            <h2>{m.title}</h2>
            <p>{m.description}</p>
            <span>
              Let’s play <ArrowRight size={20} />
            </span>
          </div>
        </button>
      ))}
    </>
  );
}
