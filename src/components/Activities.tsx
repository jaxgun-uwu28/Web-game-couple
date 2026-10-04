"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import {
  Heart,
  Film,
  MapPin,
  Check,
  Plus,
  Trash2,
  Shuffle,
  NotebookPen,
  Utensils,
  ArrowUpRight,
} from "lucide-react";
import type { Stroke } from "./Doodle";
const Doodle = dynamic(() => import("./Doodle"), {
  loading: () => <p>Opening our sketchbook…</p>,
});
export type Entry = {
  id: string;
  kind: string;
  author: string;
  body: Record<string, unknown>;
  done: boolean;
};
export const tabs = [
  { id: "dates", label: "Date night", icon: Shuffle },
  { id: "movies", label: "Movie list", icon: Film },
  { id: "bucket", label: "Someday", icon: MapPin },
  { id: "restaurants", label: "Food dates", icon: Utensils },
  { id: "notes", label: "Notes jar", icon: Heart },
  { id: "doodle", label: "Sketchbook", icon: NotebookPen },
];
export default function Activities({
  entries,
  userId,
  save,
  busy,
}: {
  entries: Entry[];
  userId: string;
  save: (
    kind: string,
    body: Record<string, unknown>,
    id?: string,
  ) => Promise<void>;
  busy: boolean;
}) {
  const [tab, setTab] = useState("dates"),
    [text, setText] = useState(""),
    [picked, setPicked] = useState(""),
    [spinning, setSpinning] = useState(false),
    [opened, setOpened] = useState<string | null>(null),
    [filter, setFilter] = useState("All");
  const filtered = entries.filter((e) => e.kind === tab);
  const notes = filtered.filter((e) => e.author !== userId);
  const suggestions = [
    "Sushi & a scary movie",
    "Fresh bread and a slow morning",
    "Draw each other at a cat café",
    "A JDM drive & burger stop",
    "Action movie double feature",
    "A romcom, blankets, and absolutely no plans",
  ];
  const spin = () => {
    const ideas = filtered
      .filter((e) => !e.done)
      .map((e) => String(e.body.text));
    const options = ideas.length ? ideas : suggestions;
    setSpinning(true);
    setPicked("");
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? 0
      : 1100;
    window.setTimeout(() => {
      setPicked(options[Math.floor(Math.random() * options.length)]);
      setSpinning(false);
    }, duration);
  };
  return (
    <section className="notebook" id="activities">
      <div className="notebook-heading">
        <h2>Little things, together.</h2>
        <span className="handwriting">keep a page for us</span>
      </div>
      <nav className="notebook-tabs" aria-label="Together activities">
        {tabs.map((t) => (
          <button
            className={tab === t.id ? "active" : ""}
            aria-pressed={tab === t.id}
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setText("");
              setOpened(null);
            }}
          >
            <t.icon size={17} />
            {t.label}
          </button>
        ))}
      </nav>
      <div className="notebook-page">
        {tab === "dates" && (
          <div className="date-picker">
            <div
              className={`date-wheel ${spinning ? "spinning" : ""}`}
              aria-hidden="true"
            >
              <span>go out</span>
              <span>stay in</span>
              <Heart size={28} />
            </div>
            <div>
              <h3>Let tonight surprise us.</h3>
              <p>
                {filtered.length
                  ? "Your ideas are in the mix."
                  : "Sushi, a scary movie, or a slow morning? We brought a few ideas."}
              </p>
              <button disabled={busy || spinning} onClick={spin}>
                <Shuffle size={17} />
                {spinning ? "A little suspense…" : "Pick our next date"}
              </button>
              {picked && (
                <p className="date-result handwriting" role="status">
                  {picked}
                </p>
              )}
            </div>
          </div>
        )}
        {tab === "notes" && (
          <div className="jar-area">
            <div className="note-jar" aria-hidden="true">
              <Heart size={35} />
              <span>for you</span>
            </div>
            <div>
              <h3>A little love, saved for later.</h3>
              <p>
                {notes.length
                  ? `${notes.length} notes from your person.`
                  : "Leave a note for your person to find."}
              </p>
              <button
                disabled={busy || notes.length === 0}
                onClick={() =>
                  setOpened(notes[Math.floor(Math.random() * notes.length)].id)
                }
              >
                Open a note <ArrowUpRight size={17} />
              </button>
              {opened && (
                <blockquote className="jar-note handwriting">
                  {String(notes.find((n) => n.id === opened)?.body.text || "")}
                </blockquote>
              )}
            </div>
          </div>
        )}
        {tab === "doodle" ? (
          <Doodle
            strokes={filtered.map((e) => e.body as unknown as Stroke)}
            onStroke={(s) => save("doodle", { ...s })}
          />
        ) : (
          <>
            <form
              className="entry-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save(tab, {
                  text: text.trim(),
                  ...(tab === "movies"
                    ? { genre: filter === "All" ? "Horror" : filter }
                    : {}),
                })
                  .then(() => setText(""))
                  .catch(() => {});
              }}
            >
              <label htmlFor="entry">
                {tab === "notes"
                  ? "Leave a love note"
                  : tab === "dates"
                    ? "Add a date idea"
                    : tab === "movies"
                      ? "Add a movie"
                      : tab === "restaurants"
                        ? "A place we should eat"
                        : "Something we should do someday"}
              </label>
              <div className="inline-form">
                <input
                  id="entry"
                  value={text}
                  maxLength={2000}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    tab === "notes"
                      ? "A little thing I love about you…"
                      : tab === "movies"
                        ? "Movie title…"
                        : tab === "restaurants"
                          ? "Sushi spot, bakery, burger place…"
                          : "Write it down for us…"
                  }
                  required
                />
                <button disabled={busy || !text.trim()}>
                  <Plus size={18} />
                  <span>Add</span>
                </button>
              </div>
            </form>
            {tab === "movies" && (
              <div className="genre-filter">
                <label htmlFor="genre">Genre</label>
                <select
                  id="genre"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  {["All", "Horror", "Action", "Romcom"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <p className="small">
                  New movies use the selected genre; “All” defaults to horror.
                </p>
              </div>
            )}
            {tab !== "notes" && (
              <ul className="shared-list">
                {filtered
                  .filter(
                    (e) =>
                      tab !== "movies" ||
                      filter === "All" ||
                      e.body.genre === filter,
                  )
                  .map((e) => (
                    <li key={e.id}>
                      <button
                        className="check-button"
                        aria-label={`Mark ${String(e.body.text)} ${e.done ? "unfinished" : "done"}`}
                        aria-pressed={e.done}
                        disabled={busy}
                        onClick={() => void save(tab, {}, e.id).catch(() => {})}
                      >
                        {e.done ? <Check size={18} /> : <span />}
                      </button>
                      <span className={e.done ? "done" : ""}>
                        {String(e.body.text)}
                        {tab === "movies" && (
                          <small>{String(e.body.genre || "Horror")}</small>
                        )}
                      </span>
                      <button
                        className="icon-button"
                        aria-label={`Delete ${String(e.body.text)}`}
                        disabled={busy}
                        onClick={() =>
                          void save("delete", {}, e.id).catch(() => {})
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            {filtered.length === 0 && tab !== "notes" && (
              <p className="empty-note handwriting">The first line is yours.</p>
            )}
            {tab === "notes" && (
              <p className="small">
                Your notes stay in your partner’s jar. You can both read the
                shared jar; it’s a surprise, not a secret vault.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
