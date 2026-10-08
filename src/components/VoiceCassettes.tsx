"use client";
import { useCosmetics } from "./CosmeticUnlocks";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  Square,
  Trash2,
  Play,
  Pause,
  Heart,
  Sparkles,
  Smile,
  Star,
  Send,
  X,
  RotateCcw,
  Download,
  Lock,
} from "lucide-react";
import { useKeepsakes } from "./Keepsakes";
import {
  normalizePeaks,
  supportedVoiceMime,
  type VoiceMessage,
  type VoiceSend,
} from "@/lib/voice";
import {
  queueMedia,
  queuedMedia,
  flushMedia,
  type QueuedMedia,
} from "@/lib/media-outbox";
import { tactile } from "@/lib/music";
import { gameRequest } from "@/lib/game-request";
import { Slot, useArtworkLibrary } from "./ArtSlots";
const colors = ["#F8C9D8", "#F8DCC4", "#EAE1F5", "#F7E6A6"];
function music(owner: string, active: boolean) {
  window.dispatchEvent(
    new CustomEvent("arcade-audio-focus", { detail: { owner, active } }),
  );
}
function Wave({ peaks, progress = 0 }: { peaks: number[]; progress?: number }) {
  return (
    <span className="cassette-wave" aria-hidden="true">
      {peaks.map((p, i) => (
        <i
          key={i}
          style={{
            height: `${8 + p * 92}%`,
            background: i / 64 < progress ? "var(--cherry)" : "currentColor",
          }}
        />
      ))}
    </span>
  );
}
function Tape({
  row,
  playing = false,
  progress = 0,
}: {
  row: Pick<VoiceMessage, "label" | "color" | "peaks" | "sticker">;
  playing?: boolean;
  progress?: number;
}) {
  return (
    <div
      className={`cassette-tape ${playing ? "is-playing" : ""}`}
      style={{ background: row.color }}
    >
      <Slot name="voice-cassette-body" className="cassette-art" />
      <div className="cassette-label">
        <Slot name="voice-cassette-label" className="cassette-label-art" />
        {row.label || "A little voice, just for you"}
        {row.sticker === "heart" ? (
          <Heart size={18} />
        ) : row.sticker === "sparkle" ? (
          <Sparkles size={18} />
        ) : row.sticker === "laugh" ? (
          <Smile size={18} />
        ) : (
          <Slot name={row.sticker} className="cassette-sticker" />
        )}
      </div>
      <div className="cassette-reels">
        <i style={{ transform: `scale(${1 - progress * 0.3})` }}>
          <Slot name="voice-reel" />
        </i>
        <span />
        <i style={{ transform: `scale(${0.7 + progress * 0.3})` }}>
          <Slot name="voice-reel" />
        </i>
      </div>
      <Wave peaks={row.peaks} />
    </div>
  );
}
export default function VoiceCassettes({
  latest = false,
  replyRequest = 0,
}: {
  latest?: boolean;
  replyRequest?: number;
}) {
  const artwork = useArtworkLibrary();
  const unlocked = useCosmetics();
  const c = useKeepsakes(),
    [rows, setRows] = useState<VoiceMessage[]>([]),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<VoiceMessage | null>(null),
    [recording, setRecording] = useState(false),
    [locked, setLocked] = useState(false),
    [seconds, setSeconds] = useState(0),
    [peaks, setPeaks] = useState<number[]>(Array(64).fill(0.05)),
    [draft, setDraft] = useState<VoiceSend | null>(null),
    [label, setLabel] = useState(""),
    [color, setColor] = useState(colors[0]),
    [sticker, setSticker] = useState("heart"),
    [permission, setPermission] = useState(false),
    [explainer, setExplainer] = useState(false),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(0),
    [filter, setFilter] = useState(false),
    [search, setSearch] = useState(""),
    [collection, setCollection] = useState("all"),
    [page, setPage] = useState(0),
    [maxSeconds, setMaxSeconds] = useState(60),
    [usage, setUsage] = useState({ used: 0, cap: 314572800 });
  const previewUrls = useRef(new Set<string>());
  const recordButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!latest && replyRequest) {
      recordButton.current?.scrollIntoView({ block: "center", behavior: "instant" });
      recordButton.current?.focus({ preventScroll: true });
    }
  }, [latest, replyRequest]);
  useEffect(
    () => () => {
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    ctx = useRef<AudioContext | null>(null),
    frame = useRef(0),
    wanted = useRef(false),
    cancelled = useRef(false),
    chunks = useRef<Blob[]>([]),
    samples = useRef<number[]>([]),
    started = useRef(0),
    gesture = useRef({ x: 0, y: 0 }),
    lockRef = useRef(false),
    owner = useRef("voice-recorder"),
    sending = useRef(false);
  const refresh = useCallback(async () => {
    if (c.preview || !c.db || !c.couple) return;
    const r = await c.db
      .from("voice_messages")
      .select("*")
      .eq("couple_id", c.couple)
      .order("created_at", { ascending: false });
    if (r.error) {
      setError("Cassettes could not load. Retry after connecting.");
      return;
    }
    setRows(r.data as VoiceMessage[]);
    const u = await c.db.rpc("media_usage");
    if (u.data) setUsage(u.data);
    for (const row of r.data || [])
      if (row.sender_id !== c.user && !row.delivered_at)
        await c.db.rpc("voice_action", { i: row.id, a: "delivered" });
  }, [c.db, c.couple, c.user, c.preview]);
  const deliver = useCallback(
    async (item: QueuedMedia) => {
      const p = item.payload as VoiceSend;
      if (!c.db || c.preview || p.user !== c.user || p.couple !== c.couple)
        throw new Error("Sign in to send your cassette.");
      const path = `${p.couple}/${p.user}/${p.id}`,
        r = await c.db.storage.from("voice-notes").upload(path, p.blob, {
          contentType: p.mime.split(";")[0],
          upsert: false,
        });
      if (r.error && !/already exists|duplicate|409/i.test(r.error.message))
        throw r.error;
      const result = await c.db.rpc("send_voice", {
        i: p.id,
        m: p.mime,
        d: p.duration,
        p: p.peaks,
        l: p.label,
        c: p.color,
        s: p.sticker,
      });
      if (result.error) throw result.error;
      void gameRequest(
        c.db,
        { kind: "voice", id: p.id },
        fetch,
        "/api/push/media",
      ).catch(() => {});
    },
    [c.db, c.preview, c.user, c.couple],
  );
  const retry = useCallback(async () => {
    if (c.preview || !navigator.onLine || sending.current) return;
    sending.current = true;
    try {
      await flushMedia(c.user, "voice", deliver);
      await refresh();
      setPending(
        (await queuedMedia()).filter(
          (x) => x.user === c.user && x.kind === "voice",
        ).length,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Waiting to send.");
    } finally {
      sending.current = false;
    }
  }, [c.preview, c.user, deliver, refresh]);
  useEffect(() => {
    void refresh();
    void retry();
    if (!c.db || c.preview) return;
    const ch = c.db
      .channel(`voices:${c.couple}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "voice_messages",
          filter: `couple_id=eq.${c.couple}`,
        },
        () => void refresh(),
      )
      .subscribe();
    window.addEventListener("online", retry);
    return () => {
      void c.db?.removeChannel(ch);
      window.removeEventListener("online", retry);
    };
  }, [c.db, c.couple, c.preview, refresh, retry]);
  function stop(discard = false) {
    wanted.current = false;
    cancelled.current = discard;
    if (recorder.current?.state === "recording") recorder.current.stop();
    setLocked(false);
    lockRef.current = false;
  }
  useEffect(
    () => () => {
      cancelled.current = true;
      wanted.current = false;
      recorder.current?.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(frame.current);
      void ctx.current?.close();
      music(owner.current, false);
    },
    [],
  );
  useEffect(() => {
    const interrupt = () => {
      if (document.hidden && recorder.current?.state === "recording") {
        stop();
        setError("Recording was interrupted. Your preview is ready to check.");
      }
    };
    document.addEventListener("visibilitychange", interrupt);
    return () => document.removeEventListener("visibilitychange", interrupt);
  }, []);
  async function start() {
    if (recording || busy) return;
    if (!permission) {
      setExplainer(true);
      return;
    }
    setError("");
    wanted.current = true;
    cancelled.current = false;
    lockRef.current = false;
    setLocked(false);
    try {
      const mime = supportedVoiceMime(
        (t) =>
          typeof MediaRecorder !== "undefined" &&
          MediaRecorder.isTypeSupported(t),
      );
      if (!mime)
        throw new Error("Voice recording is not supported in this browser.");
      let s: MediaStream;
      try {
        s = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (err) {
        if (
          err instanceof Error &&
          (err.name === "OverconstrainedError" || err.name === "TypeError")
        ) {
          s = await navigator.mediaDevices.getUserMedia({ audio: true });
        } else {
          throw err;
        }
      }
      if (!wanted.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      for (const track of s.getAudioTracks())
        track.onended = () => {
          if (recorder.current?.state === "recording") {
            stop();
            setError(
              "Recording was interrupted. Your preview is ready to check.",
            );
          }
        };
      const r = new MediaRecorder(s, {
        mimeType: mime,
        audioBitsPerSecond: 32000,
      });
      recorder.current = r;
      chunks.current = [];
      samples.current = [];
      const audio = new AudioContext();
      ctx.current = audio;
      const analyser = audio.createAnalyser();
      analyser.fftSize = 256;
      audio.createMediaStreamSource(s).connect(analyser);
      const values = new Uint8Array(analyser.fftSize);
      started.current = performance.now();
      music(owner.current, true);
      tactile(25);
      setRecording(true);
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      r.onstop = () => {
        cancelAnimationFrame(frame.current);
        s.getTracks().forEach((t) => t.stop());
        void audio.close();
        ctx.current = null;
        stream.current = null;
        recorder.current = null;
        music(owner.current, false);
        setRecording(false);
        const duration = Math.round(performance.now() - started.current),
          blob = new Blob(chunks.current, { type: mime });
        if (cancelled.current) return;
        if (duration < 1000) {
          setError("Hold a little longer.");
          return;
        }
        if (blob.size > 524288) {
          setError("That recording is too large. Try a shorter one.");
          return;
        }
        setDraft({
          id: crypto.randomUUID(),
          user: c.user,
          couple: c.couple || "preview",
          blob,
          mime,
          duration: Math.min(duration, 120000),
          peaks: normalizePeaks(samples.current),
          label: "",
          color: colors[0],
          sticker: "heart",
        });
        tactile(25);
      };
      r.start(250);
      let sampledAt = 0;
      const tick = () => {
        const elapsed = (performance.now() - started.current) / 1000;
        setSeconds(Math.floor(elapsed));
        if (elapsed - sampledAt >= 0.1) {
          analyser.getByteTimeDomainData(values);
          const p = Math.min(
            1,
            Math.sqrt(
              values.reduce((n, x) => n + ((x - 128) / 128) ** 2, 0) /
                values.length,
            ) * 4,
          );
          samples.current.push(p);
          setPeaks(normalizePeaks(samples.current.slice(-64)));
          sampledAt = elapsed;
        }
        if (elapsed >= maxSeconds) {
          stop();
          return;
        }
        frame.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      wanted.current = false;
      const isDenied =
        e instanceof Error &&
        (e.name === "NotAllowedError" ||
          /permission denied|not allowed/i.test(e.message));
      setError(
        isDenied
          ? "Microphone access was denied. In your Android app or browser settings, allow microphone access, then try again."
          : e instanceof Error
            ? e.message
            : "Microphone unavailable. Allow microphone access in your browser or Android app settings.",
      );
      music(owner.current, false);
    }
  }
  async function send() {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const p = { ...draft, label: label.slice(0, 30), color, sticker };
      if (c.preview) {
        const url = URL.createObjectURL(p.blob);
        previewUrls.current.add(url);
        setRows((prev) => [
          {
            id: p.id,
            couple_id: "preview",
            sender_id: c.user,
            storage_path: url,
            mime: p.mime,
            duration_ms: p.duration,
            peaks: p.peaks,
            label: p.label,
            color: p.color,
            sticker: p.sticker,
            created_at: new Date().toISOString(),
            delivered_at: null,
            listened_at: null,
            favorite_by: [],
            reactions: {},
          },
          ...prev,
        ]);
      } else {
        await queueMedia({
          id: p.id,
          user: c.user,
          couple: p.couple,
          kind: "voice",
          created: Date.now(),
          payload: p,
        });
        setPending((x) => x + 1);
        void retry();
      }
      setDraft(null);
      setLabel("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save your cassette.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function action(row: VoiceMessage, a: string, v = "") {
    if (c.preview) {
      setRows((prev) =>
        prev.map((x) =>
          x.id !== row.id
            ? x
            : a === "favorite"
              ? {
                  ...x,
                  favorite_by: x.favorite_by.includes(c.user)
                    ? x.favorite_by.filter((y) => y !== c.user)
                    : [...x.favorite_by, c.user],
                }
              : a === "react"
                ? { ...x, reactions: { ...x.reactions, [c.user]: v } }
                : x,
        ),
      );
      return true;
    }
    const r = await c.db?.rpc("voice_action", { i: row.id, a, v });
    if (r?.error) {
      setError(r.error.message);
      return false;
    }
    void refresh();
    return true;
  }
  async function backup() {
    const JSZip = (await import("jszip")).default,
      zip = new JSZip();
    for (const row of rows) {
      const url = c.preview
        ? row.storage_path
        : (
            await c.db?.storage
              .from("voice-notes")
              .createSignedUrl(row.storage_path, 300)
          )?.data?.signedUrl;
      if (url) {
        const blob = await (await fetch(url)).blob();
        zip.file(
          `${row.id}.${row.mime.includes("mp4") ? "m4a" : row.mime.includes("ogg") ? "ogg" : "webm"}`,
          blob,
        );
      }
    }
    const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" })),
      a = document.createElement("a");
    a.href = url;
    a.download = "our-cassettes.zip";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const incoming = rows.find(row => row.sender_id !== c.user);
  if (latest)
    return incoming ? (
      <section className="latest-cassette">
        <h2>A voice from your person</h2>
        <button className="cassette-open" onClick={() => setSelected(incoming)}>
          <Tape row={incoming} />
        </button>
        {selected && (
          <CassettePlayer
            row={selected}
            close={() => setSelected(null)}
            action={action}
          />
        )}
      </section>
    ) : null;
  const matching = rows.filter(
    (x) =>
      (!filter || x.favorite_by.includes(c.user)) &&
      (collection === "all" ||
        (collection === "sent"
          ? x.sender_id === c.user
          : x.sender_id !== c.user)) &&
      (!search.trim() ||
        (x.label || "A little voice, just for you")
          .toLowerCase()
          .includes(search.trim().toLowerCase())),
  );
  const pageCount = Math.max(1, Math.ceil(matching.length / 6));
  const currentPage = Math.min(page, pageCount - 1);
  return (
    <section className="voice-shelf">
      <Slot name="voice-background" className="voice-backdrop" />
      <header>
        <h2>Our cassettes</h2>
        <button
          className="secondary"
          aria-pressed={filter}
          onClick={() => {
            setFilter(!filter);
            setPage(0);
          }}
        >
          <Star size={18} /> Favorites
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {pending > 0 && (
        <p role="status">
          {pending} waiting to send{" "}
          <button className="text-button" onClick={() => void retry()}>
            Retry
          </button>
        </p>
      )}
      {!draft && (
        <div className={`voice-recorder ${recording ? "is-recording" : ""}`}>
          <Wave peaks={peaks} />
          <span className="voice-time">
            {recording
              ? `${seconds}s${seconds >= maxSeconds - 10 ? " · Finishing soon" : ""}`
              : "Hold to record"}
          </span>
          <button
            className="record-pad"
            ref={recordButton}
            aria-label="Hold to record a cassette"
            onPointerDown={(e) => {
              gesture.current = { x: e.clientX, y: e.clientY };
              e.currentTarget.setPointerCapture(e.pointerId);
              void start();
            }}
            onPointerMove={(e) => {
              if (!wanted.current || lockRef.current) return;
              if (e.clientX < gesture.current.x - 75) stop(true);
              else if (e.clientY < gesture.current.y - 75) {
                lockRef.current = true;
                setLocked(true);
                tactile(20);
              }
            }}
            onPointerUp={() => {
              if (!lockRef.current) stop();
            }}
            onPointerCancel={() => {
              if (!lockRef.current) stop();
            }}
            onKeyDown={(e) => {
              if (e.key === " " && !e.repeat) {
                e.preventDefault();
                void start();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " " && !lockRef.current) {
                e.preventDefault();
                stop();
              }
            }}
          >
            <Slot name="voice-record-button">
              <Mic size={32} />
            </Slot>
          </button>
          {locked && (
            <>
              <span>
                <Lock size={16} /> Recording hands-free
              </span>
              <button onClick={() => stop()}>
                <Square size={18} /> Stop
              </button>
            </>
          )}
          {recording && (
            <button className="text-button" onClick={() => stop(true)}>
              <Trash2 size={18} /> Cancel
            </button>
          )}
          <p>Slide up to lock · slide left to cancel</p>
          <label>
            Recording limit{" "}
            <select
              value={maxSeconds}
              disabled={recording}
              onChange={(e) => setMaxSeconds(Number(e.target.value))}
            >
              <option value={30}>30 seconds</option>
              <option value={60}>1 minute</option>
              <option value={120}>2 minutes</option>
            </select>
          </label>
        </div>
      )}
      {draft && (
        <div className="cassette-draft">
          <Tape row={{ ...draft, label, color, peaks: draft.peaks, sticker }} />
          <label>
            Cassette sticker
            <select
              value={sticker}
              onChange={(e) => setSticker(e.target.value)}
            >
              {[
                "heart",
                "sparkle",
                "laugh",
                ...Object.entries(artwork)
                  .filter(
                    ([, a]) =>
                      a.kind === "image" && a.original?.includes("/stickers/"),
                  )
                  .map(([name]) => name),
              ].map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <VoicePreview blob={draft.blob} />
          <label>
            Cassette label
            <input
              maxLength={30}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <div className="cassette-colors">
            {colors
              .filter((x, i) => i === 0 || unlocked.includes("cassette-colors"))
              .map((x, i) => (
                <button
                  key={x}
                  style={{ background: x }}
                  aria-label={`Cassette color ${i + 1}`}
                  aria-pressed={color === x}
                  onClick={() => setColor(x)}
                />
              ))}
          </div>
          <button disabled={busy} onClick={() => void send()}>
            <Send size={18} />{" "}
            {navigator.onLine ? "Send" : "Save to send later"}
          </button>
          <button className="secondary" onClick={() => setDraft(null)}>
            <RotateCcw size={18} /> Re-record
          </button>
        </div>
      )}
      <div className="cassette-library-tools">
        <label>
          Find a cassette
          <input
            type="search"
            value={search}
            placeholder="Search labels"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <div role="group" aria-label="Cassette collection">
          {[
            ["all", "All"],
            ["sent", "Sent"],
            ["received", "Received"],
          ].map(([value, text]) => (
            <button
              key={value}
              className={collection === value ? "" : "secondary"}
              aria-pressed={collection === value}
              onClick={() => {
                setCollection(value);
                setPage(0);
              }}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
      <div className="cassette-grid cassette-library">
        {matching.slice(currentPage * 6, currentPage * 6 + 6).map((row, i) => (
          <article
            key={row.id}
            className="cassette-card"
            style={{ rotate: `${i % 2 ? 2 : -2}deg` }}
          >
            <button
              className="cassette-open"
              onClick={() => setSelected(row)}
              aria-label={`Play ${row.label || "cassette"}`}
            >
              <Tape row={row} />
              {row.sender_id !== c.user && !row.listened_at && (
                <span className="cassette-new">New</span>
              )}
            </button>
            <p>
              {row.sender_id === c.user ? "You" : "Partner"} ·{" "}
              {new Date(row.created_at).toLocaleDateString()}{" "}
              {row.sender_id === c.user &&
                (row.listened_at ? (
                  <span className="cassette-listened">
                    <Heart size={16} fill="currentColor" /> Listened
                  </span>
                ) : row.delivered_at ? (
                  "Delivered"
                ) : (
                  "Sent"
                ))}
            </p>
            <button
              className="text-button"
              aria-label="Favorite cassette"
              aria-pressed={row.favorite_by.includes(c.user)}
              onClick={() => void action(row, "favorite")}
            >
              <Star size={18} />
            </button>
            {row.sender_id === c.user && (
              <button
                className="text-button"
                aria-label="Delete cassette"
                onClick={() => {
                  if (!confirm("Delete this cassette permanently?")) return;
                  void c.run(async () => {
                    if (!c.preview) {
                      const r = await c
                        .db!.storage.from("voice-notes")
                        .remove([row.storage_path]);
                      if (r.error) throw r.error;
                      const d = await c
                        .db!.from("voice_messages")
                        .delete()
                        .eq("id", row.id);
                      if (d.error) throw d.error;
                    }
                    setRows((x) => x.filter((y) => y.id !== row.id));
                  });
                }}
              >
                <Trash2 size={18} />
              </button>
            )}
          </article>
        ))}
      </div>
      {matching.length > 0 && (
        <nav className="cassette-pagination" aria-label="Cassette pages">
          <button
            className="secondary"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          <span role="status">
            {currentPage + 1} / {pageCount} · {matching.length} cassettes
          </span>
          <button
            className="secondary"
            disabled={currentPage + 1 >= pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </nav>
      )}
      {rows.length > 0 && matching.length === 0 && (
        <p role="status">No cassettes match. Try another filter or label.</p>
      )}
      {rows.length === 0 && <p>No cassettes yet. Record your first one.</p>}
      <button
        className="text-button"
        disabled={!rows.length}
        onClick={() => void backup().catch((e) => setError(e.message))}
      >
        <Download size={18} /> Download my cassettes
      </button>
      <p>
        {Math.round(usage.used / 1048576)} MB of{" "}
        {Math.round(usage.cap / 1048576)} MB
      </p>
      <button
        className="text-button"
        onClick={() => {
          const old = rows.filter(
            (r) =>
              r.sender_id === c.user &&
              Date.now() - Date.parse(r.created_at) > 90 * 86400000 &&
              !r.favorite_by.includes(c.user),
          );
          if (!old.length) {
            setError("No older cassettes to remove.");
            return;
          }
          if (
            !confirm(
              `Permanently remove ${old.length} of your cassettes older than 90 days? Favorites are kept.`,
            )
          )
            return;
          void c.run(async () => {
            if (!c.preview) {
              const files = await c
                .db!.storage.from("voice-notes")
                .remove(old.map((r) => r.storage_path));
              if (files.error) throw files.error;
              const removed = await c
                .db!.from("voice_messages")
                .delete()
                .in(
                  "id",
                  old.map((r) => r.id),
                )
                .eq("sender_id", c.user);
              if (removed.error) throw removed.error;
            }
            for (const row of old)
              if (row.storage_path.startsWith("blob:")) {
                URL.revokeObjectURL(row.storage_path);
                previewUrls.current.delete(row.storage_path);
              }
            setRows((current) =>
              current.filter((r) => !old.some((x) => x.id === r.id)),
            );
            await refresh();
          });
        }}
      >
        Remove my older cassettes
      </button>
      {explainer && (
        <dialog open className="voice-permission">
          <h3>A little voice, just for you</h3>
          <p>
            Allow your microphone when asked. Hold the record button to start,
            then release to preview.
          </p>
          <button
            onClick={() => {
              setPermission(true);
              setExplainer(false);
            }}
          >
            Got it
          </button>
          <button className="secondary" onClick={() => setExplainer(false)}>
            Close
          </button>
        </dialog>
      )}
      {selected && (
        <CassettePlayer
          row={selected}
          close={() => setSelected(null)}
          action={action}
        />
      )}
    </section>
  );
}
function VoicePreview({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
      music("voice-preview", false);
    };
  }, [blob]);
  return (
    <audio
      controls
      src={url}
      aria-label="Preview recording"
      onPlay={() => music("voice-preview", true)}
      onPause={() => music("voice-preview", false)}
      onEnded={() => music("voice-preview", false)}
    />
  );
}
function CassettePlayer({
  row,
  close,
  action,
}: {
  row: VoiceMessage;
  close: () => void;
  action: (r: VoiceMessage, a: string, v?: string) => Promise<boolean>;
}) {
  const c = useKeepsakes(),
    audio = useRef<HTMLAudioElement | null>(null),
    dialog = useRef<HTMLDialogElement | null>(null),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [playing, setPlaying] = useState(false),
    [progress, setProgress] = useState(0),
    [displayPeaks, setDisplayPeaks] = useState(() =>
      normalizePeaks(row.peaks || []),
    ),
    [rate, setRate] = useState(1),
    [loop, setLoop] = useState(false),
    [hearted, setHearted] = useState(row.reactions?.[c.user] === "heart"),
    [heartPulse, setHeartPulse] = useState(0),
    owner = useRef(`cassette-${row.id}`),
    heard = useRef(Boolean(row.listened_at));
  const markHeard = () => {
    if (!heard.current) {
      heard.current = true;
      void action(row, "listened")
        .then((ok) => {
          if (!ok) heard.current = false;
        })
        .catch(() => {
          heard.current = false;
        });
    }
  };
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    void (async () => {
      const r = c.preview
        ? { data: { signedUrl: row.storage_path }, error: null }
        : await c
            .db!.storage.from("voice-notes")
            .createSignedUrl(row.storage_path, 600);
      if (!active) return;
      if (r.error || !r.data) setError("Cassette could not open. Try again.");
      else setUrl(r.data.signedUrl);
    })();
    return () => {
      active = false;
      music(owner.current, false);
    };
  }, [c.db, c.preview, row.storage_path]);
  useEffect(() => {
    if (
      !url ||
      (row.peaks?.length === 64 &&
        row.peaks.every((x) => Number.isFinite(x) && x >= 0 && x <= 1))
    )
      return;
    let alive = true;
    const abort = new AbortController(),
      decoder = new AudioContext();
    void fetch(url, { signal: abort.signal })
      .then((r) => r.arrayBuffer())
      .then((b) => decoder.decodeAudioData(b))
      .then((buffer) => {
        if (!alive) return;
        const samples = buffer.getChannelData(0),
          peaks = Array.from({ length: 64 }, (_, i) => {
            let max = 0;
            const start = Math.floor((i * samples.length) / 64),
              end = Math.floor(((i + 1) * samples.length) / 64);
            for (let j = start; j < end; j++)
              max = Math.max(max, Math.abs(samples[j]));
            return max;
          });
        setDisplayPeaks(normalizePeaks(peaks));
      })
      .catch(() => {})
      .finally(() => void decoder.close().catch(() => {}));
    return () => {
      alive = false;
      abort.abort();
      void decoder.close().catch(() => {});
    };
  }, [url, row.peaks]);
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: row.label || "A little cassette",
      artist: row.sender_id === c.user ? "You" : "Partner",
    });
    navigator.mediaSession.setActionHandler(
      "play",
      () => void audio.current?.play(),
    );
    navigator.mediaSession.setActionHandler("pause", () =>
      audio.current?.pause(),
    );
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      if (audio.current)
        audio.current.currentTime = Math.max(0, audio.current.currentTime - 5);
    });
    navigator.mediaSession.setActionHandler("seekforward", () => {
      if (audio.current)
        audio.current.currentTime = Math.min(
          row.duration_ms / 1000,
          audio.current.currentTime + 5,
        );
    });
    return () => {
      for (const a of [
        "play",
        "pause",
        "seekbackward",
        "seekforward",
      ] as MediaSessionAction[])
        navigator.mediaSession.setActionHandler(a, null);
      navigator.mediaSession.metadata = null;
    };
  }, [row, c.user]);
  return (
    <dialog
      ref={dialog}
      className="cassette-player"
      aria-label="Cassette player"
      onCancel={close}
    >
      <button
        className="icon-button"
        aria-label="Close cassette"
        onClick={close}
      >
        <X />
      </button>
      <Tape row={row} playing={playing} progress={progress} />
      {error && <p role="alert">{error}</p>}
      <audio
        ref={audio}
        src={url}
        loop={loop}
        onPlay={() => {
          setPlaying(true);
          music(owner.current, true);
        }}
        onPause={() => {
          setPlaying(false);
          music(owner.current, false);
        }}
        onTimeUpdate={() => {
          const a = audio.current;
          if (a) {
            setProgress(a.currentTime / (row.duration_ms / 1000));
            if (a.currentTime >= Math.min(3, (row.duration_ms / 1000) * 0.8))
              markHeard();
          }
        }}
        onEnded={() => {
          setPlaying(false);
          music(owner.current, false);
          markHeard();
        }}
        onError={() =>
          setError("Playback stopped. Close and reopen this cassette.")
        }
        preload="metadata"
      />
      <Wave peaks={displayPeaks} progress={progress} />
      <label>
        Seek recording
        <input
          type="range"
          min={0}
          max={row.duration_ms / 1000}
          step={0.1}
          value={(progress * row.duration_ms) / 1000}
          onChange={(e) => {
            if (audio.current)
              audio.current.currentTime = Number(e.target.value);
          }}
        />
      </label>
      <div className="cassette-controls">
        <button
          aria-label="Back five seconds"
          onClick={() => {
            if (audio.current)
              audio.current.currentTime = Math.max(
                0,
                audio.current.currentTime - 5,
              );
          }}
        >
          -5s
        </button>
        <button
          disabled={!url}
          aria-label={playing ? "Pause cassette" : "Play cassette"}
          onClick={() => {
            if (playing) audio.current?.pause();
            else
              void audio.current
                ?.play()
                .catch(() => setError("Tap play to try again."));
          }}
        >
          {playing ? <Pause /> : <Play />}
        </button>
        <button
          aria-label="Forward five seconds"
          onClick={() => {
            if (audio.current)
              audio.current.currentTime = Math.min(
                row.duration_ms / 1000,
                audio.current.currentTime + 5,
              );
          }}
        >
          +5s
        </button>
        <select
          aria-label="Playback speed"
          value={rate}
          onChange={(e) => {
            setRate(Number(e.target.value));
            if (audio.current)
              audio.current.playbackRate = Number(e.target.value);
          }}
        >
          {[1, 1.25, 1.5].map((x) => (
            <option key={x} value={x}>
              {x}×
            </option>
          ))}
        </select>
      </div>
      <label>
        <input
          type="checkbox"
          checked={loop}
          onChange={(e) => setLoop(e.target.checked)}
        />{" "}
        Play on a loop
      </label>
      <p>
        {Math.round((progress * row.duration_ms) / 1000)} /{" "}
        {Math.round(row.duration_ms / 1000)} seconds
      </p>
      <div className="cassette-reactions">
        <button aria-label="Heart this cassette" aria-pressed={hearted} className="cassette-heart" onClick={async () => {
          if (await action(row, "react", "heart")) { setHearted(true); setHeartPulse(n=>n+1); tactile(20); }
        }}><Heart key={heartPulse} size={24} fill={hearted ? "currentColor" : "none"} className={heartPulse ? "cassette-heart-pop" : ""} /></button>
        <button
          onClick={() => {
            close();
            window.dispatchEvent(new CustomEvent("arcade-open-notes", { detail: { record: true } }));
          }}
        >
          Send one back
        </button>
      </div>
    </dialog>
  );
}
