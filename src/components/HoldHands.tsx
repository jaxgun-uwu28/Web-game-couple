"use client";
import { useEffect, useRef, useState } from "react";
import type {
  Session,
  SupabaseClient,
  RealtimeChannel,
} from "@supabase/supabase-js";
import { Heart, X, LockKeyhole, Sparkles } from "lucide-react";
import { Slot } from "./ArtSlots";
import { handMerge, RELEASE_GRACE, type Hand } from "@/lib/hold-hands";
import { tactile } from "@/lib/music";
import { gameRequest } from "@/lib/game-request";
type Props = {
  db: SupabaseClient | null;
  session: Session | null;
  couple: string | null;
  preview: boolean;
};
export default function HoldHands(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="hold-entry secondary" onClick={() => setOpen(true)}>
        <Heart />
        <span>Hold hands</span>
        <Heart />
      </button>
      {open && <HoldRoom {...props} close={() => setOpen(false)} />}
    </>
  );
}
function HoldRoom({
  db,
  session,
  couple,
  preview,
  close,
}: Props & { close: () => void }) {
  const [holding, setHolding] = useState(false),
    [partner, setPartner] = useState<Hand | null>(null),
    [connected, setConnected] = useState(preview),
    [now, setNow] = useState(Date.now()),
    [lostAt, setLost] = useState<number | null>(null),
    [locked, setLocked] = useState(false),
    [stats, setStats] = useState({ total: 0, longest: 0, count: 0 }),
    [message, setMessage] = useState(""),
    [summary, setSummary] = useState<number | null>(null);
  const channel = useRef<RealtimeChannel | null>(null),
    since = useRef(0),
    releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    active = useRef(false),
    lastDuration = useRef(0),
    wasMerged = useRef(false),
    wake = useRef<WakeLockSentinel | null>(null),
    focus = useRef<HTMLButtonElement>(null),
    offset = useRef(0);
  const roomDialog = useRef<HTMLDialogElement>(null),
    peerSeen = useRef(false);
  useEffect(() => {
    roomDialog.current?.showModal();
  }, []);
  const myId = session?.user.id || "preview",
    current = useRef<Hand>({ inRoom: true, holding: false, holdingSince: 0 });
  const merged = handMerge(
    { inRoom: connected, holding, holdingSince: since.current },
    partner,
    now,
    lostAt,
  );
  async function persist(value: boolean) {
    if (preview || !db) return;
    const r = await db.rpc("hold_update", { active: value });
    if (r.error)
      setMessage("Our moment could not save. Reopen the room to try again.");
    else setStats(r.data);
  }
  function press() {
    if (!connected) return;
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    if (active.current) return;
    active.current = true;
    since.current = Date.now();
    current.current = {
      inRoom: true,
      holding: true,
      holdingSince: since.current,
    };
    setHolding(true);
    setSummary(null);
    void tactile(12);
    void channel.current?.track({ ...current.current, userId: myId });
    void persist(true);
  }
  function release(immediate = false) {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    const finish = () => {
      active.current = false;
      setHolding(false);
      setLocked(false);
      current.current = { inRoom: true, holding: false, holdingSince: 0 };
      void channel.current?.track({ ...current.current, userId: myId });
      void persist(false);
    };
    if (immediate) finish();
    else releaseTimer.current = setTimeout(finish, RELEASE_GRACE);
  }
  useEffect(() => {
    focus.current?.focus();
    if (preview || !db || !couple) return;
    let gone = false;
    void db.rpc("hold_stats").then((r) => {
      if (!gone && !r.error) setStats(r.data);
    });
    const room = db.channel(`holdhands:${couple}`, {
      config: { private: true, presence: { key: myId } },
    });
    channel.current = room;
    const sync = () => {
      const peers = Object.values(
        room.presenceState(),
      ).flat() as unknown as (Hand & { userId: string })[];
      const peer =
        peers.find((p) => p.userId !== myId && p.holding) ||
        peers.find((p) => p.userId !== myId);
      if (peer) {
        peerSeen.current = true;
        setPartner({
          ...peer,
          holdingSince: peer.holdingSince - offset.current,
        });
        setLost(null);
      } else if (peerSeen.current) setLost((time) => time ?? Date.now());
    };
    room
      .on("presence", { event: "sync" }, sync)
      .on("broadcast", { event: "clock-ping" }, ({ payload }) => {
        if (payload.from !== myId)
          void room.send({
            type: "broadcast",
            event: "clock-pong",
            payload: { to: payload.from, sent: payload.sent, time: Date.now() },
          });
      })
      .on("broadcast", { event: "clock-pong" }, ({ payload }) => {
        if (
          payload.to === myId &&
          typeof payload.sent === "number" &&
          typeof payload.time === "number"
        )
          offset.current = payload.time - (payload.sent + Date.now()) / 2;
      })
      .subscribe((status) => {
        if (gone) return;
        if (status === "SUBSCRIBED") {
          setConnected(true);
          void room.track({ ...current.current, userId: myId });
          void room.send({
            type: "broadcast",
            event: "clock-ping",
            payload: { from: myId, sent: Date.now() },
          });
        } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          setLost((t) => t ?? Date.now());
        }
      });
    return () => {
      gone = true;
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      void db.rpc("hold_update", { active: false });
      void room.untrack();
      void db.removeChannel(room);
      channel.current = null;
    };
  }, [db, couple, myId, preview]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    const heartbeat = setInterval(() => {
      if (active.current) void persist(true);
    }, 2000);
    const visibility = () => {
      if (document.hidden) release(true);
    };
    document.addEventListener("visibilitychange", visibility);
    if ("wakeLock" in navigator)
      void navigator.wakeLock
        .request("screen")
        .then((w) => (wake.current = w))
        .catch(() => {});
    return () => {
      clearInterval(timer);
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", visibility);
      void wake.current?.release();
    };
  }, []);
  useEffect(() => {
    if (lostAt !== null && now - lostAt >= 5000) {
      setPartner(null);
      if (active.current) release(true);
    }
  }, [now, lostAt]);
  useEffect(() => {
    if (merged.together) {
      lastDuration.current = merged.seconds;
      if (!wasMerged.current) void tactile([35, 70, 35]);
    } else if (wasMerged.current) {
      setSummary(lastDuration.current);
      void tactile(12);
      if (preview && lastDuration.current >= 3)
        setStats((s) => ({
          total: s.total + lastDuration.current,
          longest: Math.max(s.longest, lastDuration.current),
          count: s.count + 1,
        }));
    }
    wasMerged.current = merged.together;
  }, [merged.together, merged.seconds]);
  useEffect(() => {
    if (!merged.together) return;
    const beat = setInterval(
      () => {
        void tactile([30, 80, 30]);
      },
      merged.seconds >= 30 ? 1000 : 900,
    );
    return () => {
      clearInterval(beat);
      navigator.vibrate?.(0);
    };
  }, [merged.together, merged.seconds >= 30]);
  async function invite() {
    if (partner?.inRoom && lostAt === null) {
      setMessage("Partner is here.");
      return;
    }
    if (preview) {
      setMessage("Sign in to invite your partner.");
      return;
    }
    try {
      const result = await gameRequest(db, {}, fetch, "/api/push/hold");
      setMessage(
        result.sent > 0
          ? "Your invitation was sent."
          : "Your invitation is saved. Check your partner’s notifications.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Your invitation could not send.",
      );
    }
  }
  return (
    <dialog
      ref={roomDialog}
      className={`hold-room ${merged.together ? "is-merged" : ""} ${holding ? "is-holding" : ""}`}
      aria-label="Hold hands"
      onCancel={close}
    >
      <Slot name="holdhands-background" className="hold-backdrop">
        <span />
      </Slot>
      <header>
        <h1>Hold hands</h1>
        <button
          className="icon-button"
          aria-label="Close Hold Hands"
          onClick={close}
        >
          <X />
        </button>
      </header>
      <div className="hold-stats">
        <span>Longest hold · {stats.longest}s</span>
        <span>
          Total time · {Math.floor(stats.total / 60)}m {stats.total % 60}s
        </span>
      </div>
      <div className="hold-pads">
        <div
          className={`hold-pad partner ${partner?.inRoom && !lostAt ? "is-here" : ""}`}
        >
          <Slot name="holdhands-heart-right">
            <Heart fill="currentColor" />
          </Slot>
          <span>Partner</span>
        </div>
        <span className="hold-tether" aria-hidden="true" />
        <button
          ref={focus}
          className="hold-pad yours"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            press();
          }}
          onPointerUp={() => {
            if (!locked) release();
          }}
          onPointerCancel={() => {
            if (!locked) release();
          }}
          onLostPointerCapture={() => {
            if (!locked) release();
          }}
          onKeyDown={(e) => {
            if (e.key === " " && !e.repeat) {
              e.preventDefault();
              press();
            }
          }}
          onKeyUp={(e) => {
            if (e.key === " ") {
              e.preventDefault();
              if (!locked) release();
            }
          }}
          aria-label="Press and hold your heart"
          aria-pressed={holding}
        >
          <Slot name="holdhands-heart-left">
            <Heart fill="currentColor" />
          </Slot>
          <span>You</span>
        </button>
      </div>
      {merged.together && (
        <div className="hold-merged-art" aria-hidden="true">
          <Slot name="holdhands-merged-heart">
            <Heart fill="currentColor" />
          </Slot>
        </div>
      )}
      <div className="hold-status" role="status" aria-live="polite">
        {merged.reconnecting && partner
          ? "Reconnecting…"
          : merged.together
            ? "Holding hands"
            : holding
              ? "Waiting for Partner to hold on…"
              : partner?.inRoom
                ? "Partner is here, press and hold"
                : "Waiting for Partner…"}
      </div>
      {merged.together && (
        <>
          <span className="hold-timer">
            {Math.floor(merged.seconds / 60)}:
            {String(merged.seconds % 60).padStart(2, "0")}
          </span>
          <p className="hold-milestone">
            <Sparkles />
            {merged.seconds >= 60
              ? "Forever kind of holding"
              : merged.seconds >= 30
                ? "Heart to heart"
                : merged.seconds >= 15
                  ? "Still holding…"
                  : merged.seconds >= 5
                    ? "A little closer"
                    : "Together"}
          </p>
          {merged.seconds >= 60 && merged.seconds < 63 && (
            <div className="wheel-confetti" aria-hidden="true">
              {Array.from({ length: 20 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    left: `${i * 5}%`,
                    background: i % 2 ? "#f7b5cd" : "#f7e6a6",
                    animationDelay: `${(i % 5) * 0.1}s`,
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
      {summary !== null && (
        <p role="status">Our moment · {summary}s together</p>
      )}
      <div className="hold-actions">
        <button
          className="secondary"
          aria-pressed={locked}
          onClick={() => {
            if (locked) {
              release(true);
            } else {
              press();
              setLocked(true);
            }
          }}
        >
          <LockKeyhole size={18} />
          {locked ? "Let go" : "Hold for me"}
        </button>
        <button onClick={() => void invite()}>Hold my hand</button>
      </div>
      {preview && (
        <button
          className="text-button"
          onClick={() =>
            setPartner((p) =>
              p?.holding
                ? null
                : { inRoom: true, holding: true, holdingSince: Date.now() },
            )
          }
        >
          Preview Partner’s hold
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </dialog>
  );
}
export function HoldStats({ db, preview }: Pick<Props, "db" | "preview">) {
  const [stats, set] = useState({ total: 0, longest: 0, count: 0 });
  useEffect(() => {
    if (preview || !db) return;
    let gone = false;
    void db.rpc("hold_stats").then((r) => {
      if (!gone && !r.error) set(r.data);
    });
    return () => {
      gone = true;
    };
  }, [db, preview]);
  return (
    <section className="hold-history">
      <h2>Moments held</h2>
      <p>
        {stats.count} moments · {Math.floor(stats.total / 60)} minutes together
        · Longest {stats.longest}s
      </p>
    </section>
  );
}
