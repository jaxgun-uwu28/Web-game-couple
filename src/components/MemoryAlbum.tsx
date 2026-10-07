"use client";
import { useEffect, useRef, useState } from "react";
import {
  Camera,
  ImagePlus,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Archive,
  RotateCcw,
  X,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useKeepsakes, KeepsakeFeedback, Photo } from "./Keepsakes";
import NativePhotoButton from "./NativePhotoButton";
import type { Memory } from "@/lib/keepsakes";
import { memoryDay, groupMemories } from "@/lib/memory-album";
import MemorySocial from "./MemorySocial";
import Postcards from "./Postcards";

export default function MemoryAlbum() {
  const c = useKeepsakes(),
    [files, setFiles] = useState<File[]>([]),
    [caption, setCaption] = useState(""),
    [day, setDay] = useState<string | null>(null),
    [archived, setArchived] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [editing, setEditing] = useState(""),
    [progress, setProgress] = useState(""),
    [cameraError, setCameraError] = useState(""),
    [cameraReady, setCameraReady] = useState(false);
  const camera = useRef<HTMLInputElement>(null),
    uploadInput = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    composer = useRef<HTMLDetailsElement>(null);
  const snapDialog = useRef<HTMLDialogElement>(null),
    video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null);
  function stopCamera() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCameraReady(false);
    snapDialog.current?.close();
  }
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function openCamera() {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      camera.current?.click();
      return;
    }
    snapDialog.current?.showModal();
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      if (!snapDialog.current?.open) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
        setCameraReady(true);
      }
    } catch {
      setCameraError(
        "Camera could not open. Allow camera access or choose a photo.",
      );
    }
  }
  async function takeSnap() {
    if (!video.current?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth;
    canvas.height = video.current.videoHeight;
    canvas.getContext("2d")?.drawImage(video.current, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob) return;
    stopCamera();
    await send([new File([blob], "snap.jpg", { type: "image/jpeg" })]);
  }
  const photos = c.memories
      .filter((m) =>
        archived ? !!m.archived_at && m.author === c.user : !m.archived_at,
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    groups = groupMemories(photos),
    current = photos.find((m) => m.id === selected),
    shown = day
      ? photos.filter((m) => memoryDay(m.created_at) === day)
      : photos;
  useEffect(() => {
    if (current) {
      setEditing(current.caption);
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [current?.id]);
  async function send(batch: File[], text = "") {
    if (!batch.length) return;
    const saved = await c.run(async () => {
      if (batch.length > 12)
        throw new Error("Choose up to 12 photos at a time.");
      const rows: Memory[] = [];
      for (let i = 0; i < batch.length; i++) {
        setProgress(`Saving ${i + 1} of ${batch.length}…`);
        rows.push({
          id: crypto.randomUUID(),
          author: c.user,
          caption: text.trim(),
          image_path: await c.upload(batch[i]),
          swap_day: null,
          created_at: new Date().toISOString(),
        });
      }
      if (c.preview)
        c.local((s) => ({ ...s, memories: [...rows, ...s.memories] }));
      else {
        const r = await c.db!.from("memories").insert(rows);
        if (r.error) throw new Error(r.error.message);
      }
    });
    setProgress("");
    if (saved) {
      setFiles([]);
      if (uploadInput.current) uploadInput.current.value = "";
      setCaption("");
      if (composer.current) composer.current.open = false;
    } else {
      setFiles(batch);
      if (composer.current) composer.current.open = true;
    }
  }
  async function update(
    m: Memory,
    values: { caption?: string; archived_at?: string | null },
  ) {
    return c.run(async () => {
      if (c.preview)
        c.local((s) => ({
          ...s,
          memories: s.memories.map((v) =>
            v.id === m.id ? { ...v, ...values } : v,
          ),
        }));
      else {
        const r = await c.db!.from("memories").update(values).eq("id", m.id);
        if (r.error) throw new Error(r.error.message);
      }
    });
  }
  const dateLabel = (value: string) =>
    new Date(`${value}T12:00:00+08:00`).toLocaleDateString(undefined, {
      dateStyle: "long",
    });
  return (
    <section className="keepsake-page memory-album">
      <Postcards />
      <div className="page-heading">
        <div>
          <h1>Our little moments.</h1>
          <p>A place for everything we want to remember.</p>
        </div>
        <ImagePlus size={32} />
      </div>
      <KeepsakeFeedback />
      <div className="memory-actions">
        {Capacitor.isNativePlatform() ? (
          <NativePhotoButton
            cameraOnly
            label="Snap"
            disabled={c.busy}
            onPhoto={async (f) => {
              await send([f]);
            }}
          />
        ) : (
          <button
            className="secondary"
            disabled={c.busy}
            onClick={() => void openCamera()}
          >
            <Camera size={18} />
            Snap
          </button>
        )}
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void send([f]);
          }}
        />
        <button
          className="secondary"
          aria-pressed={archived}
          onClick={() => {
            setArchived(!archived);
            setDay(null);
          }}
        >
          <Archive size={18} />
          {archived ? "Back to album" : "Archived"}
        </button>
      </div>
      <dialog
        className="memory-camera"
        ref={snapDialog}
        onCancel={stopCamera}
        onClose={() => {
          stream.current?.getTracks().forEach((t) => t.stop());
          stream.current = null;
          setCameraReady(false);
        }}
      >
        <div className="memory-viewer-top">
          <h2>Snap a moment</h2>
          <button
            className="icon-button"
            aria-label="Close camera"
            onClick={stopCamera}
          >
            <X />
          </button>
        </div>
        <video ref={video} autoPlay muted playsInline />
        {cameraError && <p role="status">{cameraError}</p>}
        <div className="memory-actions">
          <button
            disabled={!cameraReady || c.busy}
            onClick={() => void takeSnap()}
          >
            <Camera size={18} />
            Snap & send
          </button>
          <button
            className="secondary"
            onClick={() => {
              stopCamera();
              camera.current?.click();
            }}
          >
            Choose photo
          </button>
        </div>
      </dialog>
      <details className="memory-composer" ref={composer}>
        <summary>
          <ImagePlus size={18} />
          Add photos
        </summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(files, caption);
          }}
        >
          <label>
            Photos
            <input
              ref={uploadInput}
              type="file"
              accept="image/*"
              multiple
              required={!files.length}
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
          </label>
          <NativePhotoButton disabled={c.busy} onPhoto={(f) => setFiles([f])} />
          {!!files.length && (
            <p>
              {files.length} {files.length === 1 ? "photo" : "photos"} selected
            </p>
          )}
          <label>
            Caption
            <textarea
              value={caption}
              maxLength={2000}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="A moment to remember…"
            />
          </label>
          <button disabled={c.busy}>{progress || "Save photos"}</button>
        </form>
      </details>
      {day ? (
        <>
          <div className="memory-day-heading">
            <button className="text-button" onClick={() => setDay(null)}>
              <ArrowLeft size={18} />
              All moments
            </button>
            <h2>{dateLabel(day)}</h2>
          </div>
          <div className="memory-photo-grid">
            {shown.map((m) => (
              <article key={m.id}>
                <Photo
                  path={m.image_path}
                  alt={m.caption || "Our moment"}
                  onOpen={() => setSelected(m.id)}
                />
                {m.caption && <p>{m.caption}</p>}
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="memory-album-grid">
          {groups.map((g) => (
            <article key={g.day}>
              <Photo
                path={g.photos[0].image_path}
                alt={g.photos[0].caption || "Open this moment"}
                onOpen={() => setDay(g.day)}
              />
              <button
                className="memory-album-label"
                onClick={() => setDay(g.day)}
              >
                <span>{dateLabel(g.day)}</span>
                <small>
                  {g.photos.length} {g.photos.length === 1 ? "photo" : "photos"}
                </small>
              </button>
            </article>
          ))}
        </div>
      )}
      {!photos.length && (
        <div className="keepsake-empty">
          <ImagePlus size={48} />
          <h2>{archived ? "No archived photos." : "Our album is waiting."}</h2>
        </div>
      )}
      <dialog
        className="memory-viewer"
        ref={dialog}
        onCancel={() => setSelected(null)}
        onClose={() => setSelected(null)}
      >
        {current && (
          <>
            <div className="memory-viewer-top">
              <time>{dateLabel(memoryDay(current.created_at))}</time>
              <button
                className="icon-button"
                aria-label="Close photo"
                onClick={() => setSelected(null)}
              >
                <X />
              </button>
            </div>
            <Photo
              path={current.image_path}
              alt={current.caption || "Our moment"}
            />
            <div className="memory-viewer-nav">
              <button
                className="secondary"
                aria-label="Previous photo"
                disabled={shown.findIndex((m) => m.id === current.id) <= 0}
                onClick={() =>
                  setSelected(
                    shown[shown.findIndex((m) => m.id === current.id) - 1].id,
                  )
                }
              >
                <ChevronLeft />
              </button>
              <span>
                {shown.findIndex((m) => m.id === current.id) + 1} /{" "}
                {shown.length}
              </span>
              <button
                className="secondary"
                aria-label="Next photo"
                disabled={
                  shown.findIndex((m) => m.id === current.id) >=
                  shown.length - 1
                }
                onClick={() =>
                  setSelected(
                    shown[shown.findIndex((m) => m.id === current.id) + 1].id,
                  )
                }
              >
                <ChevronRight />
              </button>
            </div>
            {current.author === c.user ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void update(current, { caption: editing });
                }}
              >
                <label>
                  Caption
                  <textarea
                    maxLength={2000}
                    value={editing}
                    onChange={(e) => setEditing(e.target.value)}
                  />
                </label>
                <div className="memory-actions">
                  <button disabled={c.busy}>Save caption</button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={c.busy}
                    onClick={() =>
                      void update(current, {
                        archived_at: current.archived_at
                          ? null
                          : new Date().toISOString(),
                      }).then((saved) => {
                        if (saved) setSelected(null);
                      })
                    }
                  >
                    {current.archived_at ? (
                      <RotateCcw size={18} />
                    ) : (
                      <Archive size={18} />
                    )}{" "}
                    {current.archived_at ? "Restore" : "Archive"}
                  </button>
                </div>
              </form>
            ) : (
              <p className="handwritten">{current.caption}</p>
            )}
            <MemorySocial key={current.id} id={current.id}/>
            {c.error && <p role="alert">{c.error}</p>}
          </>
        )}
      </dialog>
    </section>
  );
}
