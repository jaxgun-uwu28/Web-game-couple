"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Heart, Shuffle } from "lucide-react";
import type { Wish, WishList } from "@/lib/keepsakes";
import { jarFill, jarLayout, jarWishes, wishSeed } from "@/lib/wish-jar";
import { armGameSounds, playGameSound } from "@/lib/game-feel";
import { tactile } from "@/lib/music";
import { useAsset } from "./ArtSlots";
export default function WishJar({
  wishes,
  lists,
  user,
  scope,
  mini = false,
  onPick,
}: {
  wishes: Wish[];
  lists: WishList[];
  user: string;
  scope: string;
  mini?: boolean;
  onPick?: (wish: Wish) => void;
}) {
  const active = jarWishes(wishes, lists, user),
    layout = jarLayout(active, lists);
  const [displayCount, setDisplayCount] = useState(active.length);
  const previousCount = useRef(active.length);
  const [drops, setDrops] = useState<string[]>([]),
    [departing, setDeparting] = useState<Wish[]>([]),
    [notice, setNotice] = useState(""),
    [rattle, setRattle] = useState(false),
    [lid, setLid] = useState(false),
    [motion, setMotion] = useState(false),
    [permission, setPermission] = useState(""),
    [tilt, setTilt] = useState(0),
    [motionSupported, setMotionSupported] = useState(false),
    [reduced, setReduced] = useState(false);
  const previous = useRef<Wish[] | null>(null),
    initialized = useRef(""),
    lastShake = useRef(0);
  const bodyArt = useAsset("wish-jar"),
    lidArt = useAsset("wish-jar-lid"),
    mascot = useAsset("wish-jar-mascot");
  const noteArts = [
    useAsset("wish-note-1"),
    useAsset("wish-note-2"),
    useAsset("wish-note-3"),
    useAsset("wish-note-4"),
    useAsset("wish-note-5"),
    useAsset("wish-note-6"),
  ];
  useEffect(() => {
    setMotionSupported(typeof DeviceMotionEvent !== "undefined");
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    const from = previousCount.current;
    previousCount.current = active.length;
    if (reduced || mini) {
      setDisplayCount(active.length);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 350);
      setDisplayCount(Math.round(from + (active.length - from) * progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active.length, reduced, mini]);
  const shakeRef = useRef<() => void>(() => {});
  function shake() {
    if (!active.length || Date.now() - lastShake.current < 1600) return;
    lastShake.current = Date.now();
    armGameSounds();
    playGameSound("chip-click");
    void tactile([15, 35, 15]);
    setRattle(true);
    setTimeout(() => {
      setRattle(false);
      onPick?.(active[Math.floor(Math.random() * active.length)]);
    }, 700);
  }
  shakeRef.current = shake;
  useEffect(() => {
    if (mini || !user || !lists.length) return;
    const key = `arcade-jar:${user}:${scope}`,
      ids = active.map((w) => w.id);
    let seen: string[] = [];
    if (initialized.current !== key) {
      try {
        const saved = JSON.parse(localStorage.getItem(key) || "[]");
        seen = Array.isArray(saved)
          ? saved.filter((id) => typeof id === "string")
          : [];
      } catch {}
      initialized.current = key;
      previous.current = null;
    } else seen = previous.current?.map((w) => w.id) || [];
    const added = active.filter((w) => !seen.includes(w.id));
    const removed = (previous.current || []).filter((w) => !ids.includes(w.id));
    setDrops(added.slice(-8).map((w) => w.id));
    setDeparting(removed.slice(0, 8));
    const cameTrue = removed.some(
      (w) => wishes.find((x) => x.id === w.id)?.status === "done",
    );
    const partnerAdded = added.some((w) => w.created_by !== user);
    const milestone = [10, 25, 50, 100].find(
      (n) => seen.length < n && active.length >= n,
    );
    setNotice(
      cameTrue
        ? "Came true ♥"
        : milestone
          ? "Our jar is getting full ♥"
          : partnerAdded
            ? "Partner made a wish"
            : added.length
              ? `Wish added to the jar. ${active.length} wishes.`
              : "",
    );
    if (added.length || cameTrue) {
      playGameSound("chip-click");
      void tactile(12);
    }
    previous.current = active;
    try {
      localStorage.setItem(key, JSON.stringify(ids));
    } catch {}
    const t = setTimeout(() => {
      setDrops([]);
      setDeparting([]);
      setNotice("");
    }, 3000);
    return () => clearTimeout(t);
    // Only meaningful data changes restart the bounded animations.
  }, [
    active
      .map((w) => `${w.id}:${w.status}`)
      .sort()
      .join("|"),
    wishes
      .filter((w) => w.status === "done")
      .map((w) => w.id)
      .sort()
      .join("|"),
    scope,
    user,
    mini,
    lists.length,
  ]);
  useEffect(() => {
    if (!motion || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const move = (e: DeviceMotionEvent) => {
      const a = e.acceleration;
      if (a && Math.hypot(a.x || 0, a.y || 0, a.z || 0) > 15)
        shakeRef.current();
      const g = e.accelerationIncludingGravity;
      if (g) setTilt(Math.max(-2, Math.min(2, g.x || 0)));
    };
    window.addEventListener("devicemotion", move);
    return () => window.removeEventListener("devicemotion", move);
  }, [motion]);
  async function enableMotion() {
    const api = DeviceMotionEvent as typeof DeviceMotionEvent & {
      requestPermission?: () => Promise<string>;
    };
    try {
      if (
        api.requestPermission &&
        (await api.requestPermission()) !== "granted"
      ) {
        setPermission("Use the Shake button instead.");
        return;
      }
      setMotion(true);
    } catch {
      setPermission("Use the Shake button instead.");
    }
  }
  return (
    <div
      className={`wish-jar ${mini ? "mini" : ""} ${rattle ? "rattling" : ""}`}
    >
      <div
        className={`jar-vessel ${drops.length ? "happy" : ""}`}
        style={{ "--jar-tilt": `${tilt}px` } as CSSProperties}
      >
        <svg viewBox="0 0 320 360" className="jar-glass" aria-hidden="true">
          <path
            className="jar-body"
            d="M112 61H208V87Q258 104 258 144V296Q258 331 225 331H95Q62 331 62 296V144Q62 104 112 87Z"
          />
          <path
            className="jar-reflection"
            d="M84 141V274M94 118L101 110M231 160V283"
          />
          <path className="jar-mouth" d="M111 67H209M111 79H209" />
        </svg>
        {bodyArt?.kind === "image" && (
          <img className="jar-custom-body" src={bodyArt.src} alt="" />
        )}
        <div
          className="jar-fill"
          style={{ height: `${jarFill(active.length) * 62}%` }}
        />
        {layout.map(({ wish, x, y, angle, color }) => {
          const noteArt =
            noteArts[wishSeed(wish.id) % noteArts.length] || noteArts[0];
          return (
            <button
              type="button"
              key={wish.id}
              title={wish.title}
              aria-label={`Open wish: ${wish.title}`}
              disabled={mini || !onPick}
              className={`jar-note ${drops.includes(wish.id) ? "falling" : ""}`}
              onClick={() => onPick?.(wish)}
              style={
                {
                  left: `${x / 3.2}%`,
                  top: `${y / 3.6}%`,
                  "--note-angle": `${angle}deg`,
                  "--entry-x": 160 - x,
                  "--entry-y": y - 42,
                  "--entry-mouth-y": y - 95,
                  "--note-color": color,
                  "--note-delay": `${Math.max(0, drops.indexOf(wish.id)) * 250}ms`,
                } as CSSProperties
              }
            >
              {noteArt?.kind === "image" ? (
                <img src={noteArt.src} alt="" />
              ) : (
                <>
                  <span>{wish.title.slice(0, 1).toUpperCase()}</span>
                  <Heart size={10} />
                </>
              )}
              {wish.created_by !== user && (
                <i className="note-ribbon" aria-label="From Partner" />
              )}
            </button>
          );
        })}
        {departing.map((w) => (
          <span className="jar-note leaving" key={`out-${w.id}`}>
            <Heart size={14} />
          </span>
        ))}
        {!active.length && (
          <div className="jar-mascot" aria-hidden="true">
            {mascot?.kind === "image" ? (
              <img src={mascot.src} alt="" />
            ) : (
              <svg viewBox="0 0 100 90">
                <path
                  d="M22 62V26L40 39Q50 32 60 39L78 26V62Q78 81 50 81Q22 81 22 62Z"
                  fill="#fff8f3"
                  stroke="#50313f"
                  strokeWidth="4"
                />
                <circle cx="39" cy="55" r="3" />
                <circle cx="61" cy="55" r="3" />
                <path
                  d="M45 66Q50 73 55 66"
                  fill="none"
                  stroke="#9d304f"
                  strokeWidth="3"
                />
              </svg>
            )}
          </div>
        )}
        <button
          type="button"
          className={`jar-lid ${lid ? "wiggling" : ""}`}
          aria-label="Wiggle the jar lid"
          disabled={mini}
          onClick={() => {
            setLid(true);
            setTimeout(() => setLid(false), 500);
          }}
        >
          {lidArt?.kind === "image" ? (
            <img src={lidArt.src} alt="" />
          ) : (
            <svg viewBox="0 0 120 30" aria-hidden="true">
              <rect
                x="4"
                y="5"
                width="112"
                height="21"
                rx="8"
                fill="#f8c9d8"
                stroke="#9d304f"
                strokeWidth="3"
              />
              <path d="M18 11H102" stroke="#fff8f3" strokeWidth="3" />
            </svg>
          )}
        </button>
        {!!drops.length && (
          <span className="jar-sparkles" aria-hidden="true">
            ✦ ♥ ✧
          </span>
        )}
        {notice.includes("getting full") && (
          <div className="jar-milestone" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} style={{ "--i": i } as CSSProperties}>
                ♥
              </i>
            ))}
          </div>
        )}
      </div>
      <span className="jar-counter" key={active.length}>
        {displayCount} {displayCount === 1 ? "wish" : "wishes"}
      </span>
      {!mini && (
        <>
          {!active.length && <p>Make your first wish.</p>}
          <p className="jar-notice" role="status" aria-live="polite">
            {notice}
          </p>
          {!!active.length && onPick && (
            <button type="button" className="jar-shake" onClick={shake}>
              <Shuffle size={18} /> Shake the wish jar
            </button>
          )}
          {motionSupported && onPick && (
            <button
              type="button"
              disabled={reduced}
              className="text-button jar-motion"
              onClick={() => (motion ? setMotion(false) : void enableMotion())}
              aria-pressed={motion}
            >
              {motion ? "Phone motion on" : "Enable phone shake & tilt"}
            </button>
          )}
          {permission && <p role="status">{permission}</p>}
          <span className="sr-only">
            {active.length} active wishes. The wish list below offers the same
            items.
          </span>
        </>
      )}
    </div>
  );
}
