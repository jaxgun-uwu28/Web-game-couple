"use client";
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
  Shuffle,
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
import { Capacitor } from "@capacitor/core";
import NativePhotoButton from "./NativePhotoButton";
import {resetExtraPreviews} from '@/lib/extra-games';
import {resetPreviewProgress} from '@/lib/preview-progress';
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
  useEffect(()=>()=>{delete document.documentElement.dataset.arcadeTheme;resetExtraPreviews();resetPreviewProgress();},[]);
  const refresh = useCallback(async () => {
    if (preview || !db || !session || !couple) return;
    const tables = [
      "wishlists",
      "wishlist_items",
      "memories",
      "love_notes",
      "wishlist_claims",
      "wishlist_comments",
    ];
    const results = await Promise.all(
      tables.map((t) => db.from(t).select("*")),
    );
    const failed = results.find((r) => r.error);
    if (failed) {
      setError(
        failed.error?.code === "42P01"
          ? "Run migration 006 in Supabase to open wishes, memories and notes."
          : failed.error!.message,
      );
      return;
    }
    setState({
      lists: results[0].data as WishList[],
      wishes: results[1].data as Wish[],
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
      navigator.vibrate?.(12);
      const queued = preview ? 0 : (await pendingWishes(user)).length;
      setPending(queued);
      setMessage(
        queued
          ? "Saved on this device. Queued wishes will sync when connected."
          : "Saved in your private keepsake.",
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
export function Photo({ path, alt }: { path: string | null; alt: string }) {
  const c = useKeepsakes(),
    [url, setUrl] = useState(""),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let canceled = false;
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
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="private-photo">
      <img src={url} alt={alt} loading="lazy" />
    </a>
  ) : path ? (
    <p>
      {failed
        ? "Photo could not load. Refresh to retry."
        : "Opening private photo…"}
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
    <button className="wish-shortcut secondary" onClick={go}>
      <Gift />
      <span>{latest ? latest.title : "Make room for a little wish."}</span>
      <span>Open wishlists</span>
    </button>
  );
}
export function KeepsakeBackup() {
  const c = useKeepsakes();
  return (
    <section className="nickname-setting">
      <h2>A copy of our little world.</h2>
      <p>
        Download your visible wishes, memories and opened letters with their
        private media. Sealed contents and your partner’s secrets stay sealed.
      </p>
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
        Download private backup <Download size={18} />
      </button>
    </section>
  );
}
export function Wishlists() {
  const c = useKeepsakes();
  const [selected, setSelected] = useState(""),
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
    [picked, setPicked] = useState(""),
    [comment, setComment] = useState(""),
    [commentFor, setCommentFor] = useState("");
  const lists = c.lists.filter(
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
    setAdding(false);
    setEditing(null);
    setComment("");
    setListTitle("");
    setPicked("");
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
      };
      if (c.preview) c.local((s) => ({ ...s, lists: [...s.lists, data] }));
      else {
        const r = await c.db!.from("wishlists").insert(data);
        if (r.error) throw new Error(r.error.message);
      }
      setSelected(data.id);
      setListTitle("");
    });
  }
  function edit(w: Wish | null) {
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
    const ok = await c.run(async () => {
      if (!list) throw new Error("Create a list first.");
      if (url && !safeLink(url)) throw new Error("Use an http or https link.");
      if (!c.preview && !navigator.onLine) {
        if (editing)
          throw new Error(
            "Wish edits need a connection. Your changes are still here.",
          );
        if (!title.trim()) throw new Error("Give your wish a title.");
        await enqueueWish(
          c.user,
          c.couple!,
          {
            id: crypto.randomUUID(),
            list_id: list.id,
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
        );
        return;
      }
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
      if (c.preview)
        c.local((s) => ({
          ...s,
          wishes: editing
            ? s.wishes.map((w) => (w.id === editing.id ? { ...w, ...data } : w))
            : [
                {
                  id: crypto.randomUUID(),
                  list_id: list.id,
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
              .insert({ ...data, list_id: list.id });
        if (r.error) throw new Error(r.error.message);
      }
    });
    if (ok) setAdding(false);
  }
  async function change(w: Wish, fields: Partial<Wish>) {
    await c.run(async () => {
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
  return (
    <section className="keepsake-page wishlist-page">
      <div className="page-heading">
        <div>
          <h2>Small wishes. Shared dreams.</h2>
          <p>A someday, a surprise, a little plan.</p>
        </div>
        <Gift size={32} />
      </div>
      <KeepsakeFeedback />
      <nav className="list-tabs" aria-label="Wishlists">
        {lists.map((l) => (
          <button
            className={l.id === list?.id ? "" : "secondary"}
            key={l.id}
            onClick={() => setSelected(l.id)}
          >
            {l.type === "secret" && <Lock size={16} />} {l.title}
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
              <button onClick={() => edit(null)}>
                Make a wish <Plus size={18} />
              </button>
            )}
            <button
              className="secondary"
              disabled={!all.some((w) => w.status !== "done")}
              onClick={() => {
                const options = all.filter((w) => w.status !== "done");
                setPicked(
                  options[Math.floor(Math.random() * options.length)].title,
                );
                navigator.vibrate?.(25);
              }}
            >
              Shake the wish jar <Shuffle size={18} />
            </button>
          </div>
          {picked && (
            <p className="jar-pick" role="status">
              How about… {picked}?
            </p>
          )}
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
                <p>{w.note}</p>
                {w.url && (
                  <a href={safeLink(w.url)} target="_blank" rel="noreferrer">
                    Open wish link
                  </a>
                )}
                <p className="wish-meta">
                  {w.price !== null &&
                    `${w.currency} ${Number(w.price).toLocaleString()} · `}
                  {w.category}
                  {w.planned_date && ` · ${w.planned_date}`}
                </p>
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
                      <button className="secondary" onClick={() => edit(w)}>
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
                      <span>
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
              <h3>A little dream starts here.</h3>
              <p>Add a wish, or try another filter.</p>
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
          <p>Create your first list above.</p>
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
export function Memories() {
  const c = useKeepsakes(),
    [caption, setCaption] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [swap, setSwap] = useState(false);
  const visible = c.memories
    .filter(
      (m) =>
        !m.swap_day ||
        m.author === c.user ||
        c.memories.filter((i) => i.swap_day === m.swap_day).length === 2,
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <section className="keepsake-page">
      <div className="page-heading">
        <div>
          <h1>Keep this little moment.</h1>
          <p>Your shared album, one ordinary day at a time.</p>
        </div>
        <ImagePlus size={32} />
      </div>
      <KeepsakeFeedback />
      <form
        className="memory-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void c.run(async () => {
            if (!file) throw new Error("Choose a photo first.");
            const data = {
              id: crypto.randomUUID(),
              caption,
              image_path: await c.upload(file),
              swap_day: swap ? manilaDay() : null,
              author: c.user,
              created_at: new Date().toISOString(),
            };
            if (c.preview)
              c.local((s) => ({ ...s, memories: [data, ...s.memories] }));
            else {
              const r = await c.db!.from("memories").insert(data);
              if (r.error) throw new Error(r.error.message);
            }
            setCaption("");
            setFile(null);
          });
        }}
      >
        <label>
          Photo from camera or library
          <input
            type="file"
            accept="image/*"
            required={!file}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <NativePhotoButton onPhoto={setFile} />
        {file && <p className="small">Selected: {file.name}</p>}
        <label>
          Caption
          <textarea
            value={caption}
            maxLength={2000}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="What would you like to remember?"
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={swap}
            onChange={(e) => setSwap(e.target.checked)}
          />
          Today’s photo swap · opens after you both post
        </label>
        <button disabled={c.busy}>
          {c.busy ? "Preparing and uploading…" : "Save our moment"}{" "}
          <ImagePlus size={18} />
        </button>
      </form>
      <div className="memory-timeline">
        {visible.map((m) => (
          <article key={m.id}>
            <time>
              {new Date(m.created_at).toLocaleDateString(undefined, {
                dateStyle: "long",
              })}
            </time>
            <Photo path={m.image_path} alt={m.caption || "Shared memory"} />
            <p className="handwritten">{m.caption}</p>
            {m.swap_day && (
              <p>
                {c.memories.filter((i) => i.swap_day === m.swap_day).length ===
                2
                  ? "Both photos are open."
                  : "Your photo is saved. Waiting for your person."}
              </p>
            )}
            <button
              className="secondary"
              disabled={c.busy}
              onClick={() =>
                void c.run(async () => {
                  if (c.preview) return;
                  const r = await c
                    .db!.from("memory_reactions")
                    .upsert({ memory_id: m.id, kind: "heart" });
                  if (r.error) throw new Error(r.error.message);
                })
              }
            >
              <Heart size={17} /> Send a heart
            </button>
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className="keepsake-empty">
          <Slot name="memories-background" alt="Album artwork">
            <ImagePlus size={56} />
          </Slot>
          <h2>Our album is waiting.</h2>
          <p>
            Photos are private, compressed and stripped of location metadata
            before upload.
          </p>
        </div>
      )}
    </section>
  );
}
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
    [opened, setOpened] = useState<{ id: string; content: NoteBody } | null>(
      null,
    ),
    [voiceUrl, setVoiceUrl] = useState("");
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null);
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
    } catch {
      await c.run(async () => {
        throw new Error(
          "Microphone access is unavailable. You can write a note or attach a photo.",
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
                    void c.run(async () =>
                      setOpened({ id: n.id, content: await c.open(n.id) }),
                    )
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
        <article className="open-letter">
          <button className="secondary" onClick={() => setOpened(null)}>
            Close letter <X size={17} />
          </button>
          <p className="handwritten">{opened.content.body}</p>
          {opened.content.media_kind === "photo" && (
            <Photo
              path={opened.content.media_path}
              alt="Photo enclosed in your letter"
            />
          )}
          {voiceUrl && <audio controls src={voiceUrl} />}
        </article>
      )}
      {!c.letters.length && (
        <div className="keepsake-empty">
          <Mail size={54} />
          <h2>A jar full of things to say.</h2>
          <p>
            Write your first letter above. Sealed contents stay private until
            their date.
          </p>
        </div>
      )}
    </section>
  );
}
