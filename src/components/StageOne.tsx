"use client";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Heart,
  Home,
  Gamepad2,
  Images,
  Mail,
  ArrowRight,
  ArrowLeft,
  CalendarDays,
  Sparkles,
  Settings,
  KeyRound,
  LogOut,
  Gift,
  Check,
  ImagePlus,
  ChevronRight,
  Flower2,
} from "lucide-react";
import { createBrowserDb } from "@/lib/supabase";
import { isPrivateEmail } from "@/lib/private-auth";
import { anniversaryStats, localDay, validDate } from "@/lib/anniversary";
import {
  ConnectionProvider,
  DailyConnection,
  ConnectionMoments,
} from "./Connections";
import { ArtProvider, ArtSettings, Slot } from "./ArtSlots";
import {
  KeepsakeProvider,
  Wishlists,
  Memories,
  Notes,
  WishlistShortcut,
  KeepsakeBackup,
} from "./Keepsakes";
import Ambience from "./Ambience";
import MusicControls from "./MusicControls";
import HoldHands, { HoldStats } from "./HoldHands";
import VoiceCassettes from "./VoiceCassettes";
import Postcards from "./Postcards";
import PromiseLedger from "./PromiseLedger";
import GameInvites from "./GameInvites";
import MediaStorage from './MediaStorage';
import type {GameId} from '@/lib/plugin-games/types';
import InstallSupport, { NativeBridge, OfflineShell } from "./InstallSupport";
import TogetherActivities from "./TogetherActivities";
import DailyHeartChallenge from "./DailyHeartChallenge";
import DailySyncPuzzle from "./DailySyncPuzzle";
import AIQuestions from "./AIQuestions";
import dynamic from "next/dynamic";
const PlayArcade = dynamic(() => import("./PlayArcade"), {
  loading: () => <p className="opening">Opening the arcade…</p>,
});
const tabs = [
  { id: "home", name: "Home", icon: Home },
  { id: "play", name: "Play", icon: Gamepad2 },
  { id: "memories", name: "Memories", icon: Images },
  { id: "notes", name: "Notes", icon: Mail },
  { id: "us", name: "Activities", icon: Heart },
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
    [invitedGame,setInvitedGame]=useState<GameId|null>(null),
    [invitedConfig,setInvitedConfig]=useState<Record<string,string|number|boolean>>({}),
    [editing, setEditing] = useState(false),
    [date, setDate] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [now, setNow] = useState<Date | null>(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [profiles, setProfiles] = useState<
      { id: string; slot: number; nickname: string }[]
    >([]),
    [nickname, setNickname] = useState("");
  useEffect(()=>{const open=(e:Event)=>{const detail=(e as CustomEvent<GameId|{id:GameId;config:Record<string,string|number|boolean>}>).detail;setInvitedGame(typeof detail==='string'?detail:detail.id);setInvitedConfig(typeof detail==='string'?{}:detail.config);setTab('play');};window.addEventListener('arcade-open-plugin',open);return()=>window.removeEventListener('arcade-open-plugin',open);},[]);
  useEffect(()=>{const open=()=>setTab('notes');window.addEventListener('arcade-open-notes',open);return()=>window.removeEventListener('arcade-open-notes',open);},[]);
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
      setError("This email is not connected to our arcade.");
      return;
    }
    const profile = await db
      .from("profiles")
      .select("couple_id")
      .eq("id", session.user.id)
      .single();
    if (profile.error) {
      setCoupleId(null);
      setError("This account has not been connected yet.");
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
  const stats = anniversary && now ? anniversaryStats(anniversary, now) : null;
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
          throw new Error("Your account has not been connected yet.");
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
      if (!db) throw new Error("Sign-in is unavailable. Try again later.");
      if (!isPrivateEmail(email)) throw new Error("Use your account email.");
      const { error } = await db.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error)
        throw new Error(
          error.status === 400
            ? "Email or password is incorrect. Try again."
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
  const season = now
    ? ["Winter window", "Spring blossoms", "Summer fireflies", "Autumn leaves"][
        Math.floor(((now.getMonth() + 1) % 12) / 3)
      ]
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
        Just your anniversary date. You can change it in Settings anytime.
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
      <ConnectionProvider
        db={db}
        session={session}
        coupleId={coupleId}
        profiles={profiles}
        preview={preview}
      >
        <KeepsakeProvider
          key={preview ? "preview" : session?.user.id || "signed-out"}
          db={db}
          session={session}
          couple={coupleId}
          preview={preview}
        >
          <div className="stage-app">
            <a href="#main" className="skip-link">
              Skip to Home
            </a>
            <aside className="side-rail">
              <a href="/" className="brand">
                <span>
                  <img
                    src="/icons/icon-192.png"
                    width={54}
                    height={54}
                    alt=""
                  />
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
                    title={t.name}
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
                      aria-label="Settings"
                      aria-pressed={tab === "settings"}
                      disabled={!preview && !coupleId}
                      onClick={() => {
                        setNickname(
                          profiles.find(
                            (p) =>
                              p.id === (preview ? "preview" : session?.user.id),
                          )?.nickname || "",
                        );
                        setTab("settings");
                        setEditing(false);
                      }}
                    >
                      <Settings size={20} />
                    </button>
                  )}
                </div>
              </header>
              <NativeBridge
                back={() => {
                  if (tab === "home") return false;
                  setTab("home");
                  return true;
                }}
              />
              <main id="main">
                <OfflineShell />
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
                      <img src="/icons/icon-192.png" width={150} height={150} alt="Two kitties together"/>
                    </div>
                    <h1>
                      A little world.
                      <br />
                      Just the two of you.
                    </h1>
                    <p>
                      Somewhere to play, keep memories, and make ordinary days
                      feel a little closer.
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
                    <h1>Your account isn’t connected yet.</h1>
                    <p>
                      Your account hasn’t been set up yet. Try again after
                      setup.
                    </p>
                    <button onClick={() => void load()}>Try again</button>
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
                ) : tab === "settings" ? (
                  <>
                    <button
                      className="text-button"
                      onClick={() => setTab("us")}
                    >
                      <ArrowLeft size={18} /> Back to Activities
                    </button>
                    <div className="page-heading">
                      <div>
                        <h1>Settings</h1>
                        <p>Preferences for our little world.</p>
                      </div>
                      <Settings size={32} />
                    </div>
                    <section className="date-setting">
                      <CalendarDays size={25} />
                      <div>
                        <h2>Our anniversary</h2>
                        <p>
                          {new Date(
                            anniversary + "T12:00:00",
                          ).toLocaleDateString("en", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}
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
                      <p>
                        Optional. Your nickname appears on your shared games.
                      </p>
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
                    <AIQuestions db={db} preview={preview} />
                    <KeepsakeBackup />
                    <MediaStorage />
                    <InstallSupport
                      db={db}
                      session={session}
                      preview={preview}
                      anniversary={anniversary}
                    />
                    <MusicControls />
                    <ArtSettings />
                    <section className="nickname-setting">
                      <h2>Your account</h2>
                      <p>
                        {preview
                          ? "Local preview on this device."
                          : session?.user.email}
                      </p>
                      <button
                        className="secondary"
                        onClick={async () => {
                          if (preview) {
                            setPreview(false);
                            setLoaded(false);
                            setAnniversary(null);
                            setMessage("");
                          } else {
                            const key =
                              localStorage.getItem("arcade-device-key");
                            if (key && db && session)
                              await db
                                .from("push_devices")
                                .delete()
                                .eq("user_id", session.user.id)
                                .eq("device_key", key);
                            await db?.auth.signOut();
                          }
                          setCoupleId(null);
                          setProfiles([]);
                          setNickname("");
                          setTab("home");
                        }}
                      >
                        <LogOut size={18} /> Sign out
                      </button>
                    </section>
                  </>
                ) : tab === "us" ? (
                  <>
                    <div className="page-heading">
                      <div>
                        <h1>Activities</h1>
                        <p>Shared wishes, plans, and time together.</p>
                      </div>
                      <Heart size={32} />
                    </div>
                    <Wishlists />
                    <TogetherActivities />
                    <PromiseLedger />
                    <HoldStats db={db} preview={preview}/>
                  </>
                ) : tab === "memories" ? (
                  <Memories />
                ) : tab === "notes" ? (
                  <><VoiceCassettes /><Postcards shortcut /><Notes /></>
                ) : tab === "play" ? null : (
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
                      <DailyConnection />
                    </div>
                    <ConnectionMoments />
                    <HoldHands db={db} session={session} couple={coupleId} preview={preview}/>
                    <VoiceCassettes latest />
                    <Postcards shortcut />
                    <PromiseLedger pendingOnly />
                    <GameInvites />
                    <DailySyncPuzzle />
                    <DailyHeartChallenge
                      names={names}
                      go={() => setTab("play")}
                    />
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
                        <p>
                          Your own photos and artwork make this place yours.
                        </p>
                        <button
                          className="secondary"
                          onClick={() => {
                            setNickname(
                              profiles.find(
                                (p) =>
                                  p.id ===
                                  (preview ? "preview" : session?.user.id),
                              )?.nickname || "",
                            );
                            setTab("settings");
                          }}
                        >
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
                        <button
                          className="text-button"
                          onClick={() => setTab("us")}
                        >
                          Open our wishlists
                        </button>
                      </div>
                    </section>
                    <WishlistShortcut go={() => setTab("us")} />
                    <section
                      className="coming-strip"
                      aria-label="Play shortcut"
                    >
                      <div>
                        <button
                          className="text-button"
                          onClick={() => setTab("play")}
                        >
                          <Gamepad2 size={21} />
                          Play together
                        </button>
                      </div>
                      <p>A little friendly rivalry is waiting in Play.</p>
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
                        invitedGame={invitedGame}
                        invitedConfig={invitedConfig}
                        active={tab === "play"}
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
        </KeepsakeProvider>
      </ConnectionProvider>
    </ArtProvider>
  );
}
