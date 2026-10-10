"use client";
import WishJar from "./WishJar";
import { armGameSounds } from "@/lib/game-feel";
import { jarWishes } from "@/lib/wish-jar";
import {
  ensureWishlists,
  wishListLabel,
  resolveWishList,
  temporaryDefaults,
  writableLists,
} from "@/lib/wish-defaults";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { SupabaseClient, Session } from "@supabase/supabase-js";
import {
  Heart,
  Plus,
  Gift,
  Check,
  Lock,
  ImagePlus,
  Mail,
  Mic,
  Square,
  Download,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Send,
  X,
  Trash2,
} from "lucide-react";
import {
  type WishList,
  type Wish,
  type Memory,
  type Letter,
  type NoteBody,
  type Claim,
  type Comment,
  compressPhoto,
  safeLink,
} from "@/lib/keepsakes";
import { manilaDay } from "@/lib/games";
import { Slot } from "./ArtSlots";
import { tactile } from "@/lib/music";
import { Capacitor } from "@capacitor/core";
import NativePhotoButton from "./NativePhotoButton";
import { resetExtraPreviews } from "@/lib/extra-games";
import { resetPreviewProgress } from "@/lib/preview-progress";
import {
  enqueueWish,
  flushWishes,
  pendingWishes,
  clearPending,
} from "@/lib/outbox";
type State = {
  lists: WishList[];
  wishes: Wish[];
  memories: Memory[];
  letters: Letter[];
  claims: Claim[];
  comments: Comment[];
};
const empty = (): State => ({
  lists: [],
  wishes: [],
  memories: [],
  letters: [],
  claims: [],
  comments: [],
});
type ContextType = State & {
  user: string;
  seat: number;
  preview: boolean;
  busy: boolean;
  error: string;
  message: string;
  setSeat: (n: number) => void;
  run: (fn: () => Promise<void>) => Promise<boolean>;
  refresh: () => Promise<void>;
  db: SupabaseClient | null;
  couple: string | null;
  local: (fn: (s: State) => State) => void;
  upload: (file: Blob, kind?: string) => Promise<string>;
  signed: (path: string) => Promise<string>;
  open: (id: string) => Promise<NoteBody>;
  pending: number;
  retry: () => Promise<void>;
  discard: () => Promise<void>;
};
const Context = createContext<ContextType | null>(null);
export function useKeepsakes() {
  const c = useContext(Context);
  if (!c) throw new Error("Keepsakes provider is missing");
  return c;
}
export function KeepsakeProvider({
  db,
  session,
  couple,
  preview,
  children,
}: {
  db: SupabaseClient | null;
  session: Session | null;
  couple: string | null;
  preview: boolean;
  children: ReactNode;
}) {
  const [state, setState] = useState<State>(empty),
    [seat, setSeat] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [pending, setPending] = useState(0);
  const lock = useRef(false),
    bodies = useRef<Record<string, NoteBody>>({}),
    blobs = useRef<Record<string, string>>({});
  const user = preview ? `preview-${seat}` : session?.user.id || "";
  useEffect(() => {
    if (preview || !user) return;
    setState(empty());
    try {
      const cached = JSON.parse(
        localStorage.getItem(`arcade-wishlists:${user}`) || "[]",
      );
      if (Array.isArray(cached)) setState((s) => ({ ...s, lists: cached }));
    } catch {
      /* A stale cache never blocks wish creation. */
    }
    let active = true;
    void pendingWishes(user).then((jobs) => {
      if (!active) return;
      setState((s) => {
        const lists = [...s.lists];
        for (const j of jobs)
          if (j.list && !lists.some((l) => l.id === j.list!.id))
            lists.push(j.list);
        return {
          ...s,
          lists,
          wishes: jobs.map(
            (j) =>
              ({
                status: "wished",
                done_at: null,
                position: 0,
                created_at: new Date(j.created).toISOString(),
                image_path: null,
                ...j.row,
              }) as Wish,
          ),
        };
      });
    });
    return () => {
      active = false;
    };
  }, [user, preview]);
  useEffect(
    () => () => {
      delete document.documentElement.dataset.arcadeTheme;
      resetExtraPreviews();
      resetPreviewProgress();
    },
    [],
  );
  const refresh = useCallback(async () => {
    if (preview || !db || !session || !couple) return;
    if (!navigator.onLine) return;
    let defaults: WishList[];
    try {
      defaults = await ensureWishlists(db);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your lists could not load. You can still save a wish on this device.",
      );
      return;
    }
    const tables = [
      "wishlists",
      "wishlist_items",
      "memories",
      "love_notes",
      "wishlist_claims",
      "wishlist_comments",
    ];
    const results = await Promise.all(
      tables.map((t) =>
        t === "wishlists"
          ? Promise.resolve({ data: defaults, error: null })
          : db.from(t).select("*"),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed) {
      setError(
        failed.error?.code === "42P01"
          ? "Your wishes, memories and notes could not load. Try again."
          : failed.error!.message,
      );
      return;
    }
    const queued = await pendingWishes(session.user.id);
    const serverLists = results[0].data as WishList[];
    localStorage.setItem(
      `arcade-wishlists:${session.user.id}`,
      JSON.stringify(serverLists),
    );
    const serverWishes = results[1].data as Wish[];
    setState({
      lists: [
        ...serverLists,
        ...queued.flatMap((j) =>
          j.list && !serverLists.some((l) => l.id === j.list!.id)
            ? [j.list]
            : [],
        ),
      ].filter((l, i, a) => a.findIndex((x) => x.id === l.id) === i),
      wishes: [
        ...serverWishes,
        ...queued
          .filter((j) => !serverWishes.some((w) => w.id === j.id))
          .map(
            (j) =>
              ({
                status: "wished",
                done_at: null,
                position: 0,
                created_at: new Date(j.created).toISOString(),
                image_path: null,
                ...j.row,
              }) as Wish,
          ),
      ],
      memories: results[2].data as Memory[],
      letters: results[3].data as Letter[],
      claims: results[4].data as Claim[],
      comments: results[5].data as Comment[],
    });
    setError("");
  }, [db, session, couple, preview]);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 10000);
    const online = () => void refresh();
    window.addEventListener("online", online);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", online);
    };
  }, [refresh]);
  const retry = useCallback(async () => {
    if (preview || !db || !user || !couple) return;
    try {
      await flushWishes(db, user, couple);
      setPending((await pendingWishes(user)).length);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Queued wishes could not sync. Retry when connected.",
      );
    }
  }, [db, user, couple, preview, refresh]);
  useEffect(() => {
    if (preview || !user) return;
    void pendingWishes(user).then((j) => setPending(j.length));
    if (navigator.onLine) void retry();
    const online = () => void retry();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [user, retry, preview]);
  useEffect(() => {
    if (preview || !db || !session || !couple) return;
    const channel = db.channel(`keepsakes:${couple}`, {
      config: { private: true },
    });
    for (const table of [
      "wishlists",
      "wishlist_items",
      "wishlist_comments",
      "memories",
      "love_notes",
    ])
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => void refresh(),
      );
    let canceled = false;
    void db.realtime.setAuth(session.access_token).then(() => {
      if (!canceled) channel.subscribe();
    });
    return () => {
      canceled = true;
      void db.removeChannel(channel);
    };
  }, [db, session, couple, preview, refresh]);
  useEffect(
    () => () => {
      Object.values(blobs.current).forEach(URL.revokeObjectURL);
    },
    [],
  );
  async function run(fn: () => Promise<void>) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await refresh();
      void tactile(12);
      const queued = preview ? 0 : (await pendingWishes(user)).length;
      setPending(queued);
      setMessage(
        queued
          ? "Saved on this device. Queued wishes will sync when connected."
          : "Saved.",
      );
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save. Check your connection and try again.",
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function upload(file: Blob, kind = "photo") {
    const processed = kind === "photo" ? await compressPhoto(file) : file;
    if (processed.size > 10000000)
      throw new Error("Keep media under 10 MB. Try a shorter recording.");
    const ext =
      kind === "photo"
        ? "webp"
        : processed.type.includes("mp4")
          ? "m4a"
          : processed.type.includes("ogg")
            ? "ogg"
            : "webm";
    const path = `${couple || "preview"}/${user}/${crypto.randomUUID()}.${ext}`;
    if (preview) {
      blobs.current[path] = URL.createObjectURL(processed);
      return path;
    }
    if (!db) throw new Error("Sign in first.");
    const r = await db.storage
      .from("keepsakes")
      .upload(path, processed, { contentType: processed.type, upsert: false });
    if (r.error) throw new Error(r.error.message);
    return path;
  }
  async function signed(path: string) {
    if (preview) return blobs.current[path] || "";
    const r = await db!.storage.from("keepsakes").createSignedUrl(path, 300);
    if (r.error) throw new Error(r.error.message);
    return r.data.signedUrl;
  }
  async function open(id: string) {
    if (preview) {
      const n = state.letters.find((n) => n.id === id)!;
      if (
        n.author !== user &&
        n.unlock_at &&
        new Date(n.unlock_at) > new Date()
      )
        throw new Error("This letter is still sealed until its date.");
      setState((s) => ({
        ...s,
        letters: s.letters.map((n) =>
          n.id === id ? { ...n, opened_at: new Date().toISOString() } : n,
        ),
      }));
      return bodies.current[id];
    }
    const r = await db!.rpc("open_love_note", { nid: id });
    if (r.error) throw new Error(r.error.message);
    await refresh();
    return r.data as NoteBody;
  }
  return (
    <Context.Provider
      value={{
        ...state,
        user,
        seat,
        preview,
        busy,
        error,
        message,
        setSeat,
        run,
        refresh,
        db,
        couple,
        local: setState,
        upload,
        signed,
        open,
        pending,
        retry,
        discard: async () => {
          await clearPending(user);
          setPending(0);
        },
      }}
    >
      <PreviewBodies.Provider value={bodies.current}>
        {children}
      </PreviewBodies.Provider>
    </Context.Provider>
  );
}
const PreviewBodies = createContext<Record<string, NoteBody>>({});
export function KeepsakeFeedback() {
  const c = useKeepsakes();
  return (
    <>
      {c.pending > 0 && (
        <div className="install-banner" role="status">
          <span>
            {c.pending} wish{c.pending === 1 ? "" : "es"} waiting to sync on
            this device.
          </span>
          <button
            className="secondary"
            disabled={c.busy}
            onClick={() => void c.retry()}
          >
            Retry sync
          </button>
          <button className="secondary" onClick={() => void c.discard()}>
            Discard queued wishes
          </button>
        </div>
      )}
      {c.preview && (
        <div className="keepsake-seats">
          <span>Local preview</span>
          {[0, 1].map((n) => (
            <button
              key={n}
              className="secondary"
              aria-pressed={c.seat === n}
              onClick={() => c.setSeat(n)}
            >
              Player {n + 1}
            </button>
          ))}
        </div>
      )}
      {c.error && (
        <p className="error" role="alert">
          {c.error}
        </p>
      )}
      {c.message && <p role="status">{c.message}</p>}
    </>
  );
}
export function Photo({
  path,
  alt,
  onOpen,
}: {
  path: string | null;
  alt: string;
  onOpen?: () => void;
}) {
  const c = useKeepsakes(),
    [url, setUrl] = useState(""),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let canceled = false;
    setUrl("");
    setFailed(false);
    if (path)
      c.signed(path)
        .then((u) => {
          if (!canceled) setUrl(u);
        })
        .catch(() => {
          if (!canceled) setFailed(true);
        });
    return () => {
      canceled = true;
    };
  }, [path, c.user]);
  return url && onOpen ? (
    <button type="button" className="memory-photo-button" onClick={onOpen}>
      <img src={url} alt={alt} loading="lazy" />
    </button>
  ) : url ? (
    <a href={url} target="_blank" rel="noreferrer" className="private-photo">
      <img src={url} alt={alt} loading="lazy" />
    </a>
  ) : path ? (
    <p>
      {failed ? "Photo could not load. Refresh to retry." : "Opening photo…"}
    </p>
  ) : null;
}
function ReceivedGift({ wish }: { wish: Wish }) {
  const c = useKeepsakes(),
    [received, setReceived] = useState(false);
  useEffect(() => {
    let active = true;
    if (wish.status !== "done") return;
    if (c.preview) setReceived(c.claims.some((i) => i.item_id === wish.id));
    else
      void c.db!.rpc("received_gift", { iid: wish.id }).then((r) => {
        if (active) setReceived(r.data === true);
      });
    return () => {
      active = false;
    };
  }, [wish.id, wish.status, c.user]);
  return received ? <p>Taken by someone sweet. Your wish came true.</p> : null;
}
export function WishlistShortcut({ go }: { go: () => void }) {
  const c = useKeepsakes(),
    latest = c.wishes
      .filter((w) => {
        const l = c.lists.find((l) => l.id === w.list_id);
        return l && l.type !== "secret";
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return (
    <div className="wish-shortcut secondary">
      <WishJar
        wishes={c.wishes}
        lists={c.lists.filter((l) => l.type !== "secret")}
        user={c.user}
        scope="home"
        mini
      />
      <span>{latest ? latest.title : "Make room for a little wish."}</span>
      <button className="text-button" onClick={go}>
        Open wishlists
      </button>
      <button
        onClick={() => {
          sessionStorage.setItem("arcade-open-wish", "1");
          go();
        }}
      >
        Make a wish <Plus size={18} />
      </button>
    </div>
  );
}
export function KeepsakeBackup() {
  const c = useKeepsakes();
  return (
    <section className="nickname-setting">
      <h2>A copy of our little world.</h2>
      <p>Download your wishes, memories and opened letters.</p>
      <button
        disabled={c.busy}
        onClick={() =>
          void c.run(async () => {
            const { default: JSZip } = await import("jszip");
            const zip = new JSZip();
            let contents: NoteBody[] = [];
            if (!c.preview) {
              const r = await c.db!.from("note_contents").select("*");
              if (r.error) throw new Error(r.error.message);
              contents = r.data as NoteBody[];
            }
            const visibleLists = c.lists.filter(
              (l) => l.type !== "secret" || l.owner_id === c.user,
            );
            const visibleWishes = c.wishes.filter((w) =>
              visibleLists.some((l) => l.id === w.list_id),
            );
            const memories = c.memories.filter(
              (m) =>
                !m.swap_day ||
                m.author === c.user ||
                c.memories.filter((i) => i.swap_day === m.swap_day).length ===
                  2,
            );
            zip.file(
              "keepsakes.json",
              JSON.stringify(
                {
                  exported_at: new Date().toISOString(),
                  wishlists: visibleLists,
                  wishes: visibleWishes,
                  memories,
                  letters: c.letters,
                  note_contents: contents,
                  claims: c.claims.filter((i) => i.claimed_by === c.user),
                },
                null,
                2,
              ),
            );
            const paths = Array.from(
              new Set(
                [
                  ...visibleWishes.map((w) => w.image_path),
                  ...memories.map((m) => m.image_path),
                  ...contents.map((n) => n.media_path),
                ].filter(Boolean),
              ),
            ) as string[];
            for (const path of paths) {
              const r = await fetch(await c.signed(path));
              if (!r.ok)
                throw new Error(
                  "One photo could not download. Retry your backup.",
                );
              zip.file("media/" + path.split("/").at(-1), await r.blob());
            }
            const blob = await zip.generateAsync({ type: "blob" });
            if (Capacitor.isNativePlatform()) {
              const { Filesystem, Directory } =
                  await import("@capacitor/filesystem"),
                { Share } = await import("@capacitor/share");
              const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                  resolve(String(reader.result).split(",")[1]);
                reader.onerror = () =>
                  reject(new Error("Backup could not be prepared."));
                reader.readAsDataURL(blob);
              });
              const result = await Filesystem.writeFile({
                path: "our-little-arcade-backup.zip",
                data: base64,
                directory: Directory.Cache,
              });
              await Share.share({
                title: "Our Little Arcade backup",
                files: [result.uri],
              });
              return;
            }
            const url = URL.createObjectURL(blob),
              a = document.createElement("a");
            a.href = url;
            a.download = "our-little-arcade-backup.zip";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
          })
        }
      >
        Download backup <Download size={18} />
      </button>
    </section>
  );
}
function WishJarReveal({
  wish,
  editable,
  close,
  edit,
  complete,
}: {
  wish: Wish;
  editable: boolean;
  close: () => void;
  edit: () => void;
  complete: () => Promise<void>;
}) {
  const c = useKeepsakes();
  const dialog = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="wish-reveal"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-labelledby="wish-reveal-title"
    >
      <div className="wish-reveal-seal" aria-hidden="true">
        <Heart size={26} />
      </div>
      <div className="wish-reveal-heading">
        <h2 id="wish-reveal-title">{wish.title}</h2>
        <button className="text-button" aria-label="Close wish" onClick={close}>
          <X size={20} />
        </button>
      </div>
      <Photo path={wish.image_path} alt={wish.title} />
      {c.error && (
        <p role="alert" className="notice error">
          {c.error}
        </p>
      )}
      {wish.note && <p className="handwriting">{wish.note}</p>}
      {wish.url && (
        <a href={safeLink(wish.url)} target="_blank" rel="noreferrer">
          Open wish link
        </a>
      )}
      <div className="wish-reveal-actions">
        {editable && (
          <>
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void complete().finally(() => setBusy(false));
              }}
            >
              Came true <Heart size={18} />
            </button>
            <button disabled={busy} className="secondary" onClick={edit}>
              Edit wish
            </button>
          </>
        )}
        <button className="text-button" onClick={close}>
          Back to the jar
        </button>
      </div>
    </dialog>
  );
}
export function Wishlists() {
  const c = useKeepsakes();
  const [jarOpen, setJarOpen] = useState(false),
    [jarLists, setJarLists] = useState<string[] | null>(null),
    [jarWish, setJarWish] = useState<Wish | null>(null),
    [optimistic, setOptimistic] = useState<Wish | null>(null);
  const [selected, setSelected] = useState(""),
    [wishListId, setWishListId] = useState(""),
    [inlineList, setInlineList] = useState(false),
    [listColor, setListColor] = useState("#F8C9D8"),
    [removingList, setRemovingList] = useState(false),
    [moveTo, setMoveTo] = useState(""),
    [adding, setAdding] = useState(false),
    [listTitle, setListTitle] = useState(""),
    [listType, setListType] = useState<WishList["type"]>("shared"),
    [editing, setEditing] = useState<Wish | null>(null),
    [title, setTitle] = useState(""),
    [note, setNote] = useState(""),
    [url, setUrl] = useState(""),
    [price, setPrice] = useState(""),
    [currency, setCurrency] = useState("PHP"),
    [priority, setPriority] = useState(1),
    [category, setCategory] = useState(""),
    [planned, setPlanned] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [filter, setFilter] = useState("all"),
    [level, setLevel] = useState("all"),
    [comment, setComment] = useState(""),
    [commentFor, setCommentFor] = useState("");
  const sourceLists = c.lists.length ? c.lists : temporaryDefaults(c.user);
  const lists = sourceLists.filter(
      (l) => l.type !== "secret" || l.owner_id === c.user,
    ),
    list = lists.find((l) => l.id === selected) || lists[0],
    editable =
      list &&
      (list.type === "shared" ||
        list.type === "custom" ||
        list.owner_id === c.user);
  const all = c.wishes
    .filter((w) => w.list_id === list?.id)
    .sort(
      (a, b) =>
        a.position - b.position || b.created_at.localeCompare(a.created_at),
    );
  const wishes = all.filter(
    (w) =>
      (filter === "all" || w.status === filter) &&
      (level === "all" || w.priority === Number(level)),
  );
  const sheet = useRef<HTMLElement | null>(null),
    swipe = useRef<{ id: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (optimistic && c.wishes.some((w) => w.id === optimistic.id))
      setOptimistic(null);
  }, [c.wishes, optimistic]);
  useEffect(() => {
    setComment("");
    setCommentFor("");
    setFilter("all");
    setLevel("all");
  }, [list?.id]);
  useEffect(() => {
    if (!selected.startsWith("local:")) return;
    const type = selected.startsWith("local:personal") ? "personal" : "shared";
    const resolved = writableLists(c.lists, c.user).find(
      (l) => l.type === type && !l.id.startsWith("local:"),
    );
    if (resolved) setSelected(resolved.id);
  }, [c.lists, c.user, selected]);
  useEffect(() => {
    if (sessionStorage.getItem("arcade-open-wish")) {
      sessionStorage.removeItem("arcade-open-wish");
      edit(null);
    }
    // Open only on entry; later list recovery must not close the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setAdding(false);
    setEditing(null);
    setComment("");
    setListTitle("");
    setJarWish(null);
    setOptimistic(null);
    setJarLists(null);
    setJarOpen(false);
  }, [c.user]);
  useEffect(() => {
    if (!adding) return;
    const previous = document.activeElement as HTMLElement | null;
    sheet.current?.querySelector<HTMLInputElement>("input")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAdding(false);
      if (e.key === "Tab") {
        const items = Array.from(
          sheet.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input,textarea,select,a[href]",
          ) || [],
        );
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [adding]);
  async function fillLink() {
    if (c.preview || !url || !c.db) return;
    try {
      const { data } = await c.db.auth.getSession();
      const r = await fetch("/api/wish-link", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${data.session?.access_token}`,
        },
        body: JSON.stringify({ url }),
      });
      if (!r.ok) return;
      const meta = await r.json();
      if (meta.title && !title) setTitle(meta.title);
      if (meta.price !== null && !price) setPrice(String(meta.price));
    } catch {
      /* Metadata is optional; manual fields always work. */
    }
  }
  async function createList(e: React.FormEvent) {
    e.preventDefault();
    await c.run(async () => {
      const data = {
        id: crypto.randomUUID(),
        title: listTitle,
        type: listType,
        owner_id: c.user,
        cover: "wish-jar",
        color: listColor,
      };
      if (c.preview) c.local((s) => ({ ...s, lists: [...s.lists, data] }));
      else if (!navigator.onLine)
        c.local((s) => {
          const lists = [...s.lists, data];
          localStorage.setItem(
            `arcade-wishlists:${c.user}`,
            JSON.stringify(lists),
          );
          return { ...s, lists };
        });
      else {
        const r = await c.db!.from("wishlists").insert(data);
        if (r.error) throw new Error(r.error.message);
      }
      if (adding) {
        setWishListId(data.id);
        setInlineList(false);
      } else setSelected(data.id);
      setListTitle("");
    });
  }
  function edit(w: Wish | null) {
    const writable = writableLists(sourceLists, c.user);
    const last = localStorage.getItem(`arcade-last-wishlist:${c.user}`);
    setWishListId(
      w?.list_id ||
        writable.find((l) => l.id === selected)?.id ||
        writable.find((l) => l.id === last)?.id ||
        writable.find((l) => l.type === "shared")?.id ||
        "local:shared",
    );
    setEditing(w);
    setTitle(w?.title || "");
    setNote(w?.note || "");
    setUrl(w?.url || "");
    setPrice(w?.price?.toString() || "");
    setCurrency(w?.currency || "PHP");
    setCategory(w?.category || "");
    setPriority(w?.priority || 1);
    setPlanned(w?.planned_date || "");
    setFile(null);
    setAdding(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    armGameSounds();
    const ok = await c.run(async () => {
      let target =
        writableLists(sourceLists, c.user).find((l) => l.id === wishListId) ||
        temporaryDefaults(c.user).find((l) => l.id === wishListId) ||
        temporaryDefaults(c.user)[0];
      if (url && !safeLink(url)) throw new Error("Use an http or https link.");
      if (!title.trim()) throw new Error("Give your wish a title.");
      if (editing && !c.preview && !navigator.onLine)
        throw new Error(
          "Wish edits need a connection. Your changes are still here.",
        );
      if (!c.preview && !editing) {
        const queuedId = crypto.randomUUID();
        const queued: Wish = {
          id: queuedId,
          list_id: target.id,
          created_by: c.user,
          title: title.trim(),
          note,
          url: safeLink(url),
          price: price ? Number(price) : null,
          currency: currency.toUpperCase(),
          priority,
          category,
          planned_date: planned || null,
          status: "wished",
          done_at: null,
          position: 0,
          created_at: new Date().toISOString(),
          image_path: null,
        };
        await enqueueWish(
          c.user,
          c.couple || "",
          {
            id: queuedId,
            list_id: target.id,
            created_by: c.user,
            title: title.trim(),
            note,
            url: safeLink(url),
            price: price ? Number(price) : null,
            currency: currency.toUpperCase(),
            priority,
            category,
            planned_date: planned || null,
          },
          file ? await compressPhoto(file) : null,
          target,
        );
        c.local((s) => ({
          ...s,
          lists: s.lists.some((l) => l.id === target.id)
            ? s.lists
            : [...s.lists, target],
          wishes: [queued, ...s.wishes],
        }));
        setSelected(target.id);
        localStorage.setItem(`arcade-last-wishlist:${c.user}`, target.id);
        if (navigator.onLine && c.couple) void c.retry();
        return;
      }
      if (!c.preview) {
        const resolved = await resolveWishList(
          c.db!,
          c.user,
          target.id,
          target,
        );
        target = { ...target, id: resolved };
      } else if (target.id.startsWith("local:")) {
        target = { ...target, id: crypto.randomUUID() };
        c.local((s) => ({ ...s, lists: [...s.lists, target] }));
      }
      localStorage.setItem(`arcade-last-wishlist:${c.user}`, target.id);
      const data = {
        title: title.trim(),
        note,
        url: safeLink(url),
        price: price ? Number(price) : null,
        currency: currency.toUpperCase(),
        priority,
        category,
        planned_date: planned || null,
        image_path: file ? await c.upload(file) : editing?.image_path || null,
      };
      const id = editing?.id || crypto.randomUUID();
      if (!editing && !c.preview) {
        setOptimistic({
          id,
          list_id: target.id,
          created_by: c.user,
          status: "wished",
          done_at: null,
          position: 0,
          created_at: new Date().toISOString(),
          ...data,
        });
        setAdding(false);
      }
      if (c.preview)
        c.local((s) => ({
          ...s,
          wishes: editing
            ? s.wishes.map((w) => (w.id === editing.id ? { ...w, ...data } : w))
            : [
                {
                  id,
                  list_id: target.id,
                  created_by: c.user,
                  status: "wished",
                  done_at: null,
                  position: 0,
                  created_at: new Date().toISOString(),
                  ...data,
                },
                ...s.wishes,
              ],
        }));
      else {
        const r = editing
          ? await c.db!.from("wishlist_items").update(data).eq("id", editing.id)
          : await c
              .db!.from("wishlist_items")
              .insert({ id, ...data, list_id: target.id });
        if (r.error && !editing && r.error.code === "23503") {
          const recovered = await resolveWishList(
            c.db!,
            c.user,
            target.id,
            target,
          );
          const retried = await c
            .db!.from("wishlist_items")
            .insert({ id, ...data, list_id: recovered });
          if (retried.error) throw new Error(retried.error.message);
        } else if (r.error) throw new Error(r.error.message);
      }
    });
    if (ok) setAdding(false);
    else {
      setOptimistic(null);
      setAdding(true);
    }
  }
  async function change(w: Wish, fields: Partial<Wish>) {
    return await c.run(async () => {
      if (c.preview)
        c.local((s) => ({
          ...s,
          wishes: s.wishes.map((i) =>
            i.id === w.id ? { ...i, ...fields } : i,
          ),
        }));
      else {
        const r = await c
          .db!.from("wishlist_items")
          .update(fields)
          .eq("id", w.id);
        if (r.error) throw new Error(r.error.message);
      }
    });
  }
  async function claim(w: Wish, status: string) {
    await c.run(async () => {
      if (c.preview)
        c.local((s) => ({
          ...s,
          claims: [
            ...s.claims.filter((i) => i.item_id !== w.id),
            { item_id: w.id, claimed_by: c.user, status },
          ],
        }));
      else {
        const r = await c
          .db!.from("wishlist_claims")
          .upsert({ item_id: w.id, status });
        if (r.error) throw new Error(r.error.message);
      }
    });
  }
  async function removeWish(w: Wish) {
    if (!window.confirm(`Delete “${w.title}”? This also removes its comments.`))
      return;
    const saved = await c.run(async () => {
      if (c.preview) {
        c.local((s) => ({
          ...s,
          wishes: s.wishes.filter((i) => i.id !== w.id),
          claims: s.claims.filter((i) => i.item_id !== w.id),
          comments: s.comments.filter((i) => i.item_id !== w.id),
        }));
      } else {
        const r = await c.db!.from("wishlist_items").delete().eq("id", w.id);
        if (r.error) throw new Error(r.error.message);
      }
    });
    if (saved) {
      if (commentFor === w.id) {
        setCommentFor("");
        setComment("");
      }
    }
  }
  async function removeList() {
    if (!list || !editable) return;
    const removing = list.id;
    const saved = await c.run(async () => {
      if (c.preview) {
        if (
          (list.type === "secret" || list.type === "custom") &&
          !c.lists.some(
            (l) =>
              l.id !== removing &&
              l.type === list.type &&
              l.owner_id === list.owner_id,
          )
        )
          throw new Error("Keep at least one list.");
        c.local((s) => {
          const ids = new Set(
            s.wishes.filter((w) => w.list_id === removing).map((w) => w.id),
          );
          const remaining = s.lists.filter((l) => l.id !== removing);
          for (const fallback of temporaryDefaults(c.user)) {
            if (
              !remaining.some(
                (l) =>
                  l.type === fallback.type &&
                  (l.type === "shared" || l.owner_id === c.user),
              )
            )
              remaining.push({ ...fallback, id: crypto.randomUUID() });
          }
          return {
            ...s,
            lists: remaining,
            wishes: moveTo
              ? s.wishes.map((w) =>
                  ids.has(w.id) ? { ...w, list_id: moveTo } : w,
                )
              : s.wishes.filter((w) => !ids.has(w.id)),
            claims: s.claims.filter((i) => !ids.has(i.item_id)),
            comments: s.comments.filter((i) => !ids.has(i.item_id)),
          };
        });
      } else {
        const r = await c.db!.rpc("manage_wishlist", {
          lid: removing,
          destination: moveTo || null,
        });
        if (r.error) throw new Error(r.error.message);
      }
    });
    if (saved) {
      setSelected("");
      setRemovingList(false);
      setMoveTo("");
    }
  }
  const jarData = optimistic
    ? [...c.wishes.filter((w) => w.id !== optimistic.id), optimistic]
    : c.wishes;
  const reveal = jarWish && (
    <WishJarReveal
      wish={jarWish}
      editable={
        !!lists.find(
          (l) =>
            l.id === jarWish.list_id &&
            (l.type === "shared" ||
              l.type === "custom" ||
              l.owner_id === c.user),
        )
      }
      close={() => setJarWish(null)}
      edit={() => {
        setJarWish(null);
        setJarOpen(false);
        edit(jarWish);
      }}
      complete={async () => {
        if (
          await change(jarWish, {
            status: "done",
            done_at: new Date().toISOString(),
          })
        )
          setJarWish(null);
      }}
    />
  );
  if (jarOpen)
    return (
      <section className="keepsake-page wish-jar-room">
        <KeepsakeFeedback />
        <div className="page-heading">
          <div>
            <h2>Our wish jar</h2>
            <p>A little pile of someday.</p>
          </div>
          <button className="text-button" onClick={() => setJarOpen(false)}>
            Back to lists <X size={18} />
          </button>
        </div>
        <div className="list-tabs" aria-label="Choose lists for the jar">
          {lists.map((l) => (
            <button
              key={l.id}
              aria-pressed={(jarLists || lists.map((x) => x.id)).includes(l.id)}
              className={
                (jarLists || lists.map((x) => x.id)).includes(l.id)
                  ? ""
                  : "secondary"
              }
              onClick={() =>
                setJarLists((old) => {
                  const ids = old || lists.map((x) => x.id);
                  return ids.includes(l.id)
                    ? ids.filter((id) => id !== l.id)
                    : [...ids, l.id];
                })
              }
            >
              {wishListLabel(l, c.user)}
            </button>
          ))}
        </div>
        <WishJar
          wishes={jarWishes(jarData, lists, c.user, jarLists || undefined)}
          lists={lists}
          user={c.user}
          scope={`full:${[...(jarLists || lists.map((l) => l.id))].sort().join(":")}`}
          onPick={setJarWish}
        />
        <details className="jar-plain-list">
          <summary>See wishes as a list</summary>
          <ul>
            {jarWishes(jarData, lists, c.user, jarLists || undefined).map(
              (w) => (
                <li key={w.id}>
                  <button className="text-button" onClick={() => setJarWish(w)}>
                    {w.title}
                  </button>
                </li>
              ),
            )}
          </ul>
        </details>
        {reveal}
      </section>
    );
  return (
    <section className="keepsake-page wishlist-page">
      <div className="wish-hero">
        <div className="wish-hero-copy">
          <h2>
            Small wishes.
            <br />A jar of someday.
          </h2>
          <p>
            {list ? `Little dreams in ${wishListLabel(list, c.user)}.` : "Make your first wish."}
          </p>
          <div className="wish-hero-actions">
            <button onClick={() => edit(null)}>
              Make a wish <Plus size={18} />
            </button>
            <button className="secondary" onClick={() => setJarOpen(true)}>
              Open our jar <Heart size={18} />
            </button>
          </div>
        </div>
        <WishJar
          wishes={jarWishes(
            jarData,
            lists,
            c.user,
            list ? [list.id] : undefined,
          )}
          lists={lists}
          user={c.user}
          scope={list?.id || "all"}
          onPick={setJarWish}
        />
      </div>
      <KeepsakeFeedback />
      <nav className="list-tabs" aria-label="Wishlists">
        {lists.map((l) => (
          <button
            className={l.id === list?.id ? "" : "secondary"}
            key={l.id}
            onClick={() => setSelected(l.id)}
          >
            {l.type === "secret" && <Lock size={16} />} {wishListLabel(l, c.user)}
          </button>
        ))}
      </nav>
      <details className="new-list">
        <summary>Create a list</summary>
        <form onSubmit={createList}>
          <label>
            List name
            <input
              required
              maxLength={80}
              value={listTitle}
              onChange={(e) => setListTitle(e.target.value)}
            />
          </label>
          <label>
            Who is it for?
            <select
              value={listType}
              onChange={(e) => setListType(e.target.value as WishList["type"])}
            >
              <option value="shared">Our wishlist · both can edit</option>
              <option value="personal">
                My wishlist · partner can surprise me
              </option>
              <option value="secret">Secret ideas · only I can see</option>
              <option value="custom">Shared custom list</option>
            </select>
          </label>
          <button disabled={c.busy}>
            Create list <Plus size={17} />
          </button>
        </form>
      </details>
      {list ? (
        <>
          <div className="wish-tools">
            <p>
              {all.filter((w) => w.status === "done").length} of {all.length}{" "}
              dreams done
              {list.type === "secret" ? " · visible only to you" : ""}
            </p>
            {editable && (
              <button
                className="secondary"
                disabled={c.busy}
                onClick={() => {
                  setMoveTo("");
                  setRemovingList(true);
                }}
              >
                Delete list <Trash2 size={18} />
              </button>
            )}
          </div>
          <div className="wish-filters">
            <label>
              Status
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All wishes</option>
                <option value="wished">Wished</option>
                <option value="planned">Planned</option>
                <option value="done">Done / received</option>
              </select>
            </label>
            <label>
              Wish level
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="all">All levels</option>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n} hearts
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ol className="wish-pages">
            {wishes.map((w, index) => (
              <li
                key={w.id}
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  swipe.current = { id: w.id, x: t.clientX, y: t.clientY };
                }}
                onTouchEnd={(e) => {
                  const t = e.changedTouches[0],
                    s = swipe.current;
                  swipe.current = null;
                  if (
                    editable &&
                    s?.id === w.id &&
                    t.clientX - s.x > 90 &&
                    Math.abs(t.clientY - s.y) < 30
                  )
                    void change(w, {
                      status: "done",
                      done_at: new Date().toISOString(),
                    });
                }}
              >
                <div className="wish-item-heading">
                  <h3>{w.title}</h3>
                  <span aria-label={`${w.priority} hearts`}>
                    {Array.from({ length: w.priority }, (_, i) => (
                      <Heart key={i} size={16} />
                    ))}
                  </span>
                </div>
                <Photo path={w.image_path} alt={w.title} />
                {w.note && <p>{w.note}</p>}
                {w.url && (
                  <a href={safeLink(w.url)} target="_blank" rel="noreferrer">
                    Open wish link
                  </a>
                )}
                {(Number(w.price) > 0 || w.category || w.planned_date) && (
                  <p className="wish-meta">
                    {[
                      Number(w.price) > 0
                        ? `${w.currency} ${Number(w.price).toLocaleString()}`
                        : "",
                      w.category,
                      w.planned_date,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {list.type === "personal" &&
                  list.owner_id === c.user &&
                  w.status === "done" && <ReceivedGift wish={w} />}
                <div className="wish-actions">
                  {editable && (
                    <>
                      <label>
                        Status
                        <select
                          value={w.status}
                          onChange={(e) =>
                            void change(w, {
                              status: e.target.value as Wish["status"],
                              done_at:
                                e.target.value === "done"
                                  ? new Date().toISOString()
                                  : null,
                            })
                          }
                        >
                          <option value="wished">Wished</option>
                          <option value="planned">Planned</option>
                          <option value="done">Done / received</option>
                        </select>
                      </label>
                      <button
                        className="secondary"
                        disabled={c.busy}
                        onClick={() => edit(w)}
                      >
                        Edit
                      </button>
                      <button
                        className="secondary"
                        aria-label={`Move ${w.title} earlier`}
                        disabled={index === 0 || c.busy}
                        onClick={() =>
                          void change(w, {
                            position: (wishes[index - 1]?.position || 0) - 1,
                          })
                        }
                      >
                        <ArrowUp size={18} />
                        Move up
                      </button>
                      <button
                        className="secondary wish-delete"
                        disabled={c.busy}
                        onClick={() => void removeWish(w)}
                        aria-label={`Delete ${w.title}`}
                      >
                        <Trash2 size={17} /> Delete
                      </button>
                    </>
                  )}
                  {list.type === "personal" && list.owner_id !== c.user && (
                    <>
                      <button
                        disabled={c.busy}
                        className="secondary"
                        onClick={() => void claim(w, "getting")}
                      >
                        I’ll get this
                      </button>
                      <button
                        disabled={c.busy}
                        className="secondary"
                        onClick={() => void claim(w, "bought")}
                      >
                        Already bought
                      </button>
                      <span className="wish-claim-status" role="status">
                        {c.claims.find(
                          (i) => i.item_id === w.id && i.claimed_by === c.user,
                        )?.status === "bought"
                          ? "Bought · only you can see"
                          : c.claims.some(
                                (i) =>
                                  i.item_id === w.id && i.claimed_by === c.user,
                              )
                            ? "Claimed · only you can see"
                            : ""}
                      </span>
                    </>
                  )}
                  <button
                    className="secondary"
                    disabled={c.busy}
                    aria-label={`Heart ${w.title}`}
                    onClick={() =>
                      void c.run(async () => {
                        if (c.preview) return;
                        const r = await c
                          .db!.from("wishlist_reactions")
                          .upsert({ item_id: w.id, kind: "heart" });
                        if (r.error) throw new Error(r.error.message);
                      })
                    }
                  >
                    <Heart size={17} /> Love this
                  </button>
                </div>
                <details>
                  <summary>Our little comments</summary>
                  {c.comments
                    .filter((i) => i.item_id === w.id)
                    .map((i) => (
                      <p key={i.id}>
                        {i.author === c.user ? "You" : "Your person"}: {i.body}
                      </p>
                    ))}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void c.run(async () => {
                        if (c.preview)
                          c.local((s) => ({
                            ...s,
                            comments: [
                              ...s.comments,
                              {
                                id: crypto.randomUUID(),
                                item_id: w.id,
                                author: c.user,
                                body: comment,
                                created_at: new Date().toISOString(),
                              },
                            ],
                          }));
                        else {
                          const r = await c
                            .db!.from("wishlist_comments")
                            .insert({ item_id: w.id, body: comment });
                          if (r.error) throw new Error(r.error.message);
                        }
                        setComment("");
                      });
                    }}
                  >
                    <label>
                      Comment
                      <input
                        required
                        maxLength={1000}
                        value={commentFor === w.id ? comment : ""}
                        onChange={(e) => {
                          setCommentFor(w.id);
                          setComment(e.target.value);
                        }}
                      />
                    </label>
                    <button disabled={c.busy}>Add comment</button>
                  </form>
                </details>
              </li>
            ))}
          </ol>
          {!wishes.length && (
            <div className="keepsake-empty">
              <Slot name="wishlist-empty-mascot" alt="Wishlist artwork">
                <Gift size={54} />
              </Slot>
              <h3>
                {all.length
                  ? "No wishes match this filter."
                  : "Make your first wish."}
              </h3>
              {!all.length && (
                <button onClick={() => edit(null)}>
                  Make a wish <Plus size={18} />
                </button>
              )}
            </div>
          )}
          <p className="wish-budget">
            Estimated wishes:{" "}
            {Array.from(
              new Set(
                all.filter((w) => w.price !== null).map((w) => w.currency),
              ),
            )
              .map(
                (cur) =>
                  `${cur} ${all
                    .filter((w) => w.currency === cur && w.status !== "done")
                    .reduce((s, w) => s + Number(w.price || 0), 0)
                    .toLocaleString()}`,
              )
              .join(" · ") || "No prices added"}
          </p>
        </>
      ) : (
        <div className="keepsake-empty">
          <Gift size={54} />
          <p>Make your first wish.</p>
        </div>
      )}
      {reveal}
      {removingList && (
        <div className="sheet-backdrop">
          <section
            className="keepsake-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Delete wishlist"
          >
            <h2>Delete {list?.title}?</h2>
            <p>
              {all.length
                ? "Move your wishes to another list, or delete them with this list."
                : "Your default wishlist will stay available."}
            </p>
            <div className="list-tabs">
              <button
                className={!moveTo ? "" : "secondary"}
                onClick={() => setMoveTo("")}
              >
                Delete wishes too
              </button>
              {writableLists(lists, c.user)
                .filter(
                  (l) =>
                    l.id !== list?.id &&
                    (list?.type !== "secret" || l.type === "secret"),
                )
                .map((l) => (
                  <button
                    key={l.id}
                    className={moveTo === l.id ? "" : "secondary"}
                    onClick={() => setMoveTo(l.id)}
                  >
                    Move to {wishListLabel(l, c.user)}
                  </button>
                ))}
            </div>
            {c.error && (
              <p role="alert" className="error">
                {c.error}
              </p>
            )}
            <button disabled={c.busy} onClick={() => void removeList()}>
              Confirm deletion
            </button>
            <button
              className="secondary"
              onClick={() => setRemovingList(false)}
            >
              Cancel
            </button>
          </section>
        </div>
      )}
      {adding && (
        <div className="sheet-backdrop">
          <section
            ref={sheet}
            className="keepsake-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wish-title"
          >
            <div className="sheet-heading">
              <h2 id="wish-title">
                {editing ? "A wish, updated." : "Make a little wish."}
              </h2>
              <button
                className="secondary"
                aria-label="Close wish form"
                onClick={() => setAdding(false)}
              >
                <X />
              </button>
            </div>
            {c.error && (
              <p className="error" role="alert">
                {c.error}
              </p>
            )}
            <form onSubmit={save}>
              {!editing && (
                <>
                  <div className="list-tabs" aria-label="Save wish to">
                    {writableLists(sourceLists, c.user).map((l) => (
                      <button
                        type="button"
                        key={l.id}
                        aria-pressed={wishListId === l.id}
                        className={wishListId === l.id ? "" : "secondary"}
                        onClick={() => setWishListId(l.id)}
                      >
                        {wishListLabel(l, c.user)}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setInlineList(!inlineList)}
                    >
                      + New list
                    </button>
                  </div>
                  {inlineList && (
                    <div className="new-list-inline">
                      <label>
                        List name
                        <input
                          maxLength={80}
                          value={listTitle}
                          onChange={(e) => setListTitle(e.target.value)}
                        />
                      </label>
                      <div className="list-tabs" aria-label="List type">
                        {(["shared", "personal", "secret"] as const).map(
                          (type, i) => (
                            <button
                              type="button"
                              key={type}
                              aria-pressed={listType === type}
                              className={listType === type ? "" : "secondary"}
                              onClick={() => setListType(type)}
                            >
                              {["Ours", "Mine", "Secret"][i]}
                            </button>
                          ),
                        )}
                      </div>
                      <label>
                        Color
                        <input
                          type="color"
                          value={listColor}
                          onChange={(e) => setListColor(e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={!listTitle.trim() || c.busy}
                        onClick={(e) => void createList(e)}
                      >
                        Create and select
                      </button>
                    </div>
                  )}
                </>
              )}
              <label>
                Wish title
                <input
                  required
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                A little note
                <textarea
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <label>
                Link (optional)
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onBlur={() => void fillLink()}
                />
              </label>
              <div className="form-pair">
                <label>
                  Price
                  <input
                    type="number"
                    min="0"
                    max="1000000000"
                    step=".01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </label>
                <label>
                  Currency
                  <input
                    maxLength={3}
                    minLength={3}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  />
                </label>
              </div>
              <label>
                Category
                <input
                  maxLength={40}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </label>
              <label>
                Wish level
                <select
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n} hearts
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Planned for
                <input
                  type="date"
                  value={planned}
                  onChange={(e) => setPlanned(e.target.value)}
                />
              </label>
              <label>
                Photo (optional)
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
              <NativePhotoButton onPhoto={setFile} />
              <button disabled={c.busy}>
                {c.busy ? "Saving…" : "Save wish"}
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
export { default as Memories } from "./MemoryAlbum";
export function Notes() {
  const c = useKeepsakes(),
    bodies = useContext(PreviewBodies),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [unlock, setUnlock] = useState(""),
    [occasion, setOccasion] = useState(""),
    [file, setFile] = useState<Blob | null>(null),
    [kind, setKind] = useState("photo"),
    [recording, setRecording] = useState(false),
    [opened, setOpened] = useState<{
      id: string;
      content: NoteBody;
      author: string;
      title: string;
      favorite: boolean;
    } | null>(null),
    [voiceUrl, setVoiceUrl] = useState(""),
    [letterOpening, setLetterOpening] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    letterDialog = useRef<HTMLElement | null>(null);
  async function finishLetter(keep = false) {
    if (!opened) return;
    const ok = await c.run(async () => {
      if (opened.author !== c.user) {
        if (c.preview) {
          c.local((s) => ({
            ...s,
            letters: s.letters.flatMap((n) =>
              n.id !== opened.id
                ? [n]
                : keep || opened.favorite
                  ? [{ ...n, recipient_favorite: true }]
                  : [],
            ),
          }));
          if (!keep && !opened.favorite) delete bodies[opened.id];
        } else {
          const r = await c.db!.rpc("finish_love_note", {
            nid: opened.id,
            keep,
          });
          if (r.error) throw new Error(r.error.message);
        }
      }
    });
    if (ok) {
      if (keep) setOpened({ ...opened, favorite: true });
      else setOpened(null);
    }
  }
  const closeLetter = useRef(() => {});
  closeLetter.current = () => {
    if (letterOpening) setLetterOpening(false);
    else if (!c.busy) void finishLetter();
  };
  useEffect(() => {
    if (!opened) return;
    const previous = document.activeElement as HTMLElement | null;
    letterDialog.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLetter.current();
      if (e.key === "Tab") {
        const items = Array.from(
          letterDialog.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),audio,[href]",
          ) || [],
        );
        const first = items[0],
          last = items.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === letterDialog.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, [opened?.id]);
  useEffect(() => {
    if (!letterOpening) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) {
      setLetterOpening(false);
      return;
    }
    const timer = window.setTimeout(() => setLetterOpening(false), 2400);
    return () => window.clearTimeout(timer);
  }, [letterOpening, opened?.id]);
  useEffect(() => {
    if (opened && !letterOpening) letterDialog.current?.focus();
  }, [letterOpening, opened?.id]);
  useEffect(() => {
    setOpened(null);
    setBody("");
    setTitle("");
    setFile(null);
  }, [c.user]);
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  useEffect(() => {
    let active = true;
    if (opened?.content.media_kind === "voice" && opened.content.media_path)
      c.signed(opened.content.media_path)
        .then((u) => {
          if (active) setVoiceUrl(u);
        })
        .catch(
          () =>
            void c.run(async () => {
              throw new Error(
                "Voice note could not load. Close the letter and open it again.",
              );
            }),
        );
    return () => {
      active = false;
      setVoiceUrl("");
    };
  }, [opened]);
  async function record() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const r = new MediaRecorder(stream.current),
        chunks: BlobPart[] = [];
      recorder.current = r;
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        setFile(new Blob(chunks, { type: r.mimeType }));
        setKind("voice");
        setRecording(false);
        stream.current?.getTracks().forEach((t) => t.stop());
      };
      r.start();
      setRecording(true);
      setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 60000);
    } catch (e) {
      const isDenied =
        e instanceof Error &&
        (e.name === "NotAllowedError" ||
          /permission denied|not allowed/i.test(e.message));
      await c.run(async () => {
        throw new Error(
          isDenied
            ? "Microphone access was denied. In your Android app or browser settings, allow microphone access, then try again."
            : "Microphone access is unavailable. You can write a note or attach a photo.",
        );
      });
    }
  }
  return (
    <section className="keepsake-page notes-page">
      <div className="page-heading">
        <div>
          <h1>Little words. Big feelings.</h1>
          <p>A letter for now, or a surprise for later.</p>
        </div>
        <Mail size={32} />
      </div>
      <KeepsakeFeedback />
      <details className="letter-composer">
        <summary>
          Write a little letter <Plus size={18} />
        </summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void c.run(async () => {
              const id = crypto.randomUUID(),
                content = {
                  body,
                  media_path: file ? await c.upload(file, kind) : null,
                  media_kind: file ? kind : null,
                },
                data = {
                  id,
                  author: c.user,
                  title,
                  unlock_at: unlock
                    ? new Date(unlock + "T00:00:00").toISOString()
                    : null,
                  open_when: occasion,
                  opened_at: null,
                  created_at: new Date().toISOString(),
                };
              if (c.preview) {
                bodies[id] = content;
                c.local((s) => ({ ...s, letters: [data, ...s.letters] }));
              } else {
                const r = await c.db!.rpc("save_love_note", {
                  nid: id,
                  t: title,
                  b: body,
                  unlock: data.unlock_at,
                  occasion,
                  path: content.media_path,
                  media: content.media_kind,
                });
                if (r.error) throw new Error(r.error.message);
                const { gameRequest } = await import("@/lib/game-request");
                void gameRequest(c.db!, { kind: "letter", id }, fetch, "/api/push/media").catch(() => {});
              }
              setTitle("");
              setBody("");
              setFile(null);
            });
          }}
        >
          <label>
            Title
            <input
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Your words
            <textarea
              required
              maxLength={10000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <label>
            Keep sealed until (optional)
            <input
              type="date"
              value={unlock}
              onChange={(e) => setUnlock(e.target.value)}
            />
          </label>
          <label>
            Open when…
            <select
              value={occasion}
              onChange={(e) => setOccasion(e.target.value)}
            >
              <option value="">Any time</option>
              <option value="sad">I’m sad</option>
              <option value="sleepless">I can’t sleep</option>
              <option value="missing">I miss you</option>
            </select>
          </label>
          <label>
            Photo (optional)
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setKind("photo");
              }}
            />
          </label>
          <NativePhotoButton
            onPhoto={(photo) => {
              setFile(photo);
              setKind("photo");
            }}
          />
          <button
            type="button"
            className="secondary"
            onClick={() =>
              recording ? recorder.current?.stop() : void record()
            }
          >
            {recording ? <Square size={18} /> : <Mic size={18} />}{" "}
            {recording ? "Stop recording" : "Record a voice note · up to 1 min"}
          </button>
          {file && (
            <p>{kind === "voice" ? "Voice note ready." : "Photo ready."}</p>
          )}
          <button disabled={c.busy || recording}>
            {c.busy ? "Saving…" : "Seal my letter"} <Heart size={18} />
          </button>
        </form>
      </details>
      <ol className="letters">
        {c.letters
          .slice()
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((n) => {
            const sealed =
              n.author !== c.user &&
              !!n.unlock_at &&
              new Date(n.unlock_at) > new Date();
            return (
              <li key={n.id}>
                <Mail size={28} />
                <div>
                  <h2>{n.title}</h2>
                  <p>
                    {n.author === c.user ? "From you" : "From your person"}
                    {n.open_when && ` · open when ${n.open_when}`}
                  </p>
                  {n.unlock_at && (
                    <p>Opens {new Date(n.unlock_at).toLocaleDateString()}</p>
                  )}
                </div>
                <button
                  className="secondary"
                  disabled={sealed || c.busy}
                  onClick={() =>
                    void c.run(async () => {
                      const content = await c.open(n.id);
                      setLetterOpening(
                        !window.matchMedia("(prefers-reduced-motion: reduce)")
                          .matches,
                      );
                      setOpened({
                        id: n.id,
                        content,
                        author: n.author,
                        title: n.title,
                        favorite: !!n.recipient_favorite,
                      });
                    })
                  }
                >
                  {sealed ? <Lock size={18} /> : <Heart size={18} />}{" "}
                  {sealed ? "Still sealed" : "Open letter"}
                </button>
              </li>
            );
          })}
      </ol>
      {opened && (
        <div className="letter-reveal-backdrop">
          <article
            className={`open-letter ${letterOpening ? "is-opening" : "is-reading"}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="open-letter-title"
            tabIndex={-1}
            ref={letterDialog}
          >
            {letterOpening ? (
              <>
                <h2 id="open-letter-title" className="sr-only">
                  {opened.title}
                </h2>
                <div className="letter-envelope-scene" aria-hidden="true">
                  <div className="letter-envelope-shadow" />
                  <div className="letter-envelope">
                    <div className="letter-envelope-back" />
                    <div className="letter-envelope-flap" />
                    <div className="letter-envelope-paper">
                      <span>{opened.title}</span>
                      <i />
                      <i />
                      <i />
                      <Heart size={22} />
                    </div>
                    <div className="letter-envelope-pocket" />
                    <div className="letter-envelope-seal">
                      <Heart size={24} fill="currentColor" />
                    </div>
                  </div>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Heart
                      key={i}
                      className={`letter-floating-heart heart-${i}`}
                      fill="currentColor"
                      size={24 + i * 3}
                    />
                  ))}
                </div>
                <button
                  className="secondary letter-skip"
                  onClick={() => setLetterOpening(false)}
                >
                  Read letter
                </button>
              </>
            ) : (
              <>
                <div className="letter-paper-heading"><h2 id="open-letter-title">{opened.title}</h2><span className="letter-paper-seal" aria-hidden="true"><Heart size={23} /></span></div>
                <p className="handwritten">{opened.content.body}</p>
                {opened.content.media_kind === "photo" && (
                  <Photo
                    path={opened.content.media_path}
                    alt="Photo enclosed in your letter"
                  />
                )}
                {voiceUrl && <audio controls src={voiceUrl} />}
                <div className="letter-reader-actions">
                  <button
                    className="secondary"
                    disabled={c.busy}
                    onClick={() => void finishLetter()}
                  >
                    Close letter <X size={17} />
                  </button>
                  {opened.author !== c.user && (
                    <button
                      disabled={c.busy || opened.favorite}
                      onClick={() => void finishLetter(true)}
                    >
                      <Heart
                        size={17}
                        fill={opened.favorite ? "currentColor" : "none"}
                      />
                      {opened.favorite ? "Favorited" : "Favorite to keep"}
                    </button>
                  )}
                </div>
                {opened.author !== c.user && !opened.favorite && (
                  <p className="letter-read-once">
                    This letter disappears when you close it. Favorite it to
                    keep it.
                  </p>
                )}

              </>
            )}
          </article>
        </div>
      )}
      {!c.letters.length && (
        <div className="keepsake-empty">
          <Mail size={54} />
          <h2>A jar full of things to say.</h2>
          <p>Write your first letter above.</p>
        </div>
      )}
    </section>
  );
}


