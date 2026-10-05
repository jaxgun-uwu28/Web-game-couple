"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import { ImagePlus, Heart, Upload, Check, Music, Trash2 } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import manifest from "@/generated/art-manifest.json";
type Asset = { src: string; kind: string; source: "local" | "private" };
type ArtContext = {
  remote: Record<string, Asset>;
  upload: (slot: string, file: File) => Promise<void>;
  remove: (slot: string) => Promise<void>;
  error: string;
  ready: boolean;
};
const Context = createContext<ArtContext>({
  remote: {},
  upload: async () => {},
  remove: async () => {},
  error: "",
  ready: false,
});
export function ArtProvider({
  db,
  coupleId,
  preview,
  children,
}: {
  db: SupabaseClient | null;
  coupleId: string | null;
  preview: boolean;
  children: ReactNode;
}) {
  const [remote, setRemote] = useState<Record<string, Asset>>({}),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!db || !coupleId || preview) return;
    const { data, error } = await db
      .from("art_slots")
      .select("*")
      .eq("couple_id", coupleId);
    if (error) {
      setError(
        "Private artwork needs the Stage 1 database update. Local artwork still works.",
      );
      return;
    }
    const assets: Record<string, Asset> = {};
    await Promise.all(
      (data || []).map(async (item) => {
        const signed = await db.storage
          .from("app-art")
          .createSignedUrl(item.path, 3600);
        if (signed.data)
          assets[item.slot] = {
            src:
              signed.data.signedUrl +
              `&v=${encodeURIComponent(item.updated_at)}`,
            kind: "image",
            source: "private",
          };
      }),
    );
    setRemote(assets);
    setError("");
  }, [db, coupleId, preview]);
  useEffect(() => {
    if (preview) return;
    if (!db || !coupleId) {
      setRemote({});
      return;
    }
    void load();
    const timer = setInterval(() => void load(), 1800000),
      channel = db
        .channel(`art:${coupleId}`, { config: { private: true } })
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "art_slots",
            filter: `couple_id=eq.${coupleId}`,
          },
          () => void load(),
        )
        .subscribe();
    return () => {
      clearInterval(timer);
      void db.removeChannel(channel);
    };
  }, [db, coupleId, preview, load]);
  const remoteRef = useRef(remote);
  remoteRef.current = remote;
  useEffect(
    () => () => {
      Object.values(remoteRef.current).forEach((a) => {
        if (a.src.startsWith("blob:")) URL.revokeObjectURL(a.src);
      });
    },
    [],
  );
  const upload = async (slot: string, file: File) => {
    if (!/^image\/(jpeg|png|webp|avif|gif)$/.test(file.type))
      throw new Error(
        "Choose a JPG, PNG, WebP, AVIF or GIF image. Local folders also support trusted SVG.",
      );
    if (file.size > 10 * 1024 * 1024)
      throw new Error("Choose an image under 10 MB.");
    const bitmap = await createImageBitmap(file),
      definition = manifest.slots.find((s) => s.name === slot),
      ratio = Math.min(
        1,
        (definition?.width || 1600) / bitmap.width,
        (definition?.height || 1600) / bitmap.height,
      ),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      throw new Error("Your browser could not prepare this image.");
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Image conversion failed."))),
        "image/webp",
        0.86,
      ),
    );
    if (preview) {
      setRemote((previous) => ({
        ...previous,
        [slot]: {
          src: URL.createObjectURL(blob),
          kind: "image",
          source: "private",
        },
      }));
      return;
    }
    if (!db || !coupleId)
      throw new Error("Sign in to upload your private artwork.");
    const path = `${coupleId}/${slot}.webp`,
      result = await db.storage
        .from("app-art")
        .upload(path, blob, { contentType: "image/webp", upsert: true });
    if (result.error) throw new Error(result.error.message);
    const row = await db.from("art_slots").upsert({
      couple_id: coupleId,
      slot,
      path,
      updated_at: new Date().toISOString(),
    });
    if (row.error) throw new Error(row.error.message);
    await load();
  };
  const remove = async (slot: string) => {
    if (!preview) {
      if (!db || !coupleId)
        throw new Error("Sign in to remove your private artwork.");
      const result = await db.storage
        .from("app-art")
        .remove([`${coupleId}/${slot}.webp`]);
      if (result.error)
        throw new Error(
          "Artwork could not be removed. Apply migration 011 and retry.",
        );
      const row = await db
        .from("art_slots")
        .delete()
        .eq("couple_id", coupleId)
        .eq("slot", slot);
      if (row.error)
        throw new Error("The artwork slot could not reset. Retry removal.");
    }
    const old = remoteRef.current[slot];
    if (old?.src.startsWith("blob:")) URL.revokeObjectURL(old.src);
    setRemote((previous) => {
      const next = { ...previous };
      delete next[slot];
      return next;
    });
  };
  return (
    <Context.Provider
      value={{ remote, upload, remove, error, ready: preview || !!coupleId }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAsset(name: string): Asset | null {
  const { remote } = useContext(Context);
  const local = (
    manifest.assets as Record<string, { src: string; kind: string }>
  )[name];
  return remote[name] || (local ? { ...local, source: "local" } : null);
}
export function Slot({
  name,
  alt = "",
  className = "",
  children,
}: {
  name: string;
  alt?: string;
  className?: string;
  children?: ReactNode;
}) {
  const asset = useAsset(name),
    [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [asset?.src]);
  return (
    <div className={`art-slot ${className}`}>
      {asset?.kind === "image" && !failed ? (
        <img
          src={asset.src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="slot-fallback">
          {children || (
            <>
              <ImagePlus size={28} />
              <span>Your photo belongs here</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
function SlotRow({ slot }: { slot: (typeof manifest.slots)[number] }) {
  const asset = useAsset(slot.name),
    { upload, remove, ready } = useContext(Context),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <article className="art-row">
      <Slot
        name={slot.name}
        alt={`Preview of ${slot.name}`}
        className="art-thumbnail"
      >
        {slot.folder === "sounds" ? <Music size={24} /> : <Heart size={24} />}
      </Slot>
      <div>
        <h3>{slot.name.replaceAll("-", " ")}</h3>
        <p>
          {slot.width ? `${slot.width} × ${slot.height} px` : "Optional audio"}{" "}
          ·{" "}
          {asset
            ? `${asset.source === "local" ? "Folder" : "Private"} artwork`
            : "Built-in fallback"}
        </p>
        <code>
          {slot.folder}/{slot.name}
          {slot.width ? ".webp" : ".mp3"}
        </code>
        {message && <p role="status">{message}</p>}
      </div>
      <div className="art-actions">
        {slot.width > 0 ? (
          <label
            className={`upload-button ${busy || !ready ? "disabled" : ""}`}
          >
            <Upload size={16} />
            <span>{busy ? "Preparing…" : asset ? "Replace" : "Upload"}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
              disabled={busy || !ready}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                setMessage("");
                try {
                  await upload(slot.name, file);
                  setMessage("Saved to this slot.");
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "Upload failed. Try again.",
                  );
                } finally {
                  setBusy(false);
                  e.target.value = "";
                }
              }}
            />
          </label>
        ) : (
          <span className="small">Use folder</span>
        )}
        {asset?.source === "private" && (
          <button
            className="secondary"
            disabled={busy || !ready}
            aria-label={`Remove ${slot.name.replaceAll("-", " ")}`}
            onClick={async () => {
              setBusy(true);
              setMessage("");
              try {
                await remove(slot.name);
                setMessage("Removed. The default artwork is back.");
              } catch (e) {
                setMessage(
                  e instanceof Error ? e.message : "Removal failed. Retry.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Trash2 size={16} />
            Remove
          </button>
        )}
      </div>
    </article>
  );
}
export function ArtSettings() {
  const { error } = useContext(Context),
    [folder, setFolder] = useState("backgrounds");
  return (
    <section className="art-settings">
      <div className="section-title">
        <h2>Make it look like us.</h2>
        <p>Drop a file into a named folder, or upload a private image here.</p>
      </div>
      {error && (
        <p className="notice" role="status">
          {error}
        </p>
      )}
      <div className="folder-tabs" aria-label="Artwork folders">
        {Array.from(new Set(manifest.slots.map((s) => s.folder))).map((f) => (
          <button
            key={f}
            aria-pressed={f === folder}
            onClick={() => setFolder(f)}
          >
            {f.replace("-", " ")}
          </button>
        ))}
      </div>
      <div className="art-rows">
        {manifest.slots
          .filter((s) => s.folder === folder)
          .map((s) => (
            <SlotRow key={s.name} slot={s} />
          ))}
      </div>
      <p className="small">
        <Check size={14} /> Private images override folder files. Originals stay
        in your folders. Uploaded images are compressed and have metadata
        removed.
      </p>
    </section>
  );
}
