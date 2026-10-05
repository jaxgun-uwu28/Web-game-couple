"use client";
import { useEffect, useRef, useState } from "react";
import { useKeepsakes } from "./Keepsakes";
type Entry = { id: string; text: string };
const colors = ["#F8C9D8", "#EAE1F5", "#F7E6A6", "#CDE5D0", "#F8DCC4"];
export default function SpinWheel() {
  const c = useKeepsakes(),
    [entries, setEntries] = useState<Entry[]>([]),
    [draft, setDraft] = useState(""),
    [revision, setRevision] = useState(0),
    [rotation, setRotation] = useState(0),
    [busy, setBusy] = useState(false),
    [spinning, setSpinning] = useState(false),
    [picked, setPicked] = useState<Entry | null>(null),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    dirty = useRef(false);
  const pending = useRef(false);
  pending.current = busy || !!picked;
  useEffect(() => {
    let live = true;
    const load = async () => {
      if (pending.current) return;
      if (c.preview) {
        const saved = JSON.parse(
          localStorage.getItem("arcade-wheel-preview") || "[]",
        );
        if (live) {
          setEntries(saved);
          setDraft(saved.map((e: Entry) => e.text).join("\n"));
        }
        return;
      }
      if (!c.db || !c.couple) return;
      const r = await c.db
        .from("activity_wheels")
        .select("entries,revision")
        .eq("couple_id", c.couple)
        .maybeSingle();
      if (!live) return;
      if (r.error) {
        setError("The wheel could not load. Try again.");
        return;
      }
      if (!dirty.current) {
        setEntries(r.data?.entries || []);
        setDraft((r.data?.entries || []).map((e: Entry) => e.text).join("\n"));
        setRevision(r.data?.revision || 0);
      }
    };
    void load();
    const poll = setInterval(() => void load(), 10000);
    return () => {
      live = false;
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [c.db, c.couple, c.preview]);
  useEffect(() => {
    if (picked) dialog.current?.showModal();
    else dialog.current?.close();
  }, [picked]);
  async function save(next: Entry[]) {
    if (c.preview)
      localStorage.setItem("arcade-wheel-preview", JSON.stringify(next));
    else {
      const r = await c.db!.rpc("save_wheel", {
        content: next,
        expected_revision: revision,
      });
      if (r.error)
        throw new Error(
          "The wheel changed or could not save. Reopen it and try again.",
        );
      setRevision(r.data);
    }
    setEntries(next);
    setDraft(next.map((e) => e.text).join("\n"));
    dirty.current = false;
  }
  async function spin() {
    setBusy(true);
    setError("");
    try {
      let list = entries;
      if (dirty.current) {
        list = draft
          .split("\n")
          .map((t) => t.trim())
          .filter(Boolean)
          .map((text) => ({ id: crypto.randomUUID(), text }));
        if (list.length > 100 || list.some((e) => e.text.length > 80))
          throw new Error(
            "Use up to 100 entries, with 80 characters per entry.",
          );
        await save(list);
      }
      if (!list.length) {
        setBusy(false);
        return;
      }
      const random = new Uint32Array(1),
        limit = Math.floor(4294967296 / list.length) * list.length;
      do {
        crypto.getRandomValues(random);
      } while (random[0] >= limit);
      const index = random[0] % list.length,
        step = 360 / list.length,
        target = (360 - (index + 0.5) * step) % 360;
      setRotation(
        (prev) => prev + 1800 + ((target - (prev % 360) + 360) % 360),
      );
      setSpinning(true);
      timer.current = setTimeout(
        () => {
          setSpinning(false);
          setPicked(list[index]);
          setBusy(false);
        },
        matchMedia("(prefers-reduced-motion: reduce)").matches ? 80 : 4400,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Try again.");
      setBusy(false);
    }
  }
  return (
    <section className="spin-activity">
      <h2>Spin the wheel</h2>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <div className="wheel-layout">
        <div className="wheel-stage">
          <span className="wheel-pointer" aria-hidden="true" />
          <svg
            className="text-wheel"
            viewBox="0 0 400 400"
            style={{ transform: `rotate(${rotation}deg)` }}
            aria-label="Wheel entries"
          >
            {entries.length ? (
              entries.map((e, i) => {
                const step = (2 * Math.PI) / entries.length,
                  a = i * step - Math.PI / 2,
                  b = a + step,
                  m = (a + b) / 2;
                return (
                  <g key={e.id}>
                    {entries.length === 1 ? (
                      <circle cx="200" cy="200" r="190" fill={colors[0]} />
                    ) : (
                      <path
                        d={`M200 200 L${200 + 190 * Math.cos(a)} ${200 + 190 * Math.sin(a)} A190 190 0 ${step > Math.PI ? 1 : 0} 1 ${200 + 190 * Math.cos(b)} ${200 + 190 * Math.sin(b)} Z`}
                        fill={colors[i % colors.length]}
                        stroke="var(--canvas)"
                        strokeWidth="2"
                      />
                    )}
                    <text
                      x="310"
                      y="200"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${(m * 180) / Math.PI} 200 200)`}
                      fontSize={Math.max(8, Math.min(18, 220 / entries.length))}
                      fill="#50313F"
                    >
                      {e.text.length > 20 ? e.text.slice(0, 19) + "…" : e.text}
                    </text>
                  </g>
                );
              })
            ) : (
              <circle cx="200" cy="200" r="190" fill="var(--lavender)" />
            )}
            <circle cx="200" cy="200" r="23" fill="var(--sheet)" />
          </svg>
          <button
            disabled={busy || (!entries.length && !draft.trim())}
            onClick={() => void spin()}
          >
            {spinning ? "Spinning…" : "Spin"}
          </button>
        </div>
        <label className="wheel-editor">
          Entries
          <textarea
            value={draft}
            disabled={busy}
            rows={12}
            maxLength={8100}
            onChange={(e) => {
              dirty.current = true;
              setDraft(e.target.value);
              setEntries(
                e.target.value
                  .split("\n")
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .map((text, i) => ({ id: String(i), text })),
              );
            }}
          />
          <button
            disabled={busy || !dirty.current}
            onClick={() => {
              setBusy(true);
              setError("");
              const next = draft
                .split("\n")
                .map((t) => t.trim())
                .filter(Boolean)
                .map((text) => ({ id: crypto.randomUUID(), text }));
              if (next.length > 100 || next.some((e) => e.text.length > 80)) {
                setError(
                  "Use up to 100 entries, with 80 characters per entry.",
                );
                setBusy(false);
                return;
              }
              void save(next)
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Save
          </button>
        </label>
      </div>
      <dialog
        ref={dialog}
        className="wheel-result"
        onCancel={() => setPicked(null)}
      >
        <h2>{picked?.text}</h2>
        {error && <p role="alert">{error}</p>}
        <div className="wheel-result-actions">
          <button className="secondary" onClick={() => setPicked(null)}>
            Close
          </button>
          <button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void save(entries.filter((e) => e.id !== picked?.id))
                .then(() => setPicked(null))
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Remove
          </button>
        </div>
      </dialog>
      {picked && (
        <div className="wheel-confetti" aria-hidden="true">
          {Array.from({ length: 32 }, (_, i) => (
            <i
              key={i}
              style={{
                left: `${(i * 37) % 100}%`,
                background: colors[i % colors.length],
                animationDelay: `${(i % 8) * 0.06}s`,
                transform: `rotate(${i * 23}deg)`,
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
