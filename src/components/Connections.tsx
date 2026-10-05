"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import type {
  Session,
  SupabaseClient,
  RealtimeChannel,
} from "@supabase/supabase-js";
import {
  Heart,
  Mail,
  LockKeyhole,
  Check,
  Smile,
  Leaf,
  Moon,
  CloudRain,
  Cloud,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import {
  connectionPrompts,
  emptyConnectionState,
  moodLabels,
  sealedAnswers,
  type ConnectionState,
  type Mood,
} from "@/lib/connections";
import { manilaDay } from "@/lib/games";
import { gameRequest } from "@/lib/game-request";

const previewIds = ["preview", "preview-two"];
const moodIcons = {
  happy: Smile,
  calm: Leaf,
  tired: Moon,
  stressed: CloudRain,
  low: Cloud,
};
type ConnectionContext = {
  prompts: { daily: string; choice: string[]; saved: boolean; ready: boolean };
  state: ConnectionState;
  myId: string;
  names: string[];
  ids: string[];
  preview: boolean;
  seat: number;
  setSeat: (value: number) => void;
  busy: boolean;
  ready: boolean;
  error: string;
  message: string;
  clock: number;
  refresh: () => Promise<void>;
  answer: (kind: "daily" | "choice", value: string) => Promise<void>;
  mood: (value: Mood, note: string) => Promise<void>;
  tap: () => Promise<void>;
};
const Context = createContext<ConnectionContext | null>(null);
function useConnections() {
  const value = useContext(Context);
  if (!value) throw new Error("Connection provider is missing");
  return value;
}
export function ConnectionProvider({
  db,
  session,
  coupleId,
  profiles,
  preview,
  children,
}: {
  db: SupabaseClient | null;
  session: Session | null;
  coupleId: string | null;
  profiles: { id: string; slot: number; nickname: string }[];
  preview: boolean;
  children: React.ReactNode;
}) {
  const [state, setState] = useState(emptyConnectionState),
    [seat, setSeat] = useState(0),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [clock, setClock] = useState(Date.now());
  const [prompts, setPrompts] = useState(() => ({
    ...connectionPrompts(manilaDay()),
    saved: true,
    ready: false,
  }));
  const [questionTimezone, setQuestionTimezone] = useState("Asia/Manila");
  useEffect(() => {
    if (preview) {
      setPrompts({ ...connectionPrompts(state.day), saved: true, ready: true });
      return;
    }
    if (!db || !session || !coupleId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cached = localStorage.getItem(
      `arcade-content:${coupleId}:${state.day}`,
    );
    setPrompts({ ...connectionPrompts(state.day), saved: true, ready: false });
    if (cached) {
      try {
        setPrompts({ ...JSON.parse(cached), ready: true });
      } catch {}
    }
    async function loadPack() {
      try {
        const result = await gameRequest(
          db,
          { action: "content" },
          fetch,
          "/api/ai",
        );
        if (cancelled) return;
        if (result.pending) {
          timer = setTimeout(() => void loadPack(), 1500);
          return;
        }
        if (typeof result.daily !== "string" || !Array.isArray(result.choice))
          return;
        if (result.day !== state.day) {
          if (result.timezone) setQuestionTimezone(result.timezone);
          return;
        }
        const next = {
          daily: result.daily,
          choice: result.choice,
          saved: Boolean(result.saved),
          ready: true,
        };
        if (result.timezone) setQuestionTimezone(result.timezone);
        setPrompts(next);
        localStorage.setItem(
          `arcade-content:${coupleId}:${result.day}`,
          JSON.stringify(next),
        );
      } catch {
        if (!cancelled) setPrompts((p) => ({ ...p, ready: Boolean(cached) }));
      }
    }
    void loadPack();
    const live = db
      .channel(`ai-content:${coupleId}`, { config: { private: true } })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "generation_jobs",
          filter: `couple_id=eq.${coupleId}`,
        },
        () => void loadPack(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      void db.removeChannel(live);
    };
  }, [db, session?.user.id, coupleId, preview, state.day]);
  const locked = useRef(false),
    channel = useRef<RealtimeChannel | null>(null),
    requestVersion = useRef(0),
    lastIncoming = useRef<string | null>(null),
    serverOffset = useRef(0);
  const ids = preview
      ? previewIds
      : [0, 1].map((s) => profiles.find((p) => p.slot === s)?.id || ""),
    names = [0, 1].map(
      (s) => profiles.find((p) => p.slot === s)?.nickname || `Player ${s + 1}`,
    ),
    myId = preview ? ids[seat] : session?.user.id || "";
  const refresh = useCallback(async () => {
    if (preview || !db || !session || !coupleId) return;
    const version = ++requestVersion.current;
    const { data, error } = await db.rpc("connection_state");
    if (version !== requestVersion.current) return;
    if (error) {
      setError(
        error.message.includes("function")
          ? "Run Stage 3 migration 005 in Supabase to open these connections."
          : "Our connection could not refresh. Try again.",
      );
      return;
    }
    const next = data as ConnectionState;
    const incoming = next.taps.find((t) => t.recipient === session.user.id);
    if (
      lastIncoming.current !== null &&
      incoming &&
      lastIncoming.current !== incoming.id
    ) {
      navigator.vibrate?.([35, 60, 35]);
      setMessage("A little tap from your person. They’re thinking of you.");
    }
    lastIncoming.current = incoming?.id || "";
    serverOffset.current = Date.parse(next.server_now) - Date.now();
    setState(next);
    setReady(true);
    setError("");
  }, [db, session?.user.id, coupleId, preview]);
  useEffect(() => {
    const timer = setInterval(
      () => setClock(Date.now() + serverOffset.current),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setReady(preview);
    setError("");
    setMessage("");
    setState(emptyConnectionState());
    lastIncoming.current = null;
    setSeat(0);
    if (preview || !db || !session || !coupleId) return;
    let cancelled = false;
    void refresh();
    void db.realtime.setAuth(session.access_token).then(() => {
      if (cancelled) return;
      const live = db
        .channel(`connection:${coupleId}`, { config: { private: true } })
        .on("broadcast", { event: "answer-sealed" }, () => void refresh())
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "mood_checkins",
            filter: `couple_id=eq.${coupleId}`,
          },
          () => void refresh(),
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "connection_taps",
            filter: `couple_id=eq.${coupleId}`,
          },
          () => void refresh(),
        )
        .subscribe();
      channel.current = live;
    });
    const timer = setInterval(() => void refresh(), 10000);
    const reconnect = () => void refresh();
    window.addEventListener("online", reconnect);
    document.addEventListener("visibilitychange", reconnect);
    return () => {
      cancelled = true;
      requestVersion.current++;
      clearInterval(timer);
      window.removeEventListener("online", reconnect);
      document.removeEventListener("visibilitychange", reconnect);
      if (channel.current) {
        void db.removeChannel(channel.current);
        channel.current = null;
      }
    };
  }, [db, coupleId, session?.access_token, preview, refresh]);
  useEffect(() => {
    const currentDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: questionTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(clock));
    if (!ready || state.day === currentDay) return;
    if (preview)
      setState((s) => ({
        ...emptyConnectionState(),
        matches: s.matches,
        total: s.total,
        moods: s.moods,
        taps: s.taps,
      }));
    else void refresh();
  }, [clock, state.day, preview, ready, refresh, questionTimezone]);
  async function work(task: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
      navigator.vibrate?.(12);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "This could not save. Try again.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const answer = async (kind: "daily" | "choice", value: string) =>
    work(async () => {
      if (!prompts.ready)
        throw new Error(
          "Open our shared question pack before answering. Reload this page to retry.",
        );
      if (!value.trim() || value.length > 2000)
        throw new Error("Write an answer up to 2,000 characters.");
      if (preview) {
        setState((s) => {
          if (s[kind].some((a) => a.user_id === myId)) return s;
          const answers = [...s[kind], { user_id: myId, answer: value.trim() }];
          const next = { ...s, [kind]: answers };
          if (kind === "daily" && answers.length === 2) next.streak = 1;
          if (kind === "choice" && answers.length === 2) {
            const match = answers[0].answer === answers[1].answer;
            next.total++;
            next.matches += match ? 1 : 0;
          }
          return next;
        });
      } else {
        const { error } = await db!.rpc("seal_connection_answer", {
          kind,
          value,
          for_day: state.day,
        });
        if (error) throw new Error(error.message);
        await channel.current?.send({
          type: "broadcast",
          event: "answer-sealed",
          payload: { kind },
        });
        await refresh();
      }
      setMessage("Your answer is saved. Both answers open together.");
    });
  const mood = async (value: Mood, note: string) =>
    work(async () => {
      if (note.length > 160)
        throw new Error("Keep your mood note to 160 characters.");
      if (preview)
        setState((s) => ({
          ...s,
          moods: [
            {
              user_id: myId,
              day: s.day,
              mood: value,
              note: note.trim(),
              updated_at: new Date().toISOString(),
            },
            ...s.moods.filter((m) => m.user_id !== myId || m.day !== s.day),
          ],
        }));
      else {
        const { error } = await db!.rpc("check_in_mood", {
          value,
          message: note,
        });
        if (error) throw new Error(error.message);
        await refresh();
      }
      setMessage(
        "Your mood is shared with your person. You can update it today.",
      );
    });
  const tap = async () =>
    work(async () => {
      if (preview)
        setState((s) => ({
          ...s,
          taps: [
            {
              id: crypto.randomUUID(),
              sender: myId,
              recipient: ids[1 - seat],
              created_at: new Date().toISOString(),
            },
            ...s.taps,
          ].slice(0, 20),
        }));
      else {
        const { error } = await db!.rpc("thinking_of_you");
        if (error) throw new Error(error.message);
        await refresh();
      }
      setMessage("A little “thinking of you” is saved for your person.");
    });
  const visible = preview
    ? {
        ...state,
        daily: sealedAnswers(state.daily, myId),
        choice: sealedAnswers(state.choice, myId),
      }
    : state;
  return (
    <Context.Provider
      value={{
        prompts,
        state: visible,
        myId,
        names,
        ids,
        preview,
        seat,
        setSeat: (value) => {
          setSeat(value);
          setMessage("");
          setError("");
        },
        busy,
        ready,
        error,
        message,
        clock,
        refresh,
        answer,
        mood,
        tap,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function DailyConnection() {
  const {
    state,
    myId,
    busy,
    ready,
    error,
    message,
    refresh,
    answer,
    preview,
    seat,
    setSeat,
    names,
  } = useConnections();
  const [text, setText] = useState("");
  const prompts = useConnections().prompts,
    both = state.daily.length === 2,
    mine = state.daily.some((a) => a.user_id === myId);
  useEffect(() => setText(""), [myId, state.day]);
  useEffect(() => {
    if (mine) setText("");
  }, [mine]);
  return (
    <section className="question-page connection-daily">
      <div className="question-top">
        <Mail size={22} />
        <span>A page for today</span>
      </div>
      <h2>
        A little question, <br />
        just for us.
      </h2>
      <p className="daily-question">{prompts.daily}</p>
      <p className="small" role="status">
        {prompts.ready
          ? prompts.saved
            ? "Using our saved questions today."
            : "A fresh question from our shared pack."
          : "Opening our shared question pack. Answers unlock when it is ready."}
      </p>
      {!prompts.ready && (
        <button className="secondary" onClick={() => window.location.reload()}>
          Reload questions
        </button>
      )}
      {preview && (
        <div className="connection-preview" aria-label="Local preview player">
          {[0, 1].map((s) => (
            <button
              className="secondary"
              key={s}
              aria-pressed={seat === s}
              onClick={() => setSeat(s)}
            >
              Answer as {names[s]}
            </button>
          ))}
        </div>
      )}
      {!ready || !prompts.ready ? (
        <p className="small">
          {error
            ? "These connections need the database update."
            : "Opening today’s page…"}
        </p>
      ) : both ? (
        <div className="reveals">
          {state.daily.map((a) => (
            <blockquote key={a.user_id}>
              <b>{a.user_id === myId ? "You" : "Your person"}</b>
              <p>{a.answer}</p>
            </blockquote>
          ))}
        </div>
      ) : mine ? (
        <div className="sealed">
          <LockKeyhole size={28} />
          <p>
            Your answer is sealed.
            <br />
            Waiting for your person.
          </p>
          <small>{state.daily.length}/2 answers tucked away</small>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void answer("daily", text);
          }}
        >
          <label className="sr-only" htmlFor="daily-answer">
            Your private answer
          </label>
          <textarea
            id="daily-answer"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            placeholder="A thought, a memory, a little truth…"
            required
          />
          <button disabled={busy || !text.trim()}>
            {busy ? "Sealing…" : "Seal my answer"}
            <LockKeyhole size={16} />
          </button>
        </form>
      )}
      <p className="small">
        {state.streak
          ? `${state.streak} day${state.streak === 1 ? "" : "s"} answering together`
          : "Both answers open together."}{" "}
        · A new page at midnight in our saved timezone.
      </p>
      {(error || message) && (
        <div
          className={error ? "connection-status error" : "connection-status"}
          role={error ? "alert" : "status"}
        >
          <p>{error || message}</p>
          {error && (
            <button className="text-button" onClick={() => void refresh()}>
              <RefreshCw size={15} />
              Retry connection
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export function ConnectionMoments() {
  const {
    state,
    myId,
    names,
    ids,
    preview,
    clock,
    busy,
    ready,
    answer,
    mood,
    tap,
    error,
    message,
    refresh,
  } = useConnections();
  const [selected, setSelected] = useState<Mood>("calm"),
    [note, setNote] = useState("");
  const mine = state.moods.find(
      (m) => m.day === state.day && m.user_id === myId,
    ),
    partnerId = ids.find((id) => id !== myId),
    partner = state.moods.find(
      (m) => m.day === state.day && m.user_id === partnerId,
    ),
    choices = useConnections().prompts.choice,
    useConnectionsReady = useConnections().prompts.ready,
    both = state.choice.length === 2,
    ownChoice = state.choice.find((a) => a.user_id === myId),
    incoming = state.taps.find((t) => t.recipient === myId),
    sent = state.taps.find((t) => t.sender === myId);
  const cooldown = sent
    ? Math.min(
        60,
        Math.max(
          0,
          Math.ceil((Date.parse(sent.created_at) + 60000 - clock) / 1000),
        ),
      )
    : 0;
  useEffect(() => {
    setSelected(mine?.mood || "calm");
    setNote(mine?.note || "");
  }, [myId, mine?.updated_at, state.day]);
  const person = (id: string) =>
    id === myId ? "You" : names[ids.indexOf(id)] || "Your person";
  const stamp = (value: string) =>
    new Date(value).toLocaleTimeString("en", {
      hour: "numeric",
      minute: "2-digit",
    });
  return (
    <div className="connection-moments">
      {(error || message) && (
        <div
          className={error ? "connection-status error" : "connection-status"}
        >
          <p>{error || message}</p>
          {error && (
            <button className="text-button" onClick={() => void refresh()}>
              Retry connection
            </button>
          )}
        </div>
      )}
      <section className="choice-page">
        <div className="choice-intro">
          <h2>
            Two choices.
            <br />
            One little discovery.
          </h2>
          <p>Would you rather…</p>
        </div>
        <div
          className="choice-options"
          aria-label="Today's Would You Rather choices"
        >
          {choices.map((option, index) => (
            <button
              key={option}
              disabled={busy || !ready || !useConnectionsReady || !!ownChoice}
              aria-pressed={ownChoice?.answer === String(index)}
              className={ownChoice?.answer === String(index) ? "selected" : ""}
              onClick={() => void answer("choice", String(index))}
            >
              <span>{option}</span>
              {ownChoice?.answer === String(index) ? (
                <Check size={20} />
              ) : (
                <ArrowRight size={20} />
              )}
            </button>
          ))}
        </div>
        <div className="choice-result" role="status">
          {both ? (
            <>
              <strong>
                {state.choice[0].answer === state.choice[1].answer
                  ? "Same wavelength!"
                  : "A little different. Still a good pair."}
              </strong>
              <p>
                {state.choice
                  .map(
                    (a) => `${person(a.user_id)}: ${choices[Number(a.answer)]}`,
                  )
                  .join(" · ")}
              </p>
            </>
          ) : ownChoice ? (
            <p>
              <LockKeyhole size={16} />
              Your choice is sealed. Yours opens with theirs.
            </p>
          ) : (
            <p>Choose once today. Both picks reveal together.</p>
          )}
          <small>
            {state.total
              ? `${Math.round((state.matches / state.total) * 100)}% in sync · ${state.matches} of ${state.total} shared choices matched`
              : "Your match percentage grows after you both choose."}
          </small>
        </div>
      </section>
      <section className="mood-page">
        <div className="mood-heading">
          <h2>How’s your heart today?</h2>
          <p>A small check-in. No perfect answer needed.</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void mood(selected, note);
          }}
        >
          <fieldset className="mood-picker">
            <legend className="sr-only">Choose your mood</legend>
            {(Object.keys(moodLabels) as Mood[]).map((value) => {
              const Icon = moodIcons[value];
              return (
                <button
                  type="button"
                  key={value}
                  aria-pressed={selected === value}
                  onClick={() => setSelected(value)}
                  disabled={busy || !ready}
                >
                  <Icon size={24} />
                  <span>{moodLabels[value]}</span>
                </button>
              );
            })}
          </fieldset>
          <label htmlFor="mood-note">
            A little context <span className="small">(optional)</span>
          </label>
          <input
            id="mood-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={160}
            placeholder="What would help today?"
          />
          <button disabled={busy || !ready}>
            {busy ? "Saving…" : mine ? "Update my mood" : "Share my mood"}
            <Heart size={17} />
          </button>
        </form>
        <div className="partner-mood">
          {partner ? (
            <>
              <strong>
                {person(partner.user_id)} feels{" "}
                {moodLabels[partner.mood].toLowerCase()}.
              </strong>
              {partner.note && <p>{partner.note}</p>}
              <small>Shared at {stamp(partner.updated_at)}</small>
            </>
          ) : (
            <p>Your person’s check-in will appear here.</p>
          )}
        </div>
        <details className="mood-history">
          <summary>
            Our recent check-ins <span>{state.moods.length}</span>
          </summary>
          {state.moods.length ? (
            <ol>
              {state.moods.map((m) => (
                <li key={`${m.day}-${m.user_id}`}>
                  <strong>
                    {person(m.user_id)} · {moodLabels[m.mood]}
                  </strong>
                  <time dateTime={m.day}>
                    {new Date(`${m.day}T12:00:00`).toLocaleDateString("en", {
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                  {m.note && <p>{m.note}</p>}
                </li>
              ))}
            </ol>
          ) : (
            <p>Your first check-in starts this little history.</p>
          )}
        </details>
      </section>
      <section className="thinking-ribbon">
        <div className="thinking-mark">
          <Heart size={34} />
        </div>
        <div>
          <h2>A little tap. A little closer.</h2>
          <p>
            {incoming
              ? `Your person is thinking of you. A tap arrived at ${stamp(incoming.created_at)}.`
              : "Send a little “thinking of you” to your person."}
          </p>
          <small>
            {preview
              ? "Local preview · switch players above to see the tap."
              : "Live updates and vibration while the app is open. Background push comes in Stage 5."}
          </small>
        </div>
        <button
          disabled={busy || !ready || cooldown > 0}
          onClick={() => void tap()}
        >
          {cooldown ? `Sent · ${cooldown}s` : "Thinking of you"}
          <Heart size={18} />
        </button>
      </section>
    </div>
  );
}
