"use client";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Heart,
  Home,
  Gamepad2,
  Images,
  Mail,
  Smile,
  ArrowRight,
  CalendarDays,
  Sparkles,
  Settings,
  KeyRound,
  LogOut,
  Gift,
  Check,
  ImagePlus,
  ChevronRight,
  Send,
  Flower2,
} from "lucide-react";
import { createBrowserDb } from "@/lib/supabase";
import { isPrivateEmail } from "@/lib/private-auth";
import { anniversaryStats, localDay, validDate } from "@/lib/anniversary";
import { dailyQuestions, dayIndex, manilaDay } from "@/lib/games";
import { ArtProvider, ArtSettings, Slot } from "./ArtSlots";
import Ambience from "./Ambience";
import dynamic from "next/dynamic";
const PlayArcade = dynamic(() => import("./PlayArcade"), {
  loading: () => <p className="opening">Opening the arcade…</p>,
});
const tabs = [
  { id: "home", name: "Home", icon: Home },
  { id: "play", name: "Play", icon: Gamepad2 },
  { id: "memories", name: "Memories", icon: Images },
  { id: "notes", name: "Notes", icon: Mail },
  { id: "us", name: "Us", icon: Heart },
];
export default function StageOne() {
  const db = useMemo(createBrowserDb, []),
    [session, setSession] = useState<Session | null>(null),
    [authReady, setAuthReady] = useState(false),
    [preview, setPreview] = useState(false),
    [coupleId, setCoupleId] = useState<string | null>(null),
    [anniversary, setAnniversary] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false),
    [tab, setTab] = useState("home"),
    [editing, setEditing] = useState(false),
    [date, setDate] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [now, setNow] = useState<Date | null>(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [answer, setAnswer] = useState(""),
    [daily, setDaily] = useState<{ user_id: string; answer: string | null }[]>(
      [],
    ),
    [streak, setStreak] = useState(0),
    [profiles, setProfiles] = useState<
      { id: string; slot: number; nickname: string }[]
    >([]),
    [nickname, setNickname] = useState("");
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 10000);
    if (!db) {
      setAuthReady(true);
      return () => clearInterval(timer);
    }
    void db.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = db.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
        setLoaded(false);
        setCoupleId(null);
        setProfiles([]);
        setDaily([]);
        setAnniversary(null);
      }
    });
    return () => {
      clearInterval(timer);
      data.subscription.unsubscribe();
    };
  }, [db]);
  const load = async () => {
    if (!db || !session || preview) return;
    setError("");
    if (!isPrivateEmail(session.user.email)) {
      setCoupleId(null);
      setLoaded(true);
      setError("Only the two private accounts can enter this arcade.");
      return;
    }
    const profile = await db
      .from("profiles")
      .select("couple_id")
      .eq("id", session.user.id)
      .single();
    if (profile.error) {
      setCoupleId(null);
      setError("This account needs a private couple invitation.");
      setLoaded(true);
      return;
    }
    setCoupleId(profile.data.couple_id);
    const people = await db
      .from("profiles")
      .select("id,slot,nickname")
      .eq("couple_id", profile.data.couple_id)
      .order("slot");
    if (people.error) {
      setError("Your couple accounts could not load. Try again.");
      return;
    }
    setProfiles(people.data);
    const c = await db
      .from("couples")
      .select("anniversary")
      .eq("id", profile.data.couple_id)
      .single();
    if (c.error) {
      setError("The anniversary could not load. Try again.");
      setLoaded(true);
      return;
    }
    setAnniversary(c.data.anniversary);
    setLoaded(true);
    const q = await db.rpc("today_answers");
    if (q.data) {
      setDaily(q.data.daily);
      setStreak(q.data.streak);
    }
  };
  useEffect(() => {
    if (session && !preview) {
      void load();
      const timer = setInterval(() => void load(), 30000);
      return () => clearInterval(timer);
    }
  }, [session, preview]);
  useEffect(() => {
    if (!db || !coupleId || preview) return;
    const channel = db
      .channel(`anniversary:${coupleId}`, { config: { private: true } })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "couples",
          filter: `id=eq.${coupleId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [db, coupleId, preview, session]);
  const openPreview = () => {
    setPreview(true);
    setLoaded(true);
    setAnniversary(localStorage.getItem("arcade-stage1-anniversary"));
    setMessage(
      "Local preview · games use pass-and-play; nothing is saved to your online accounts.",
    );
    setError("");
  };
  const stats = anniversary && now ? anniversaryStats(anniversary, now) : null,
    question =
      dailyQuestions[
        dayIndex(manilaDay(now || new Date())) % dailyQuestions.length
      ];
  const saveDate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const selectedDate = String(
      new FormData(e.currentTarget).get("anniversary") || "",
    );
    if (
      !validDate(selectedDate) ||
      selectedDate > localDay() ||
      selectedDate < "1900-01-01"
    ) {
      setError("Choose a real anniversary date, today or earlier.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (preview)
        localStorage.setItem("arcade-stage1-anniversary", selectedDate);
      else {
        if (!db || !coupleId)
          throw new Error("Your private couple invitation is required.");
        const { error } = await db.rpc("set_anniversary", {
          value: selectedDate,
        });
        if (error) throw new Error(error.message);
      }
      setAnniversary(selectedDate);
      setEditing(false);
      setMessage("Our beginning is saved.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The date could not save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!db) throw new Error("The private connection is not configured yet.");
      if (!isPrivateEmail(email))
        throw new Error("Use one of the two private account emails.");
      const { error } = await db.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error)
        throw new Error(
          error.status === 400
            ? "Email or password is incorrect. Use the password set for this account in Supabase."
            : error.message,
        );
      setPassword("");
      setMessage("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Sign-in could not complete. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const submitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (preview) {
        setDaily([{ user_id: "preview", answer }]);
      } else {
        const { error } = await db!.rpc("answer_today", {
          k: "daily",
          content: answer,
        });
        if (error) throw new Error(error.message);
        await load();
      }
      setAnswer("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your answer could not save.");
    } finally {
      setBusy(false);
    }
  };
  const names = [0, 1].map(
    (slot) =>
      profiles.find((p) => p.slot === slot)?.nickname || `Player ${slot + 1}`,
  );
  const mySlot = profiles.find((p) => p.id === session?.user.id)?.slot ?? 0;
  const saveNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (preview) {
        setProfiles([
          { id: "preview", slot: 0, nickname },
          { id: "preview-two", slot: 1, nickname: "" },
        ]);
        setMessage("Nickname updated for this preview.");
      } else {
        const result = await db!.rpc("set_nickname", {
          value: nickname.trim(),
        });
        if (result.error) throw result.error;
        await load();
        setMessage("Your nickname is saved.");
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Nickname could not save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const myId = preview ? "preview" : session?.user.id,
    season = now
      ? [
          "Winter window",
          "Spring blossoms",
          "Summer fireflies",
          "Autumn leaves",
        ][Math.floor(((now.getMonth() + 1) % 12) / 3)]
      : "A little season of us";
  const dateForm = (
    <form onSubmit={saveDate} className="date-form">
      <label htmlFor="anniversary-date">When did your story begin?</label>
      <input
        id="anniversary-date"
        name="anniversary"
        type="date"
        min="1900-01-01"
        max={localDay()}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
      />
      <p className="small">
        Just your anniversary date. You can change it in Us anytime.
      </p>
      <div className="form-actions">
        <button disabled={busy}>
          {busy ? "Saving…" : "Save our date"}
          <Heart size={17} />
        </button>
        {anniversary && (
          <button
            type="button"
            className="secondary"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
  return (
    <ArtProvider db={db} coupleId={coupleId} preview={preview}>
      <div className="stage-app">
        <a href="#main" className="skip-link">
          Skip to Home
        </a>
        <aside className="side-rail">
          <a href="/" className="brand">
            <span>
              <Heart size={23} />
            </span>
            <b>
              our little
              <br />
              arcade
            </b>
          </a>
          <nav aria-label="Main navigation">
            {tabs.map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? "nav-item active" : "nav-item"}
                aria-current={tab === t.id ? "page" : undefined}
                disabled={(!session && !preview) || (!preview && !coupleId)}
                title={
                  t.id === "memories" || t.id === "notes"
                    ? "Available in the next stages"
                    : t.name
                }
                onClick={() => {
                  if (t.id === "us")
                    setNickname(
                      profiles.find(
                        (p) =>
                          p.id === (preview ? "preview" : session?.user.id),
                      )?.nickname || "",
                    );
                  setTab(t.id);
                  setEditing(false);
                }}
              >
                <t.icon size={22} />
                <span>{t.name}</span>
              </button>
            ))}
          </nav>
          <div className="rail-note">
            <Sparkles size={22} />
            <p>
              A little world
              <br />
              for two.
            </p>
          </div>
        </aside>
        <div className="app-content">
          <header className="app-header">
            <div className="mobile-brand">
              <Heart size={20} />
              <strong>our little arcade</strong>
            </div>
            <p className="header-date">
              {now?.toLocaleDateString("en", {
                weekday: "long",
                month: "long",
                day: "numeric",
              }) || "Our little place"}
            </p>
            <div className="header-tools">
              <Ambience />
              {(session || preview) && (
                <button
                  className="icon-button"
                  aria-label="Sign out"
                  onClick={() => {
                    if (preview) {
                      setPreview(false);
                      setLoaded(false);
                      setAnniversary(null);
                      setMessage("");
                    } else void db?.auth.signOut();
                    setCoupleId(null);
                    setDaily([]);
                    setProfiles([]);
                    setNickname("");
                    setTab("home");
                  }}
                >
                  <LogOut size={18} />
                </button>
              )}
            </div>
          </header>
          <main id="main">
            {(error || message) && (
              <div
                className={error ? "notice error" : "notice"}
                role={error ? "alert" : "status"}
              >
                <span>{error || message}</span>
                <button
                  className="icon-button"
                  aria-label="Dismiss message"
                  onClick={() => {
                    setError("");
                    setMessage("");
                  }}
                >
                  ×
                </button>
              </div>
            )}
            {!authReady ? (
              <p className="opening">Opening our little place…</p>
            ) : !session && !preview ? (
              <section className="welcome">
                <div className="welcome-sticker">
                  <Heart size={54} />
                  <Sparkles size={24} />
                </div>
                <h1>
                  A little world.
                  <br />
                  Just the two of you.
                </h1>
                <p>
                  Somewhere to play, keep memories, and make ordinary days feel
                  a little closer.
                </p>
                <form onSubmit={signIn}>
                  <label htmlFor="login-email">Email</label>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                  <label htmlFor="login-password">Password</label>
                  <input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                    <ArrowRight size={19} />
                  </button>
                </form>
                <p className="small">
                  <KeyRound size={14} /> Two private accounts. No public
                  sign-ups.
                </p>
                {process.env.NODE_ENV === "development" && (
                  <button className="text-button" onClick={openPreview}>
                    Review locally <ChevronRight size={17} />
                  </button>
                )}
              </section>
            ) : !loaded ? (
              <p className="opening">Finding our first page…</p>
            ) : !preview && !coupleId ? (
              <section className="welcome">
                <KeyRound size={40} />
                <h1>A private invitation is needed.</h1>
                <p>
                  This signed-in account is not linked to a couple yet. Ask the
                  project owner to provision your profile, then retry.
                </p>
                <button onClick={() => void load()}>Retry invitation</button>
              </section>
            ) : !anniversary || editing ? (
              <section className="setup-page">
                <div className="setup-art">
                  <CalendarDays size={46} />
                  <Heart size={22} />
                </div>
                <h1>
                  {anniversary
                    ? "A new date for our story."
                    : "Every story has a beginning."}
                </h1>
                <p>
                  {anniversary
                    ? "Update the date on your shared keepsake."
                    : "Let’s save yours. The rest can come later."}
                </p>
                {dateForm}
              </section>
            ) : tab === "us" ? (
              <>
                <div className="page-heading">
                  <div>
                    <h1>Our little details.</h1>
                    <p>Make this place feel more like you.</p>
                  </div>
                  <Settings size={32} />
                </div>
                <section className="date-setting">
                  <CalendarDays size={25} />
                  <div>
                    <h2>Our anniversary</h2>
                    <p>
                      {new Date(anniversary + "T12:00:00").toLocaleDateString(
                        "en",
                        { month: "long", day: "numeric", year: "numeric" },
                      )}
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => {
                      setDate(anniversary);
                      setEditing(true);
                    }}
                  >
                    Edit date
                  </button>
                </section>
                <section className="nickname-setting">
                  <h2>What should we call you?</h2>
                  <p>Optional. Your nickname appears on your shared games.</p>
                  <form onSubmit={saveNickname}>
                    <label htmlFor="nickname">Your nickname</label>
                    <input
                      id="nickname"
                      value={nickname}
                      maxLength={40}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="Player 1 or Player 2 is fine, too"
                    />
                    <button disabled={busy}>Save nickname</button>
                  </form>
                </section>
                <ArtSettings />
              </>
            ) : tab === "play" ? null : tab === "memories" ||
              tab === "notes" ? (
              <section className="future-page">
                <Slot
                  name={
                    tab === "memories"
                      ? "memories-background"
                      : "notes-background"
                  }
                  alt="Custom page artwork"
                  className="future-art"
                >
                  <Heart size={50} />
                </Slot>
                <h1>
                  {tab === "memories"
                    ? "A place for our favorite moments."
                    : "Little words. Big feelings."}
                </h1>
                <p>
                  {tab === "memories"
                    ? "Your private photo timeline arrives in Stage 4."
                    : "Your love-notes jar and sealed letters arrive in Stage 4."}
                </p>
                <button onClick={() => setTab("play")}>
                  Play together while we wait <Gamepad2 size={18} />
                </button>
              </section>
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <h1>Hi, you.</h1>
                    <p>A little closer, one day at a time.</p>
                  </div>
                  <span className="season-tag">
                    <Flower2 size={16} />
                    {season}
                  </span>
                </div>
                <div className="home-pages">
                  <section
                    className={`anniversary-page ${stats?.celebration ? "celebration" : ""}`}
                  >
                    <Slot
                      name={
                        stats?.celebration
                          ? "anniversary-background"
                          : "home-background"
                      }
                      alt="Our anniversary artwork"
                      className="anniversary-background"
                    >
                      <></>
                    </Slot>
                    <div className="anniversary-top">
                      <span>
                        <Heart size={16} />
                        Our next anniversary
                      </span>
                      <button
                        className="icon-button"
                        aria-label="Edit anniversary date"
                        onClick={() => {
                          setDate(anniversary);
                          setEditing(true);
                        }}
                      >
                        <Settings size={18} />
                      </button>
                    </div>
                    <h2>
                      {stats?.celebration ? (
                        <>
                          Happy anniversary,
                          <br />
                          to us.
                        </>
                      ) : (
                        <>
                          Another year of
                          <br />
                          our kind of magic.
                        </>
                      )}
                    </h2>
                    <div
                      className="countdown"
                      aria-label={`${stats?.days} days ${stats?.hours} hours ${stats?.minutes} minutes until the next anniversary`}
                    >
                      {[
                        [stats?.days, "days"],
                        [stats?.hours, "hours"],
                        [stats?.minutes, "mins"],
                      ].map(([n, label]) => (
                        <div key={label}>
                          <strong>{n ?? "—"}</strong>
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="anniversary-bottom">
                      <div className="progress-ring">
                        <svg viewBox="0 0 64 64" aria-hidden="true">
                          <circle cx="32" cy="32" r="27" />
                          <circle
                            cx="32"
                            cy="32"
                            r="27"
                            strokeDasharray={`${(stats?.progress || 0) * 169.65} 169.65`}
                          />
                        </svg>
                        <Heart size={21} />
                      </div>
                      <div>
                        <strong>
                          {stats?.together.toLocaleString()} days together
                        </strong>
                        <p>
                          Since{" "}
                          {new Date(
                            anniversary + "T12:00:00",
                          ).toLocaleDateString("en", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <span className="year-label">
                        {stats?.next.toLocaleDateString("en", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="milestones">
                      <span>
                        <Check size={13} />
                        Our beginning
                      </span>
                      {stats && stats.together >= 100 && (
                        <span>
                          <Heart size={13} />
                          100 days
                        </span>
                      )}
                      {stats && stats.years >= 1 && (
                        <span>
                          <Sparkles size={13} />
                          {stats.years} year{stats.years !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </section>
                  <section className="question-page">
                    <div className="question-top">
                      <Mail size={22} />
                      <span>A page for today</span>
                    </div>
                    <h2>
                      A little question, <br />
                      just for us.
                    </h2>
                    <p className="daily-question">{question}</p>
                    {daily.length === 2 ? (
                      <div className="reveals">
                        {daily.map((a, i) => (
                          <blockquote key={a.user_id}>
                            <b>{a.user_id === myId ? "You" : "Your person"}</b>
                            {a.answer}
                          </blockquote>
                        ))}
                      </div>
                    ) : daily.some((a) => a.user_id === myId) ? (
                      <div className="sealed">
                        <Heart size={28} />
                        <p>
                          Your answer is tucked away.
                          <br />
                          Open both when your person replies.
                        </p>
                      </div>
                    ) : (
                      <form onSubmit={submitAnswer}>
                        <label className="sr-only" htmlFor="daily-answer">
                          Your private answer
                        </label>
                        <textarea
                          id="daily-answer"
                          value={answer}
                          maxLength={2000}
                          onChange={(e) => setAnswer(e.target.value)}
                          placeholder="A little honesty goes a long way…"
                          required
                        />
                        <button disabled={busy || !answer.trim()}>
                          Seal my answer <Send size={16} />
                        </button>
                      </form>
                    )}
                    <p className="question-foot">
                      {streak
                        ? `${streak} days of showing up together`
                        : "Both answers open together."}
                    </p>
                  </section>
                </div>
                <section className="photo-strip">
                  <Slot
                    name="couple-photo-main"
                    alt="Our favorite photo together"
                    className="couple-photo"
                  >
                    <Heart size={34} />
                    <span>
                      A favorite photo
                      <br />
                      of the two of you.
                    </span>
                  </Slot>
                  <div>
                    <span className="handwritten">
                      little moments, big feelings.
                    </span>
                    <h2>
                      Leave a little piece
                      <br />
                      of us here.
                    </h2>
                    <p>Your own photos and artwork make this place yours.</p>
                    <button className="secondary" onClick={() => setTab("us")}>
                      <ImagePlus size={17} />
                      Choose our artwork
                    </button>
                  </div>
                  <div className="next-chapter">
                    <Gift size={26} />
                    <p>
                      Wishes, memories
                      <br />
                      and little surprises.
                    </p>
                    <span>Our next chapter · Stage 3 onward</span>
                  </div>
                </section>
                <section className="coming-strip" aria-label="Next stages">
                  <div>
                    <Smile size={21} />
                    <span>Mood check-ins</span>
                  </div>
                  <div>
                    <Heart size={21} />
                    <span>Thinking of you</span>
                  </div>
                  <div>
                    <button
                      className="text-button"
                      onClick={() => setTab("play")}
                    >
                      <Gamepad2 size={21} />
                      Play together
                    </button>
                  </div>
                  <p>These connections arrive in the next stages.</p>
                </section>
              </>
            )}
            {(session || preview) &&
              loaded &&
              anniversary &&
              !editing &&
              (preview || coupleId) && (
                <div hidden={tab !== "play"}>
                  <PlayArcade
                    db={db}
                    session={session}
                    coupleId={coupleId}
                    slot={mySlot}
                    names={names}
                    preview={preview}
                  />
                </div>
              )}
          </main>
          <footer className="stage-footer">
            <Heart size={13} />
            <span>made for the little things.</span>
          </footer>
        </div>
      </div>
    </ArtProvider>
  );
}
