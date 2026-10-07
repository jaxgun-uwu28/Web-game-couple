"use client";
import { useCosmetics } from "./CosmeticUnlocks";
import { gameRequest } from "@/lib/game-request";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mail,
  Heart,
  Star,
  Sparkles,
  Lock,
  X,
  Camera,
  ImagePlus,
  Pen,
  Move,
  Type,
  Stamp,
  Undo2,
  Redo2,
  Send,
  Download,
  RotateCcw,
  Trash2,
  Copy,
  ArrowUp,
  FlipHorizontal,
  Flower2,
  Ribbon,
  MessageCircleHeart,
  Gift,
  Smile,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useKeepsakes } from "./Keepsakes";
import { Slot, useArtworkLibrary } from "./ArtSlots";
import {
  blankPostcard,
  drawPostcard,
  exportCard,
  cardFilters,
  type PostcardDoc,
  type Point,
  type Sticker,
} from "@/lib/postcard";
import Celebration from "./Celebration";
import { softSound } from "@/lib/feel";
import { queueMedia, flushMedia, type QueuedMedia } from "@/lib/media-outbox";
import { compressPhoto } from "@/lib/keepsakes";
import { tactile } from "@/lib/music";
type Envelope = {
  id: string;
  sender_id: string;
  envelope_color: string;
  stamp_id: string;
  unlock_at: string | null;
  created_at: string;
  opened_at: string | null;
  favorite_by: string[];
  reactions: Record<string, string>;
};
type Card = Envelope & {
  front_path: string;
  back_path: string;
  message: string;
  layers: PostcardDoc;
};
type SendCard = {
  id: string;
  doc: PostcardDoc;
  front: Blob;
  back: Blob;
  photo: Blob | null;
  unlock: string;
  envelope: string;
  user: string;
  couple: string;
};
const swatches = ["#FFF8F3", "#F8C9D8", "#F8DCC4", "#EAE1F5", "#F7E6A6"];
const envelopeColumns =
  "id,sender_id,envelope_color,stamp_id,unlock_at,created_at,opened_at,favorite_by,reactions";
export default function Postcards({
  shortcut = false,
}: {
  shortcut?: boolean;
}) {
  const c = useKeepsakes(),
    [rows, setRows] = useState<Envelope[]>([]),
    [editor, setEditor] = useState(false),
    [selected, setSelected] = useState<Card | null>(null),
    [error, setError] = useState(""),
    [wall, setWall] = useState(false),
    [collection, setCollection] = useState("All"),
    [limit, setLimit] = useState(12),
    [replyTo, setReplyTo] = useState<Card | null>(null),
    local = useRef(new Map<string, Card>()),
    flushing = useRef(false);
  useEffect(
    () => () => {
      for (const row of local.current.values()) {
        URL.revokeObjectURL(row.front_path);
        URL.revokeObjectURL(row.back_path);
      }
    },
    [],
  );
  const load = useCallback(async () => {
    if (c.preview || !c.db) return;
    const r = await c.db
      .from("postcards")
      .select(envelopeColumns)
      .eq("couple_id", c.couple)
      .order("created_at", { ascending: false });
    if (r.error) {
      setError("Postcard box could not load. Try again.");
      return;
    }
    setRows(r.data as Envelope[]);
  }, [c.db, c.couple, c.preview]);
  const deliver = useCallback(
    async (item: QueuedMedia) => {
      const p = item.payload as SendCard;
      if (!c.db || p.user !== c.user || p.couple !== c.couple)
        throw new Error("Sign in to send this postcard.");
      const base = `${p.couple}/${p.user}/${p.id}`,
        doc = { ...p.doc };
      for (const [name, blob] of [
        ["front", p.front],
        ["back", p.back],
        ["photo", p.photo],
      ] as const) {
        if (!blob) continue;
        const r = await c.db.storage
          .from("postcards")
          .upload(`${base}/${name}.webp`, blob, {
            contentType: "image/webp",
            upsert: false,
          });
        if (r.error && !/already exists|duplicate|409/i.test(r.error.message))
          throw r.error;
      }
      if (p.photo) doc.photoPath = `${base}/photo.webp`;
      const r = await c.db.rpc("send_postcard", {
        i: p.id,
        doc,
        msg: p.doc.message,
        color: p.envelope,
        stamp: p.doc.stamp,
        unlock: p.unlock ? new Date(p.unlock).toISOString() : null,
      });
      if (r.error) throw r.error;
      void gameRequest(
        c.db,
        { kind: "postcard", id: p.id },
        fetch,
        "/api/push/media",
      ).catch(() => {});
    },
    [c.db, c.user, c.couple],
  );
  const retry = useCallback(async () => {
    if (c.preview || flushing.current || !navigator.onLine) return;
    flushing.current = true;
    try {
      await flushMedia(c.user, "postcard", deliver);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your postcard is waiting to send.",
      );
    } finally {
      flushing.current = false;
    }
  }, [c.preview, c.user, deliver, load]);
  useEffect(() => {
    void load();
    void retry();
    window.addEventListener("online", retry);
    const ch =
      !c.preview && c.db
        ? c.db
            .channel(`postcards:${c.couple}`)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "postcard_envelopes",
                filter: `couple_id=eq.${c.couple}`,
              },
              () => void load(),
            )
            .subscribe()
        : null;
    return () => {
      window.removeEventListener("online", retry);
      if (ch) void c.db?.removeChannel(ch);
    };
  }, [c.db, c.couple, c.preview, load, retry]);
  async function open(row: Envelope) {
    setError("");
    try {
      if (c.preview) {
        const r = local.current.get(row.id);
        if (r) setSelected(r);
        return;
      }
      const r = await c.db!.rpc("open_postcard", { i: row.id });
      if (r.error) throw r.error;
      setSelected(r.data as Card);
      void load();
      tactile(30);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "This postcard is still sealed.",
      );
    }
  }
  async function sent(p: SendCard) {
    if (c.preview) {
      const row: Card = {
        id: p.id,
        sender_id: c.user,
        envelope_color: p.envelope,
        stamp_id: p.doc.stamp,
        unlock_at: p.unlock || null,
        created_at: new Date().toISOString(),
        opened_at: null,
        favorite_by: [],
        reactions: {},
        front_path: URL.createObjectURL(p.front),
        back_path: URL.createObjectURL(p.back),
        message: p.doc.message,
        layers: { ...p.doc, photoPath: p.photo ? "preview-photo" : undefined },
      };
      local.current.set(row.id, row);
      setRows((x) => [row, ...x]);
    } else {
      await queueMedia({
        id: p.id,
        user: c.user,
        couple: p.couple,
        kind: "postcard",
        created: Date.now(),
        payload: p,
      });
      void retry();
    }
    setEditor(false);
  }
  return (
    <section className="postcard-box">
      <header>
        <h2>{shortcut ? "Send a little postcard" : "Our postcard box"}</h2>
        <button onClick={() => setEditor(true)}>
          <Mail size={18} /> Send a postcard
        </button>
        {(!shortcut ||
          rows.some((r) => r.sender_id !== c.user && !r.opened_at)) && (
          <button
            className="secondary"
            aria-pressed={wall}
            onClick={() => setWall(!wall)}
          >
            <Star size={18} /> {wall ? "All postcards" : "Pin favorites"}
          </button>
        )}
      </header>
      {!shortcut && (
        <>
          <div className="postcard-box-art" aria-hidden="true">
            <Slot name="postcard-box">
              <span>✉ ♥ ✉</span>
            </Slot>
          </div>
          <div className="sticker-picker">
            <div>
              {["All", "Unread", "Favorites"].map((x) => (
                <button
                  key={x}
                  aria-pressed={collection === x}
                  className={collection === x ? "selected" : ""}
                  onClick={() => {
                    setCollection(x);
                    setLimit(12);
                  }}
                >
                  {x}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {(!shortcut ||
        rows.some((r) => r.sender_id !== c.user && !r.opened_at)) && (
        <div className={`envelope-grid ${wall ? "postcard-wall" : ""}`}>
          {rows
            .filter((r) =>
              shortcut
                ? r.sender_id !== c.user && !r.opened_at
                : (!wall || r.favorite_by.includes(c.user)) &&
                  (collection !== "Unread" ||
                    (!r.opened_at && r.sender_id !== c.user)) &&
                  (collection !== "Favorites" ||
                    r.favorite_by.includes(c.user)),
            )
            .slice(0, shortcut ? 3 : limit)
            .map((r, i) => {
              const locked =
                !!r.unlock_at &&
                new Date(r.unlock_at).getTime() > Date.now() &&
                r.sender_id !== c.user;
              return (
                <button
                  key={r.id}
                  className="postcard-envelope"
                  style={{
                    background: r.envelope_color,
                    rotate: wall ? `${i % 2 ? 3 : -3}deg` : undefined,
                  }}
                  onClick={() => void open(r)}
                  aria-label={
                    locked
                      ? "Sealed postcard"
                      : `Open postcard from ${r.sender_id === c.user ? "You" : "Partner"}`
                  }
                >
                  <span className="envelope-flap" />
                  <span className="envelope-seal">
                    {locked ? <Lock size={24} /> : <Heart size={24} />}
                  </span>
                  {!r.opened_at && r.sender_id !== c.user && (
                    <span className="envelope-new">New</span>
                  )}
                  <span className="envelope-date">
                    {locked
                      ? `Opens ${new Date(r.unlock_at!).toLocaleDateString()}`
                      : new Date(r.created_at).toLocaleDateString()}
                  </span>
                </button>
              );
            })}
        </div>
      )}
      {!shortcut && rows.length > limit && (
        <button onClick={() => setLimit((x) => x + 12)}>More postcards</button>
      )}
      {!shortcut && !rows.length && (
        <p>Your postcard box is waiting for its first little letter.</p>
      )}
      {editor && (
        <PostcardEditor
          replyTo={replyTo}
          close={() => {
            setEditor(false);
            setReplyTo(null);
          }}
          send={sent}
        />
      )}{" "}
      {selected && (
        <PostcardViewer
          row={selected}
          close={() => setSelected(null)}
          reply={() => {
            setReplyTo(selected);
            setSelected(null);
            setEditor(true);
          }}
          refresh={load}
          onDelete={(id) => {
            if (c.preview) {
              local.current.delete(id);
              setRows((prev) => prev.filter((x) => x.id !== id));
            }
          }}
        />
      )}
    </section>
  );
}
function PostcardEditor({
  replyTo,
  close,
  send,
}: {
  close: () => void;
  send: (p: SendCard) => Promise<void>;
  replyTo?: Card | null;
}) {
  const unlocked = useCosmetics();
  const artwork = useArtworkLibrary(),
    [sealing, setSealing] = useState(false),
    [canvasArt, setCanvasArt] = useState<Record<string, ImageBitmap>>({});
  const artworkKey = Object.entries(artwork)
    .filter(
      ([name, a]) =>
        a.kind === "image" &&
        (name.startsWith("postcard-") || a.original?.includes("/stickers/")),
    )
    .map(([name, a]) => `${name}:${a.src}`)
    .join("|");
  useEffect(() => {
    let alive = true;
    const images: Record<string, ImageBitmap> = {};
    void Promise.all(
      Object.entries(artwork)
        .filter(
          ([name, a]) =>
            a.kind === "image" &&
            (name.startsWith("postcard-") ||
              a.original?.includes("/stickers/")),
        )
        .map(async ([name, a]) => {
          try {
            const response = await fetch(a.src);
            if (!response.ok) return;
            const image = await createImageBitmap(await response.blob());
            if (alive) images[name] = image;
            else image.close();
          } catch {}
        }),
    ).then(() => {
      if (alive) setCanvasArt(images);
    });
    return () => {
      alive = false;
      Object.values(images).forEach((i) => i.close());
    };
  }, [artworkKey]);
  const c = useKeepsakes(),
    canvas = useRef<HTMLCanvasElement | null>(null),
    dialog = useRef<HTMLDialogElement | null>(null),
    [doc, setDoc] = useState(() => {
      const d = blankPostcard();
      if (replyTo) {
        d.paper = replyTo.layers.paper;
        d.pattern = "hearts";
        d.stamp = replyTo.stamp_id;
        d.texts = [
          {
            id: crypto.randomUUID(),
            text: "A little reply",
            x: 450,
            y: 110,
            color: "#9D304F",
            size: 44,
            font: "Caveat",
            style: "label",
            curve: false,
          },
        ];
      }
      return d;
    }),
    [step, setStep] = useState(0),
    [tool, setTool] = useState("crop"),
    [pen, setPen] = useState("pen"),
    [ink, setInk] = useState("#9D304F"),
    [size, setSize] = useState(8),
    [photo, setPhoto] = useState<ImageBitmap | null>(null),
    photoBlob = useRef<Blob | null>(null),
    [unlock, setUnlock] = useState(""),
    [envelope, setEnvelope] = useState(swatches[1]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [newText, setNewText] = useState(""),
    [font, setFont] = useState("Caveat"),
    [textStyle, setTextStyle] = useState("plain"),
    [curve, setCurve] = useState(false),
    [history, setHistory] = useState<PostcardDoc[]>([]),
    [future, setFuture] = useState<PostcardDoc[]>([]),
    stroke = useRef<Point[]>([]),
    drag = useRef<{ x: number; y: number; id: string | null } | null>(null),
    pointers = useRef(new Map<number, { x: number; y: number }>()),
    pinch = useRef<{
      distance: number;
      angle: number;
      zoom: number;
      rotation: number;
    } | null>(null),
    [discarding, setDiscarding] = useState(false),
    docRef = useRef(doc),
    autosave = useRef(0);
  const photoRef = useRef(photo);
  photoRef.current = photo;
  useEffect(() => () => photoRef.current?.close(), []);
  docRef.current = doc;
  const draftKey = `postcard-draft:${c.user}`;
  useEffect(() => {
    dialog.current?.showModal();
    const restore = async () => {
      const { queuedMedia } = await import("@/lib/media-outbox");
      const draft = (await queuedMedia()).find(
        (x) => x.id === draftKey && Date.now() - x.created < 7 * 86400000,
      );
      if (draft) {
        const p = draft.payload as { doc: PostcardDoc; photo: Blob | null };
        setDoc(p.doc);
        if (p.photo) {
          photoBlob.current = p.photo;
          setPhoto(await createImageBitmap(p.photo));
        }
      }
    };
    if (!replyTo) void restore();
    return () => {
      if (autosave.current) clearTimeout(autosave.current);
    };
  }, [draftKey]);
  useEffect(() => {
    if (!canvas.current) return;
    drawPostcard(canvas.current, doc, photo, step === 2, canvasArt);
  }, [doc, photo, step, canvasArt]);
  useEffect(() => {
    setTool("crop");
    stroke.current = [];
    drag.current = null;
    pinch.current = null;
    pointers.current.clear();
  }, [step]);
  useEffect(() => {
    autosave.current = window.setTimeout(
      () =>
        void queueMedia({
          id: draftKey,
          user: c.user,
          couple: c.couple || "preview",
          kind: "draft",
          created: Date.now(),
          payload: { draft: true, doc, photo: photoBlob.current },
        }),
      600,
    );
    return () => clearTimeout(autosave.current);
  }, [doc, draftKey, c.user, c.couple]);
  // Drafts are never eligible sends; they have a separate key and are filtered by the sender below.
  function change(p: Partial<PostcardDoc>) {
    setHistory((x) => [...x.slice(-39), docRef.current]);
    setFuture([]);
    setDoc((x) => ({ ...x, ...p }));
  }
  function undo() {
    if (!history.length) return;
    setFuture((x) => [doc, ...x]);
    setDoc(history.at(-1)!);
    setHistory((x) => x.slice(0, -1));
  }
  function redo() {
    if (!future.length) return;
    setHistory((x) => [...x, doc]);
    setDoc(future[0]);
    setFuture((x) => x.slice(1));
  }
  async function choose(blob: Blob) {
    setError("");
    try {
      const b = await compressPhoto(blob);
      if (b.size > 524288) throw new Error("Try a smaller photo.");
      photoBlob.current = b;
      const image = await createImageBitmap(b);
      setPhoto((old) => {
        old?.close();
        return image;
      });
      change({ photoTransform: { x: 0, y: 0, zoom: 1 } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo could not open.");
    }
  }
  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * (doc.portrait ? 600 : 900)) / r.width,
      y: ((e.clientY - r.top) * (doc.portrait ? 900 : 600)) / r.height,
      p: e.pressure || 0.5,
    };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const s = doc.stickers.find((x) => x.id === selected);
      pinch.current = {
        distance: Math.max(10, Number.isFinite(dist) ? dist : 10),
        angle: Number.isFinite(Math.atan2(b.y - a.y, b.x - a.x))
          ? Math.atan2(b.y - a.y, b.x - a.x)
          : 0,
        zoom:
          s && Number.isFinite(s.scale) && s.scale > 0
            ? s.scale
            : Number.isFinite(doc.photoTransform.zoom) && doc.photoTransform.zoom > 0
              ? doc.photoTransform.zoom
              : 1,
        rotation: s && Number.isFinite(s.rotation) ? s.rotation : 0,
      };
      return;
    }
    const isDrawing = tool === "draw" && (step === 1 || step === 2);
    if (isDrawing) {
      stroke.current = [p];
    } else {
      const s = [...doc.stickers]
        .reverse()
        .find(
          (x) =>
            Math.hypot(x.x - p.x, x.y - p.y) <
            50 * (Number.isFinite(x.scale) ? x.scale : 1),
        );
      if (s) {
        setSelected(s.id);
        setTool("crop");
      }
      const text = doc.texts.find(
        (t) =>
          p.x >= t.x &&
          p.x <= t.x + t.text.length * t.size * 0.65 &&
          Math.abs(p.y - t.y) < t.size,
      );
      if (text) {
        setSelected(text.id);
        setTool("crop");
      }
      drag.current = { x: p.x, y: p.y, id: text?.id || s?.id || null };
      setHistory((x) => [...x.slice(-39), doc]);
    }
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    const p = point(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const currentDist = Math.hypot(a.x - b.x, a.y - b.y);
      if (
        !Number.isFinite(currentDist) ||
        currentDist <= 0 ||
        pinch.current.distance <= 0
      )
        return;
      const ratio = currentDist / pinch.current.distance;
      if (!Number.isFinite(ratio) || ratio <= 0) return;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const angleDiff = ((angle - pinch.current.angle) * 180) / Math.PI;
      const rotation = Number.isFinite(angleDiff)
        ? pinch.current.rotation + angleDiff
        : pinch.current.rotation;
      const baseZoom =
        Number.isFinite(pinch.current.zoom) && pinch.current.zoom > 0
          ? pinch.current.zoom
          : 1;
      const rawScale = baseZoom * ratio;
      const newScale = Number.isFinite(rawScale)
        ? Math.max(0.2, Math.min(4, rawScale))
        : 1;

      const isStickerSelected = doc.stickers.some((s) => s.id === selected);
      setDoc((d) =>
        isStickerSelected
          ? {
              ...d,
              stickers: d.stickers.map((s) =>
                s.id === selected
                  ? {
                      ...s,
                      scale: newScale,
                      rotation: Number.isFinite(rotation)
                        ? Math.round(rotation)
                        : s.rotation,
                    }
                  : s,
              ),
            }
          : {
              ...d,
              photoTransform: {
                ...d.photoTransform,
                zoom: Math.max(1, Math.min(4, newScale)),
              },
            },
      );
      return;
    }
    const isDrawing = tool === "draw" && (step === 1 || step === 2);
    if (isDrawing) {
      stroke.current.push(p);
      if (canvas.current) {
        if (step === 1) {
          drawPostcard(
            canvas.current,
            {
              ...doc,
              strokes: [
                ...doc.strokes,
                { points: stroke.current, color: ink, size, pen },
              ],
            },
            photo,
            false,
            canvasArt,
          );
        } else if (step === 2) {
          drawPostcard(
            canvas.current,
            {
              ...doc,
              backStrokes: [
                ...doc.backStrokes,
                { points: stroke.current, color: ink, size, pen },
              ],
            },
            null,
            true,
            canvasArt,
          );
        }
      }
      return;
    }
    const t = drag.current;
    if (t) {
      const dx = p.x - t.x,
        dy = p.y - t.y;
      t.x = p.x;
      t.y = p.y;
      setDoc((d) =>
        t.id
          ? {
              ...d,
              stickers: d.stickers.map((s) =>
                s.id === t.id ? { ...s, x: s.x + dx, y: s.y + dy } : s,
              ),
              texts: d.texts.map((text) =>
                text.id === t.id
                  ? { ...text, x: text.x + dx, y: text.y + dy }
                  : text,
              ),
            }
          : {
              ...d,
              photoTransform: {
                ...d.photoTransform,
                x: d.photoTransform.x + dx,
                y: d.photoTransform.y + dy,
              },
            },
      );
    }
  }
  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) {
      pinch.current = null;
    }
    if (pointers.current.size === 0) {
      drag.current = null;
    }
    if (stroke.current.length) {
      if (step === 1) {
        change({
          strokes: [
            ...doc.strokes,
            { points: stroke.current, color: ink, size, pen },
          ],
        });
      } else if (step === 2) {
        change({
          backStrokes: [
            ...doc.backStrokes,
            { points: stroke.current, color: ink, size, pen },
          ],
        });
      }
      stroke.current = [];
    }
  }
  function editSticker(p: Partial<Sticker>) {
    change({
      stickers: doc.stickers.map((s) =>
        s.id === selected ? { ...s, ...p } : s,
      ),
    });
  }
  async function seal() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const frontCanvas = document.createElement("canvas"),
        backCanvas = document.createElement("canvas");
      drawPostcard(frontCanvas, doc, photo, false, canvasArt);
      drawPostcard(backCanvas, doc, null, true, canvasArt);
      const front = await exportCard(frontCanvas),
        back = await exportCard(backCanvas);
      if (front.size > 524288 || back.size > 524288)
        throw new Error("This design is too large. Try fewer layers.");
      setSealing(true);
      tactile(30);
      softSound("paper");
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          matchMedia("(prefers-reduced-motion: reduce)").matches ? 250 : 1800,
        ),
      );
      await send({
        id: crypto.randomUUID(),
        doc,
        front,
        back,
        photo: photoBlob.current,
        unlock,
        envelope,
        user: c.user,
        couple: c.couple || "preview",
      });
      const { removeMedia } = await import("@/lib/media-outbox");
      await removeMedia(draftKey);
      tactile([30, 50, 30]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your postcard could not send. The draft is saved.",
      );
    } finally {
      setBusy(false);
      setSealing(false);
    }
  }
  const selectedSticker = doc.stickers.find((s) => s.id === selected);

  return (
    <dialog
      ref={dialog}
      className="postcard-studio"
      aria-label="Postcard studio"
      onCancel={close}
    >
      {sealing && (
        <div
          className="postcard-send-scene"
          role="status"
          aria-label="Sealing your postcard"
        >
          <EnvelopeAnimation color={envelope} sending />
          <span>Sealed with a little love</span>
        </div>
      )}

      {discarding && (
        <div
          className="postcard-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Discard postcard"
        >
          <div className="postcard-confirm-dialog">
            <h3>Discard this postcard?</h3>
            <p>Your postcard draft and any changes will be deleted. This cannot be undone.</p>
            <div className="postcard-confirm-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setDiscarding(false)}
              >
                Keep editing
              </button>
              <button
                type="button"
                className="danger"
                onClick={async () => {
                  const { removeMedia } = await import("@/lib/media-outbox");
                  await removeMedia(draftKey);
                  photoRef.current?.close();
                  setPhoto(null);
                  photoBlob.current = null;
                  setDoc(blankPostcard());
                  setDiscarding(false);
                  close();
                }}
              >
                <Trash2 size={16} /> Discard
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="postcard-studio-header">
        <div>
          <h1>A little postcard</h1>
          <p className="postcard-studio-step-hint">
            Step {step + 1} of 4: {["Photo & Paper", "Decorate Front", "Note & Stamp", "Seal & Send"][step]}
          </p>
        </div>
        <div className="postcard-studio-header-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => setDiscarding(true)}
            title="Discard this postcard"
          >
            <Trash2 size={16} /> Discard
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Save draft and close studio"
            onClick={close}
            title="Close"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      <nav className="postcard-stepper" aria-label="Postcard steps">
        {[
          { label: "Photo & Paper", icon: Camera },
          { label: "Front Decor", icon: Sparkles },
          { label: "Note & Stamp", icon: Pen },
          { label: "Preview & Send", icon: Mail },
        ].map((item, i) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              className={`postcard-step-pill ${step === i ? "is-active" : ""}`}
              aria-current={step === i ? "step" : undefined}
              onClick={() => setStep(i)}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {error && <p role="alert">{error}</p>}

      <div
        className="postcard-canvas-wrap"
        style={{ maxWidth: `min(95vw,${doc.portrait ? 34 : 78}dvh,860px)` }}
      >
        <canvas
          ref={canvas}
          style={{ touchAction: "none" }}
          aria-label={step === 2 ? "Back of postcard" : "Front of postcard"}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
      </div>

      <div className="postcard-dock">
        {step === 0 && (
          <div className="postcard-editor-section" style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="postcard-tool-group">
              <span className="postcard-group-title">Photo</span>
              <div className="postcard-button-row">
                <label className="upload-button">
                  <ImagePlus size={18} /> Gallery
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files?.[0]) void choose(e.target.files[0]);
                    }}
                  />
                </label>
                <label className="upload-button">
                  <Camera size={18} /> Camera
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      if (e.target.files?.[0]) void choose(e.target.files[0]);
                    }}
                  />
                </label>
                <select
                  aria-label="Choose a Memories photo"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value)
                      void c
                        .signed(e.target.value)
                        .then((u) => fetch(u))
                        .then((r) => r.blob())
                        .then(choose);
                  }}
                >
                  <option value="">Memories photo...</option>
                  {c.memories
                    .filter((x) => x.image_path && !x.archived_at)
                    .map((x) => (
                      <option key={x.id} value={x.image_path!}>
                        {x.caption || new Date(x.created_at).toLocaleDateString()}
                      </option>
                    ))}
                </select>
                {photo && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setPhoto(null);
                      photoBlob.current = null;
                    }}
                  >
                    Remove photo
                  </button>
                )}
              </div>
              {photo && (
                <label style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: 360 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Zoom</span>
                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={0.05}
                    value={doc.photoTransform.zoom}
                    onChange={(e) =>
                      change({
                        photoTransform: {
                          ...doc.photoTransform,
                          zoom: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              )}
            </div>

            <div className="postcard-tool-group">
              <span className="postcard-group-title">Paper Color & Pattern</span>
              <div className="postcard-swatches" aria-label="Paper colors">
                {swatches.map((x, i) => (
                  <button
                    key={x}
                    type="button"
                    style={{ background: x }}
                    className={doc.paper === x ? "is-selected-swatch" : ""}
                    aria-label={`Paper color ${i + 1}`}
                    aria-pressed={doc.paper === x}
                    onClick={() => change({ paper: x })}
                  />
                ))}
              </div>
              <div className="postcard-button-row">
                <select
                  aria-label="Paper pattern"
                  value={doc.pattern || "Plain"}
                  onChange={(e) => change({ pattern: e.target.value })}
                >
                  {["Plain", "Dots", "Gingham", "Hearts"].map((pattern) => (
                    <option key={pattern} value={pattern}>{pattern} Pattern</option>
                  ))}
                </select>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={doc.portrait}
                    onChange={(e) => change({ portrait: e.target.checked })}
                  />
                  <span>Portrait orientation</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="postcard-editor-section" style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="postcard-tool-group">
              <span className="postcard-group-title">Tools & Effects</span>
              <div className="postcard-button-row">
                <button
                  type="button"
                  aria-pressed={tool === "crop"}
                  className={tool === "crop" ? "active" : "secondary"}
                  onClick={() => setTool("crop")}
                >
                  <Move size={16} /> Select & Move
                </button>
                <button
                  type="button"
                  aria-pressed={tool === "draw"}
                  className={tool === "draw" ? "active" : "secondary"}
                  onClick={() => setTool("draw")}
                >
                  <Pen size={16} /> Draw
                </button>
                <select
                  aria-label="Photo filter"
                  value={doc.filter}
                  onChange={(e) => change({ filter: e.target.value })}
                >
                  {Object.keys(cardFilters).map((x) => (
                    <option key={x} value={x}>{x} Filter</option>
                  ))}
                </select>
                <select
                  aria-label="Frame"
                  value={doc.frame}
                  onChange={(e) => change({ frame: e.target.value })}
                >
                  {[
                    "Printed",
                    "Scalloped",
                    "Polaroid",
                    "Film strip",
                    "Torn edge",
                    "Lace",
                  ].map((x) => (
                    <option key={x} value={x}>{x} Frame</option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label="Undo design"
                  disabled={!history.length}
                  onClick={undo}
                  title="Undo"
                >
                  <Undo2 size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Redo design"
                  disabled={!future.length}
                  onClick={redo}
                  title="Redo"
                >
                  <Redo2 size={16} />
                </button>
              </div>

              {tool === "draw" && (
                <div className="postcard-button-row" style={{ paddingTop: 6, borderTop: "1px dashed var(--line)" }}>
                  <select
                    aria-label="Pen style"
                    value={pen}
                    onChange={(e) => setPen(e.target.value)}
                  >
                    {[
                      "pen",
                      "marker",
                      "crayon",
                      "glitter",
                      "neon",
                      "hearts",
                      "eraser",
                    ].map((x) => (
                      <option key={x} value={x}>{x.charAt(0).toUpperCase() + x.slice(1)}</option>
                    ))}
                  </select>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    Size
                    <input
                      type="range"
                      min={2}
                      max={40}
                      value={size}
                      onChange={(e) => setSize(Number(e.target.value))}
                    />
                    <span>{size}px</span>
                  </label>
                  <input
                    type="color"
                    aria-label="Ink color"
                    value={ink}
                    onChange={(e) => setInk(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="postcard-tool-group">
              <span className="postcard-group-title">Cute & Romantic Stickers (Tap to add)</span>
              <div className="postcard-stickers-tray">
                {Object.keys(canvasArt)
                  .filter((name) => !name.startsWith("postcard-"))
                  .map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="postcard-sticker-btn"
                      aria-label={`Add ${name} sticker`}
                      disabled={doc.stickers.length >= 60}
                      onClick={() => {
                        const id = crypto.randomUUID();
                        change({
                          stickers: [
                            ...doc.stickers,
                            {
                              id,
                              kind: `asset:${name}`,
                              x: doc.portrait ? 300 : 450,
                              y: doc.portrait ? 450 : 300,
                              scale: 1,
                              rotation: 0,
                              flip: false,
                            },
                          ],
                        });
                        setSelected(id);
                        setTool("crop");
                        tactile(20);
                      }}
                    >
                      <Slot name={name} alt={name} />
                    </button>
                  ))}
                {[
                  { id: "heart", label: "Heart", icon: Heart },
                  { id: "sparkles", label: "Sparkles", icon: Sparkles, requiresUnlock: "sticker-sparkles" },
                  { id: "rose", label: "Rose", icon: Flower2 },
                  { id: "kiss", label: "Kiss", icon: Smile },
                  { id: "letter", label: "Love Letter", icon: Mail },
                  { id: "ribbon", label: "Ribbon Bow", icon: Ribbon },
                  { id: "lock", label: "Love Lock", icon: Lock },
                  { id: "gift", label: "Sweet Gift", icon: Gift },
                  { id: "bubble", label: "Love Note", icon: MessageCircleHeart },
                  { id: "bear", label: "Teddy Bear", icon: Smile },
                ]
                  .filter((s) => !s.requiresUnlock || unlocked.includes(s.requiresUnlock))
                  .map((s) => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className="postcard-sticker-btn"
                        aria-label={`Add ${s.label} sticker`}
                        title={s.label}
                        disabled={doc.stickers.length >= 60}
                        onClick={() => {
                          const id = crypto.randomUUID();
                          change({
                            stickers: [
                              ...doc.stickers,
                              {
                                id,
                                kind: s.id,
                                x: doc.portrait ? 300 : 450,
                                y: doc.portrait ? 450 : 300,
                                scale: 1,
                                rotation: 0,
                                flip: false,
                              },
                            ],
                          });
                          setSelected(id);
                          setTool("crop");
                          tactile(20);
                        }}
                      >
                        <Icon size={22} />
                      </button>
                    );
                  })}
              </div>

              {selectedSticker && (
                <div className="postcard-selected-sticker-bar">
                  <button
                    type="button"
                    title="Duplicate sticker"
                    onClick={() => {
                      if (doc.stickers.length < 60)
                        change({
                          stickers: [
                            ...doc.stickers,
                            {
                              ...selectedSticker,
                              id: crypto.randomUUID(),
                              x: selectedSticker.x + 20,
                              y: selectedSticker.y + 20,
                            },
                          ],
                        });
                    }}
                  >
                    <Copy size={16} /> Duplicate
                  </button>
                  <button
                    type="button"
                    title="Flip sticker"
                    onClick={() => editSticker({ flip: !selectedSticker.flip })}
                  >
                    <FlipHorizontal size={16} /> Flip
                  </button>
                  <button
                    type="button"
                    title="Bring sticker to front"
                    onClick={() =>
                      change({
                        stickers: [
                          ...doc.stickers.filter((x) => x.id !== selected),
                          selectedSticker,
                        ],
                      })
                    }
                  >
                    <ArrowUp size={16} /> Front
                  </button>
                  <button
                    type="button"
                    className="danger-btn"
                    title="Delete sticker"
                    onClick={() => {
                      change({
                        stickers: doc.stickers.filter((x) => x.id !== selected),
                      });
                      setSelected(null);
                    }}
                  >
                    <Trash2 size={16} /> Delete
                  </button>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                    Size
                    <input
                      type="range"
                      min={0.2}
                      max={4}
                      step={0.1}
                      value={selectedSticker.scale || 1}
                      onChange={(e) => editSticker({ scale: Number(e.target.value) })}
                    />
                  </label>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                    Rotate
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      value={selectedSticker.rotation || 0}
                      onChange={(e) => editSticker({ rotation: Number(e.target.value) })}
                    />
                  </label>
                  <button type="button" className="secondary" onClick={() => setSelected(null)}>
                    Done
                  </button>
                </div>
              )}
            </div>

            <div className="postcard-tool-group">
              <span className="postcard-group-title">Add Text Note</span>
              <div className="postcard-button-row">
                <input
                  aria-label="Add postcard text"
                  placeholder="Write a sweet phrase..."
                  value={newText}
                  maxLength={80}
                  onChange={(e) => setNewText(e.target.value)}
                  style={{ minWidth: 200, flex: 1 }}
                />
                <select
                  aria-label="Text font"
                  value={font}
                  onChange={(e) => setFont(e.target.value)}
                >
                  {["Caveat", "Fredoka", "Nunito Sans", "serif"].map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
                <select
                  aria-label="Text style"
                  value={textStyle}
                  onChange={(e) => setTextStyle(e.target.value)}
                >
                  {["plain", "outline", "highlight", "bubble", "label"].map((x) => (
                    <option key={x} value={x}>{x.charAt(0).toUpperCase() + x.slice(1)}</option>
                  ))}
                </select>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={curve}
                    onChange={(e) => setCurve(e.target.checked)}
                  />
                  Curved
                </label>
                <button
                  type="button"
                  disabled={!newText.trim()}
                  onClick={() => {
                    change({
                      texts: [
                        ...doc.texts,
                        {
                          id: crypto.randomUUID(),
                          text: newText,
                          x: 80,
                          y: 500,
                          color: ink,
                          size: 36,
                          font,
                          style: textStyle,
                          curve,
                        },
                      ],
                    });
                    setNewText("");
                  }}
                >
                  <Type size={16} /> Add text
                </button>
              </div>

              {doc.texts.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                  {doc.texts.map((text) => (
                    <div key={text.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, padding: "4px 8px", fontSize: 13 }}>
                      <span>{text.text}</span>
                      <button
                        type="button"
                        style={{ padding: "2px 6px", fontSize: 11 }}
                        className="danger-btn"
                        title="Remove text"
                        onClick={() => change({ texts: doc.texts.filter((t) => t.id !== text.id) })}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="postcard-editor-section" style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="postcard-tool-group">
              <span className="postcard-group-title">Your Handwritten Message</span>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <textarea
                  maxLength={280}
                  placeholder="Write your sweet message or love note here..."
                  value={doc.message}
                  onChange={(e) => change({ message: e.target.value })}
                  style={{ width: "100%", minHeight: 120, padding: 12, borderRadius: 12 }}
                />
                <span style={{ fontSize: 12, textAlign: "right", color: "var(--ink)", opacity: 0.7 }}>
                  {doc.message.length} / 280 characters
                </span>
              </label>
            </div>

            <div className="postcard-tool-group">
              <span className="postcard-group-title">Place & Stamp</span>
              <div className="postcard-button-row">
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: 1, minWidth: 200 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Sent from</span>
                  <input
                    maxLength={60}
                    placeholder="Where are you? (e.g. Under the stars)"
                    value={doc.place}
                    onChange={(e) => change({ place: e.target.value })}
                    style={{ flex: 1 }}
                  />
                </label>
                <select
                  aria-label="Stamp"
                  value={doc.stamp}
                  onChange={(e) => change({ stamp: e.target.value })}
                >
                  {[
                    { id: "heart", label: "Heart Stamp" },
                    { id: "rose", label: "Rose Stamp" },
                    { id: "sparkles", label: "Sparkles Stamp" },
                    { id: "letter", label: "Love Letter Stamp" },
                  ].map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                  {Object.keys(canvasArt)
                    .filter(
                      (x) =>
                        x.startsWith("postcard-stamp-") ||
                        artwork[x]?.original?.includes("/stickers/"),
                    )
                    .map((x) => (
                      <option key={x} value={x}>
                        {x
                          .replace(/^postcard-stamp-/, "Stamp ")
                          .replaceAll("-", " ")}
                      </option>
                    ))}
                </select>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={doc.frontStamp}
                    onChange={(e) => change({ frontStamp: e.target.checked })}
                  />
                  <span>Show stamp on front too</span>
                </label>
              </div>

              <div className="postcard-button-row" style={{ paddingTop: 8, borderTop: "1px dashed var(--line)" }}>
                <button
                  type="button"
                  aria-pressed={tool === "draw"}
                  className={tool === "draw" ? "active" : "secondary"}
                  onClick={() => setTool(tool === "draw" ? "crop" : "draw")}
                >
                  <Pen size={16} /> {tool === "draw" ? "Drawing on back active" : "Draw doodle on back"}
                </button>
                {tool === "draw" && (
                  <>
                    <select
                      aria-label="Pen style"
                      value={pen}
                      onChange={(e) => setPen(e.target.value)}
                    >
                      {["pen", "marker", "crayon", "glitter", "neon", "hearts", "eraser"].map((x) => (
                        <option key={x} value={x}>{x.charAt(0).toUpperCase() + x.slice(1)}</option>
                      ))}
                    </select>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                      Size
                      <input
                        type="range"
                        min={2}
                        max={40}
                        value={size}
                        onChange={(e) => setSize(Number(e.target.value))}
                      />
                      <span>{size}px</span>
                    </label>
                    <input
                      type="color"
                      aria-label="Ink color"
                      value={ink}
                      onChange={(e) => setInk(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={!doc.backStrokes?.length}
                      onClick={() => change({ backStrokes: doc.backStrokes.slice(0, -1) })}
                      title="Undo stroke"
                    >
                      <Undo2 size={16} /> Undo doodle
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="postcard-editor-section" style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="postcard-tool-group">
              <span className="postcard-group-title">Envelope & Reveal</span>
              <fieldset className="postcard-swatches" style={{ border: 0, padding: 0 }}>
                <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Envelope color</legend>
                {swatches
                  .filter((x, i) => i < 2 || unlocked.includes("envelope-colors"))
                  .map((color, i) => (
                    <button
                      key={color}
                      type="button"
                      style={{ background: color }}
                      className={envelope === color ? "is-selected-swatch" : ""}
                      aria-label={`Envelope color ${i + 1}`}
                      aria-pressed={envelope === color}
                      onClick={() => setEnvelope(color)}
                    />
                  ))}
              </fieldset>

              <div className="postcard-button-row" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    if (canvas.current)
                      drawPostcard(
                        canvas.current,
                        doc,
                        photo,
                        canvas.current.dataset.back !== "true",
                        canvasArt,
                      );
                    if (canvas.current)
                      canvas.current.dataset.back =
                        canvas.current.dataset.back === "true" ? "false" : "true";
                  }}
                >
                  <RotateCcw size={18} /> Flip card preview
                </button>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span>Open on a date (optional)</span>
                  <input
                    type="datetime-local"
                    value={unlock}
                    onChange={(e) => setUnlock(e.target.value)}
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="postcard-footer-nav">
        <button
          type="button"
          className="secondary"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          <ChevronLeft size={18} /> Previous
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--cherry)" }}>
          Step {step + 1} of 4
        </span>
        {step < 3 ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(3, s + 1))}
          >
            Next: {["Front Decor", "Note & Stamp", "Preview & Send"][step]} <ChevronRight size={18} />
          </button>
        ) : (
          <button
            type="button"
            className="postcard-hero-send"
            disabled={busy}
            onClick={() => void seal()}
          >
            <Send size={18} /> {busy ? "Sealing with love…" : "Seal & Send with Love"}
          </button>
        )}
      </div>
    </dialog>
  );
}

function PostcardViewer({
  row,
  close,
  reply,
  refresh,
  onDelete,
}: {
  row: Card;
  close: () => void;
  reply: () => void;
  refresh: () => Promise<void>;
  onDelete?: (id: string) => void;
}) {
  const c = useKeepsakes(),
    dialog = useRef<HTMLDialogElement | null>(null),
    [urls, setUrls] = useState<string[]>([]),
    [back, setBack] = useState(false),
    [opening, setOpening] = useState(true),
    frontLayers = useRef<HTMLCanvasElement | null>(null),
    [layered, setLayered] = useState(false),
    [deleting, setDeleting] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (opening || back || !frontLayers.current || row.layers?.version !== 1)
      return;
    let alive = true,
      interval: ReturnType<typeof setInterval> | undefined,
      photo: ImageBitmap | null = null;
    const doc = row.layers;
    // Custom artwork uses the exported image on devices without the source assets.
    if (
      doc.stickers.some((s) => s.kind.startsWith("asset:")) ||
      doc.stamp.startsWith("postcard-stamp-") ||
      doc.frame.startsWith("postcard-frame-")
    )
      return;
    void (async () => {
      if (doc.photoPath) {
        if (c.preview) return;
        const signed = await c
          .db!.storage.from("postcards")
          .createSignedUrl(doc.photoPath, 600);
        if (signed.error) throw signed.error;
        photo = await createImageBitmap(
          await (await fetch(signed.data.signedUrl)).blob(),
        );
      }
      if (!alive) {
        photo?.close();
        return;
      }
      const total = doc.strokes.length + doc.stickers.length + doc.texts.length;
      let count = matchMedia("(prefers-reduced-motion: reduce)").matches
        ? total
        : 0;
      const paint = () => {
        if (!alive || !frontLayers.current) return;
        drawPostcard(
          frontLayers.current,
          {
            ...doc,
            strokes: doc.strokes.slice(0, count),
            stickers: doc.stickers.slice(
              0,
              Math.max(0, count - doc.strokes.length),
            ),
            texts: doc.texts.slice(
              0,
              Math.max(0, count - doc.strokes.length - doc.stickers.length),
            ),
          },
          photo,
        );
        setLayered(true);
        if (count++ >= total && interval) clearInterval(interval);
      };
      paint();
      if (count <= total) interval = setInterval(paint, 80);
    })().catch(() => {
      if (alive) setLayered(false);
    });
    return () => {
      alive = false;
      if (interval) clearInterval(interval);
      photo?.close();
    };
  }, [opening, back, row, c.db, c.preview]);
  useEffect(() => {
    dialog.current?.showModal();
    let alive = true;
    void (async () => {
      const u = c.preview
        ? [row.front_path, row.back_path]
        : await Promise.all(
            [row.front_path, row.back_path].map(async (path) => {
              const r = await c
                .db!.storage.from("postcards")
                .createSignedUrl(path, 600);
              if (r.error) throw r.error;
              return r.data.signedUrl;
            }),
          );
      if (alive) {
        setUrls(u);
        setTimeout(
          () => {
            if (alive) setOpening(false);
          },
          matchMedia("(prefers-reduced-motion: reduce)").matches ? 250 : 1800,
        );
      }
    })().catch(() => setError("Your postcard could not open. Try again."));
    return () => {
      alive = false;
    };
  }, [c.db, c.preview, row]);
  async function action(a: string, v = "") {
    if (c.preview) return;
    const r = await c.db!.rpc("postcard_action", { i: row.id, a, v });
    if (r.error) setError(r.error.message);
    else void refresh();
  }
  async function save() {
    await c.run(async () => {
      const blob = await (await fetch(urls[0])).blob(),
        path = await c.upload(blob, "photo"),
        id = crypto.randomUUID();
      const r = await c.db!.from("memories").insert({
        id,
        couple_id: c.couple,
        author: c.user,
        caption: row.layers.place || "A little postcard",
        image_path: path,
        swap_day: null,
      });
      if (r.error) throw r.error;
      await c.refresh();
    });
  }
  return (
    <dialog
      ref={dialog}
      className="postcard-viewer"
      aria-label="Opened postcard"
      onCancel={close}
    >
      {!opening && <Celebration />}
      <button
        className="icon-button"
        aria-label="Close postcard"
        onClick={close}
      >
        <X />
      </button>
      {error && <p role="alert">{error}</p>}
      {opening && !error && (
        <div className="postcard-open-scene" role="status">
          <EnvelopeAnimation color={row.envelope_color} />
          <span>Opening your postcard…</span>
        </div>
      )}
      <button
        className={`postcard-flip ${back ? "is-back" : ""} ${opening ? "is-opening" : "postcard-revealed"}`}
        aria-label="Flip postcard"
        onClick={() => {
          setBack(!back);
          tactile(15);
          softSound("paper");
        }}
      >
        {urls.length > 0 && (
          <img
            style={{ display: layered && !back ? "none" : undefined }}
            src={urls[back ? 1 : 0]}
            alt={back ? "Postcard message" : "Postcard front"}
          />
        )}
        <canvas
          ref={frontLayers}
          className="postcard-layer-front"
          style={{ display: layered && !back ? "block" : "none" }}
          aria-label="Postcard front design"
        />
      </button>
      <p>Tap your postcard to flip it.</p>
      <div className="postcard-actions">
        <button onClick={reply}>
          <Mail size={18} /> Reply
        </button>
        <button onClick={() => void action("favorite")}>
          <Star size={18} /> Favorite
        </button>
        <button
          disabled={!urls.length || c.preview}
          onClick={() => void save()}
        >
          <ImagePlus size={18} /> Save to Memories
        </button>
        <button
          disabled={!urls.length}
          onClick={() => {
            void (async () => {
              const response = await fetch(urls[back ? 1 : 0]);
              if (!response.ok)
                throw new Error("Reopen your postcard and try again.");
              const href = URL.createObjectURL(await response.blob()),
                a = document.createElement("a");
              a.href = href;
              a.download = "our-postcard.webp";
              a.click();
              setTimeout(() => URL.revokeObjectURL(href), 1000);
            })().catch((e) => setError(e.message));
          }}
        >
          <Download size={18} /> Download
        </button>
        <button
          className="secondary danger-btn"
          onClick={() => setDeleting(true)}
        >
          <Trash2 size={18} /> Delete
        </button>
      </div>
      {deleting && (
        <div
          className="postcard-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Delete postcard"
        >
          <div className="postcard-confirm-dialog">
            <h3>Delete this postcard?</h3>
            <p>
              This postcard will be permanently deleted from your postcard box.
            </p>
            <div className="postcard-confirm-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setDeleting(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                onClick={async () => {
                  if (c.preview) {
                    onDelete?.(row.id);
                    setDeleting(false);
                    close();
                    return;
                  }
                  const r = await c.db!.rpc("postcard_action", {
                    i: row.id,
                    a: "delete",
                  });
                  if (r.error) {
                    setError(r.error.message);
                    setDeleting(false);
                  } else {
                    await refresh();
                    setDeleting(false);
                    close();
                  }
                }}
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
function EnvelopeAnimation({
  color,
  sending = false,
}: {
  color: string;
  sending?: boolean;
}) {
  return (
    <div
      className={`postcard-envelope-scene ${sending ? "is-sending" : "is-receiving"}`}
      style={{ background: color }}
      aria-hidden="true"
    >
      <div className="postcard-envelope-letter">
        <Heart />
      </div>
      <div className="postcard-envelope-flap" />
      <div className="postcard-envelope-seal">
        <Slot name="postcard-wax-seal">
          <Heart />
        </Slot>
      </div>
      <Slot name="postcard-envelope" className="postcard-envelope-art" />
    </div>
  );
}
