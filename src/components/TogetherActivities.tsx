"use client";
import SpinWheel from "./SpinWheel";
import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Heart,
  CalendarDays,
  Shuffle,
  Pencil,
  MessageCircle,
  Trophy,
  Star,
  Flower2,
  Check,
  ArrowRight,
  ArrowLeft,
  Download,
} from "lucide-react";
import { useKeepsakes, Photo } from "./Keepsakes";
import {
  type Activity,
  type Progress,
  conversationQuestions,
  noProgress,
  countdownProgress,
  filterDates,
} from "@/lib/together";
import { manilaDay, dayIndex } from "@/lib/games";
import { validCountdownDate } from "@/lib/together";
import { previewProgress } from "@/lib/preview-progress";
import type { Stroke } from "./Doodle";
const Doodle = dynamic(() => import("./Doodle"), {
  loading: () => <p>Opening our shared sketchbook…</p>,
});
const views = [
  "Spin the wheel",
  "Dates",
  "Sketchbook",
  "36 questions",
  "Countdowns",
  "Silly stakes",
  "Our year",
] as const;
export default function TogetherActivities() {
  const c = useKeepsakes(),
    [view, setView] = useState<(typeof views)[number]>("Dates"),
    [items, setItems] = useState<Activity[]>([]),
    [strokes, setStrokes] = useState<Stroke[]>([]),
    [progress, setProgress] = useState<Progress>(noProgress),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [title, setTitle] = useState(""),
    [date, setDate] = useState(""),
    [mood, setMood] = useState("any"),
    [weather, setWeather] = useState("any"),
    [filterMood, setFilterMood] = useState("any"),
    [filterWeather, setFilterWeather] = useState("any"),
    [picked, setPicked] = useState<Activity | null>(null),
    [spinning, setSpinning] = useState(false),
    [turns, setTurns] = useState(0),
    [theme, setTheme] = useState("original"),
    [sticker, setSticker] = useState("heart"),
    [quiz, setQuiz] = useState(0),
    [quizAnswer, setQuizAnswer] = useState<string | null>(null),
    [year, setYear] = useState(new Date().getFullYear());
  const lock = useRef(false),
    version = useRef(0),
    spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(async () => {
    if (c.preview) {
      setProgress(previewProgress(c.seat));
      return;
    }
    if (!c.db || !c.couple) return;
    const n = ++version.current;
    const [a, p, s] = await Promise.all([
      c.db
        .from("together_activities")
        .select("*")
        .eq("couple_id", c.couple)
        .order("created_at", { ascending: false })
        .limit(1000),
      c.db.rpc("arcade_progress"),
      c.db
        .from("entries")
        .select("body")
        .eq("couple_id", c.couple)
        .eq("kind", "doodle")
        .order("created_at")
        .limit(1500),
    ]);
    if (n !== version.current) return;
    if (a.error || p.error || s.error) {
      setError(
        "Shared activities could not load. Check your connection, then retry activities.",
      );
      return;
    }
    setItems(a.data as Activity[]);
    setProgress(p.data as Progress);
    setStrokes((s.data || []).map((x) => x.body as Stroke));
    setError("");
  }, [c.db, c.couple, c.preview, c.user]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    if (!c.db || !c.couple || c.preview) return () => clearInterval(timer);
    // The persistent arcade owns the private couple channel. Reuse its updates
    // rather than adding callbacks to an already subscribed Supabase channel.
    const update = () => void refresh();
    window.addEventListener("arcade:couple-update", update);
    return () => {
      ++version.current;
      clearInterval(timer);
      window.removeEventListener("arcade:couple-update", update);
    };
  }, [refresh, c.db, c.couple, c.preview]);
  useEffect(() => {
    const key = `arcade-rewards:${c.user}`;
    setTheme("original");
    setSticker("heart");
    try {
      const p = JSON.parse(localStorage.getItem(key) || "{}");
      if (p.theme) setTheme(p.theme);
      if (p.sticker) setSticker(p.sticker);
    } catch {}
    return () => {
      if (spinTimer.current) clearTimeout(spinTimer.current);
    };
  }, [c.user]);
  useEffect(() => {
    const active =
      theme === "lavender" && progress.coins >= 10
        ? "lavender"
        : theme === "peach" && progress.coins >= 20
          ? "peach"
          : "original";
    document.documentElement.dataset.arcadeTheme = active;
  }, [theme, progress.coins]);
  async function work(fn: () => Promise<void>) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your change could not save. Retry when connected.",
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function save(
    kind: Activity["kind"],
    body: Activity["body"],
    id?: string,
  ) {
    if (kind === "countdown" && !id && !validCountdownDate(body.date || "")) {
      throw new Error("Choose a valid date, then save your countdown again.");
    }
    if (c.preview) {
      setItems((xs) =>
        id
          ? xs.map((x) => (x.id === id ? { ...x, done: !x.done } : x))
          : [
              {
                id: crypto.randomUUID(),
                kind,
                body,
                done: false,
                created_at: new Date().toISOString(),
              },
              ...xs,
            ],
      );
      return;
    }
    const r = await c.db!.rpc("save_activity", {
      k: kind,
      content: body,
      eid: id || null,
    });
    if (r.error) throw new Error(r.error.message);
    await refresh();
  }
  const candidates = filterDates(items, filterMood, filterWeather),
    cursor = items.find((x) => x.kind === "question")?.body.index || 0,
    today = manilaDay(),
    memories = c.memories.filter((m) => m.image_path),
    memory = memories[quiz % Math.max(1, memories.length)],
    correct = memory ? manilaDay(new Date(memory.created_at)) : "",
    choices = memory
      ? [
          correct,
          manilaDay(new Date(Date.parse(memory.created_at) - 86400000)),
          manilaDay(new Date(Date.parse(memory.created_at) + 86400000)),
        ].sort()
      : [],
    yearWishes = c.wishes.filter(
      (w) =>
        w.status === "done" &&
        w.done_at?.startsWith(String(year)) &&
        c.lists.find((l) => l.id === w.list_id)?.type !== "secret",
    ),
    yearMemories = c.memories.filter((m) =>
      m.created_at.startsWith(String(year)),
    );
  function chooseReward(t: string, s: string) {
    setTheme(t);
    setSticker(s);
    localStorage.setItem(
      `arcade-rewards:${c.user}`,
      JSON.stringify({ theme: t, sticker: s }),
    );
  }
  async function spin() {
    if (spinning || busy || !candidates.length) return;
    const result = candidates[Math.floor(Math.random() * candidates.length)];
    setPicked(null);
    setSpinning(true);
    setTurns((v) => v + 1080 + Math.floor(Math.random() * 360));
    spinTimer.current = setTimeout(
      () => {
        setPicked(result);
        setSpinning(false);
        void work(async () => {
          await save("date", { ...result.body, event: "picked" });
          setMessage("Our date is picked. Make a little time for it.");
        });
      },
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 50 : 1100,
    );
  }
  function exportRecap() {
    const text = [
      `Our Little Arcade · ${year}`,
      `${yearMemories.length} visible memories`,
      `${yearWishes.length} wishes came true`,
      "",
      ...yearWishes.map((w) => `${w.title} · ${w.done_at?.slice(0, 10)}`),
      "",
      ...yearMemories.map((m) => `${m.caption} · ${m.created_at.slice(0, 10)}`),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `our-year-${year}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const Sticker =
    sticker === "star" && progress.xp >= 50
      ? Star
      : sticker === "flower" && progress.xp >= 100
        ? Flower2
        : Heart;
  return (
    <section className="together-activities">
      {view !== "Spin the wheel" && (
        <div className="section-heading">
          <div>
            <h2>More little ways to be together.</h2>
            <p>A plan, a page, a question. Pick what feels right today.</p>
          </div>
          <Sticker size={32} />
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button className="secondary" onClick={() => void refresh()}>
            Retry activities
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      <div
        className="activity-tabs"
        role="tablist"
        aria-label="Together activities"
      >
        {views.map((v) => (
          <button
            role="tab"
            aria-selected={view === v}
            aria-controls="activity-panel"
            key={v}
            onClick={() => {
              setView(v);
              setTitle("");
              setMessage("");
            }}
          >
            {v}
          </button>
        ))}
      </div>
      <div id="activity-panel" role="tabpanel" aria-label={view}>
        {view === "Spin the wheel" && <SpinWheel />}
        {view === "Dates" && (
          <>
            <div className="date-picker-scene">
              <div
                className={`date-wheel ${spinning ? "spinning" : ""}`}
                style={{ "--turn": `${turns}deg` } as React.CSSProperties}
              >
                <Heart size={64} />
                <span>Our next little plan</span>
              </div>
              <div>
                <h3>Leave the deciding to a spin.</h3>
                <div className="form-pair">
                  <label>
                    Mood
                    <select
                      value={filterMood}
                      onChange={(e) => setFilterMood(e.target.value)}
                    >
                      {["any", "cozy", "adventurous", "creative"].map((x) => (
                        <option key={x} value={x}>
                          {x === "any" ? "Any mood" : x}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Weather
                    <select
                      value={filterWeather}
                      onChange={(e) => setFilterWeather(e.target.value)}
                    >
                      {["any", "indoors", "outdoors"].map((x) => (
                        <option key={x} value={x}>
                          {x === "any" ? "Any weather" : x}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  disabled={busy || spinning || !candidates.length}
                  onClick={() => void spin()}
                >
                  <Shuffle size={18} />
                  {spinning ? "Choosing our date…" : "Spin our date jar"}
                </button>
                <p role="status">
                  {picked
                    ? picked.body.title
                    : candidates.length
                      ? candidates.length === 1
                        ? "1 idea fits today."
                        : `${candidates.length} ideas fit today.`
                      : "Add an idea below, or choose different filters."}
                </p>
              </div>
            </div>
            <form
              className="activity-form"
              onSubmit={(e) => {
                e.preventDefault();
                void work(async () => {
                  await save("date", {
                    title: title.trim(),
                    mood,
                    weather,
                    event: "idea",
                  });
                  setTitle("");
                });
              }}
            >
              <h3>Add our own idea</h3>
              <label>
                Date idea
                <input
                  value={title}
                  maxLength={160}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="A picnic, a movie, a little adventure…"
                />
              </label>
              <div className="form-pair">
                <label>
                  Its mood
                  <select
                    value={mood}
                    onChange={(e) => setMood(e.target.value)}
                  >
                    {["any", "cozy", "adventurous", "creative"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Works best
                  <select
                    value={weather}
                    onChange={(e) => setWeather(e.target.value)}
                  >
                    {["any", "indoors", "outdoors"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button disabled={busy}>Save date idea</button>
            </form>
            <ul className="activity-list">
              {items
                .filter((a) => a.kind === "date" && a.body.event === "idea")
                .map((a) => (
                  <li key={a.id}>
                    <div>
                      <strong>{a.body.title}</strong>
                      <p>
                        {a.body.mood} · {a.body.weather}
                      </p>
                    </div>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void work(() => save(a.kind, a.body, a.id))
                      }
                    >
                      {a.done ? "Use again" : "Retire idea"}
                    </button>
                  </li>
                ))}
            </ul>
            <details>
              <summary>Our date-picking history</summary>
              {items
                .filter((a) => a.kind === "date" && a.body.event === "picked")
                .slice(0, 20)
                .map((a) => (
                  <p key={a.id}>
                    {a.body.title} · {a.created_at.slice(0, 10)}
                  </p>
                ))}
            </details>
          </>
        )}
        {view === "Sketchbook" && (
          <>
            <h3>One page. Both our pencils.</h3>
            <p>
              {c.preview
                ? "Try drawing on this device. Preview marks last while this page is open and are not saved online."
                : "Marks appear on the other phone after you lift your finger. Your drawings are saved."}
            </p>
            <Doodle
              strokes={strokes}
              disabled={busy}
              busy={busy}
              mode="drawing"
              onStroke={async (s) => {
                const okay = await work(async () => {
                  if (c.preview) setStrokes((xs) => [...xs, s]);
                  else {
                    const r = await c.db!.rpc("save_entry", {
                      k: "doodle",
                      content: s,
                    });
                    if (r.error) throw new Error(r.error.message);
                    await refresh();
                  }
                });
                if (!okay) throw new Error("Your stroke could not save.");
              }}
            />
          </>
        )}
        {view === "36 questions" && (
          <div className="question-sheet">
            <MessageCircle size={32} />
            <p className="small">
              Question {cursor + 1} of 36 · original conversation prompts
            </p>
            <h3>{conversationQuestions[cursor]}</h3>
            <p>
              Take your time. Either of you can move the shared page when you’re
              ready.
            </p>
            <div className="install-actions">
              <button
                className="secondary"
                disabled={busy || cursor === 0}
                onClick={() =>
                  void work(() => save("question", { index: cursor - 1 }))
                }
              >
                <ArrowLeft size={17} />
                Previous
              </button>
              <button
                disabled={busy || cursor === 35}
                onClick={() =>
                  void work(() => save("question", { index: cursor + 1 }))
                }
              >
                Next question <ArrowRight size={17} />
              </button>
            </div>
            {cursor === 35 && (
              <p>Thirty-six chances to listen. Come back whenever you like.</p>
            )}
          </div>
        )}
        {view === "Countdowns" && (
          <>
            <form
              className="activity-form"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const countdownDate = String(form.get("countdown-date") || "");
                void work(async () => {
                  await save("countdown", {
                    title: title.trim(),
                    date: countdownDate,
                  });
                  setTitle("");
                  setDate("");
                });
              }}
            >
              <h3>Something to look forward to.</h3>
              <label>
                What are we counting down to?
                <input
                  value={title}
                  maxLength={160}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </label>
              <label>
                Our date
                <input
                  type="date"
                  name="countdown-date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </label>
              <button disabled={busy}>
                <CalendarDays size={18} />
                Save our countdown
              </button>
            </form>
            <ul className="activity-list countdown-list">
              {items
                .filter((a) => a.kind === "countdown")
                .map((a) => {
                  const validDate = validCountdownDate(a.body.date || ""),
                    days = validDate
                      ? dayIndex(a.body.date!) - dayIndex(today)
                      : 0,
                    amount = countdownProgress(
                      a.created_at,
                      a.body.date!,
                      today,
                    );
                  return (
                    <li key={a.id}>
                      <svg
                        viewBox="0 0 100 100"
                        role="img"
                        aria-label={
                          validDate
                            ? `${Math.round(amount * 100)} percent of the wait complete`
                            : "Countdown date unavailable"
                        }
                      >
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          className="countdown-track"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          className="countdown-fill"
                          strokeDasharray={`${amount * 251.33} 251.33`}
                        />
                        <text x="50" y="56" textAnchor="middle">
                          {validDate ? Math.max(0, days) : "—"}
                        </text>
                      </svg>
                      <div>
                        <h3>{a.body.title}</h3>
                        <p>
                          {!validDate
                            ? "Date unavailable · Add a new countdown with a valid date"
                            : a.done
                              ? "A memory now"
                              : days === 0
                                ? "Today is the day!"
                                : days < 0
                                  ? "The day has arrived"
                                  : `${days} days to go`}{" "}
                          · {a.body.date}
                        </p>
                      </div>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          void work(() => save(a.kind, a.body, a.id))
                        }
                      >
                        {a.done ? "Reopen" : "Mark celebrated"}
                      </button>
                    </li>
                  );
                })}
            </ul>
            {!items.some((a) => a.kind === "countdown") && (
              <p>
                Your next visit, trip or ordinary little celebration can go
                here.
              </p>
            )}
          </>
        )}
        {view === "Silly stakes" && (
          <>
            <h3>Only the sweetest stakes.</h3>
            <p>
              Optional promises, with no money involved. Agree together before
              adding one.
            </p>
            <form
              className="activity-form"
              onSubmit={(e) => {
                e.preventDefault();
                void work(async () => {
                  await save("stake", { title: title.trim() });
                  setTitle("");
                });
              }}
            >
              <label>
                Our little promise
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={160}
                  placeholder="The loser picks our next movie…"
                  required
                />
              </label>
              <button disabled={busy}>Add our promise</button>
            </form>
            <ul className="activity-list">
              {items
                .filter((a) => a.kind === "stake")
                .map((a) => (
                  <li key={a.id}>
                    <strong>{a.body.title}</strong>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void work(() => save(a.kind, a.body, a.id))
                      }
                    >
                      {a.done ? "Kept · reopen" : "Mark promise kept"}{" "}
                      <Check size={16} />
                    </button>
                  </li>
                ))}
            </ul>
          </>
        )}
        {view === "Our year" && (
          <>
            <div className="recap-intro">
              <Trophy size={36} />
              <h3>Our little collection of days.</h3>
              <label>
                Recap year
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                />
              </label>
              <p>
                {yearMemories.length} visible memories. {yearWishes.length}{" "}
                wishes came true.
              </p>
              <ul>
                {yearWishes.map((w) => (
                  <li key={w.id}>{w.title}</li>
                ))}
              </ul>
              <button className="secondary" onClick={exportRecap}>
                <Download size={18} />
                Download this recap
              </button>
            </div>
            <h3>Do you remember this day?</h3>
            {memory ? (
              <div className="memory-quiz">
                <Photo
                  path={memory.image_path}
                  alt="A memory for our date quiz"
                />
                <p>{memory.caption}</p>
                <div className="install-actions">
                  {choices.map((d) => (
                    <button
                      className="secondary"
                      key={d}
                      disabled={quizAnswer !== null}
                      onClick={() => setQuizAnswer(d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                {quizAnswer && (
                  <>
                    <p role="status">
                      {quizAnswer === correct
                        ? "You remembered it!"
                        : `That little day was ${correct}.`}
                    </p>
                    <button
                      onClick={() => {
                        setQuiz((q) => q + 1);
                        setQuizAnswer(null);
                      }}
                    >
                      Next memory
                    </button>
                  </>
                )}
              </div>
            ) : (
              <p>
                Save a photo in Memories to turn your own album into a date
                quiz.
              </p>
            )}
          </>
        )}
      </div>
      <section className="arcade-rewards">
        <h3>A little joy, earned together.</h3>
        <p>
          {progress.played} completed games · {progress.wins} wins ·{" "}
          {progress.xp} XP · {progress.coins} coins
        </p>
        <p className="small">
          {c.preview
            ? "Preview rewards simulate completed games on this device and do not carry into your accounts."
            : "Rewards come from server-validated completed games."}{" "}
          Coins are keepsakes, with no cash value.
        </p>
        <div className="achievement-row">
          <span>
            <Trophy size={20} />
            {progress.played >= 1 ? "First game played" : "First game · locked"}
          </span>
          <span>
            <Star size={20} />
            {progress.wins >= 1 ? "A sweet victory" : "First victory · locked"}
          </span>
          <span>
            <Heart size={20} />
            {progress.played >= 10 ? "Ten shared games" : "Ten games · locked"}
          </span>
        </div>
        <div className="install-actions">
          <button
            className="secondary"
            aria-pressed={theme === "original"}
            onClick={() => chooseReward("original", sticker)}
          >
            Original theme
          </button>
          <button
            className="secondary"
            disabled={progress.coins < 10}
            aria-pressed={theme === "lavender"}
            onClick={() => chooseReward("lavender", sticker)}
          >
            Lavender paper · 10 coins
          </button>
          <button
            className="secondary"
            disabled={progress.coins < 20}
            aria-pressed={theme === "peach"}
            onClick={() => chooseReward("peach", sticker)}
          >
            Peach paper · 20 coins
          </button>
        </div>
        <div className="install-actions">
          <button
            className="secondary"
            aria-pressed={sticker === "heart"}
            onClick={() => chooseReward(theme, "heart")}
          >
            <Heart size={18} />
            Heart
          </button>
          <button
            className="secondary"
            disabled={progress.xp < 50}
            aria-pressed={sticker === "star"}
            onClick={() => chooseReward(theme, "star")}
          >
            <Star size={18} />
            Star · 50 XP
          </button>
          <button
            className="secondary"
            disabled={progress.xp < 100}
            aria-pressed={sticker === "flower"}
            onClick={() => chooseReward(theme, "flower")}
          >
            <Flower2 size={18} />
            Flower · 100 XP
          </button>
        </div>
      </section>
    </section>
  );
}
