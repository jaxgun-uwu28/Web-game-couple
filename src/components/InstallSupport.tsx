"use client";
import { useEffect, useState, useRef } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { Download, Bell, Smartphone, RefreshCw } from "lucide-react";
import { Capacitor } from "@capacitor/core";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
type Preferences = {
  enabled: boolean;
  wishes: boolean;
  memories: boolean;
  notes: boolean;
  taps: boolean;
  turns: boolean;
  quiet_start: number;
  quiet_end: number;
  timezone: string;
};
const defaults: Preferences = {
  enabled: false,
  wishes: true,
  memories: true,
  notes: true,
  taps: true,
  turns: true,
  quiet_start: 22,
  quiet_end: 8,
  timezone: "Asia/Manila",
};
export function NativeBridge({ back }: { back: () => boolean }) {
  const current = useRef(back);
  current.current = back;
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cleanups: (() => void)[] = [];
    let gone = false;
    void (async () => {
      const { App } = await import("@capacitor/app"),
        { StatusBar, Style } = await import("@capacitor/status-bar");
      await StatusBar.setStyle({ style: Style.Light });
      const listener = await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) window.history.back();
        else if (!current.current()) void App.minimizeApp();
      });
      if (gone) await listener.remove();
      else cleanups.push(() => void listener.remove());
      const tactile = async (e: Event) => {
        if ((e.target as HTMLElement).closest("button")) {
          const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
          void Haptics.impact({ style: ImpactStyle.Light });
        }
      };
      document.addEventListener("click", tactile);
      cleanups.push(() => document.removeEventListener("click", tactile));
    })().catch(() => {});
    return () => {
      gone = true;
      cleanups.forEach((c) => c());
    };
  }, []);
  return null;
}
export function OfflineShell() {
  const [offline, setOffline] = useState(false),
    [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    if (
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production" &&
      !Capacitor.isNativePlatform()
    )
      void navigator.serviceWorker
        .register("/sw.js")
        .then((r) => {
          if (r.waiting) setWaiting(r.waiting);
          r.addEventListener("updatefound", () => {
            const worker = r.installing;
            worker?.addEventListener("statechange", () => {
              if (
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              )
                setWaiting(worker);
            });
          });
        })
        .catch(() => {});
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return (
    <>
      {offline && (
        <p className="install-banner" role="status">
          You’re offline. New wishes can queue on this device; live games wait
          for a connection.
        </p>
      )}
      {waiting && (
        <div className="install-banner">
          <span>A fresh little update is ready.</span>
          <button
            className="secondary"
            onClick={() => {
              navigator.serviceWorker.addEventListener(
                "controllerchange",
                () => location.reload(),
                { once: true },
              );
              waiting.postMessage("ACTIVATE_UPDATE");
            }}
          >
            Update app <RefreshCw size={17} />
          </button>
        </div>
      )}
    </>
  );
}
export default function InstallSupport({
  db,
  session,
  preview,
  anniversary,
}: {
  db: SupabaseClient | null;
  session: Session | null;
  preview: boolean;
  anniversary: string | null;
}) {
  const [install, setInstall] = useState<InstallEvent | null>(null),
    [prefs, setPrefs] = useState(defaults),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [preferencesReady, setPreferencesReady] = useState(preview),
    [loadError, setLoadError] = useState(""),
    [loadVersion, setLoadVersion] = useState(0);
  const native = Capacitor.isNativePlatform();
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  useEffect(() => {
    if (preview) {
      setPreferencesReady(true);
      return;
    }
    setPreferencesReady(false);
    setLoadError("");
    setPrefs(defaults);
    if (!db || !session) return;
    let alive = true;
    void db
      .from("notification_preferences")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then((r) => {
        if (!alive) return;
        if (r.error) {
          setLoadError(
            "Your saved notification choices could not load. Check your connection and migration 007, then retry.",
          );
          return;
        }
        setPrefs(r.data ? (r.data as Preferences) : defaults);
        setPreferencesReady(true);
      });
    return () => {
      alive = false;
    };
  }, [db, session?.user.id, preview, loadVersion]);
  async function work(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Try again when you’re connected.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!preferencesReady)
      throw new Error("Load your saved choices before changing them.");
    if (preview) {
      setMessage("Preferences updated for this preview.");
      return;
    }
    const r = await db!
      .from("notification_preferences")
      .upsert({ user_id: session!.user.id, ...prefs });
    if (r.error)
      throw new Error(
        "Notification preferences need migration 007. " + r.error.message,
      );
    setMessage("Your quiet hours and notification choices are saved.");
  }
  async function enable() {
    if (preview) {
      setMessage(
        "Notification permission is only requested for your signed-in account.",
      );
      return;
    }
    if (!db || !session) throw new Error("Sign in first.");
    const deviceKey =
      localStorage.getItem("arcade-device-key") || crypto.randomUUID();
    localStorage.setItem("arcade-device-key", deviceKey);
    if (native) {
      const { PushNotifications } =
        await import("@capacitor/push-notifications");
      await PushNotifications.createChannel({
        id: "little-updates",
        name: "Little updates",
        importance: 4,
      });
      const permission = await PushNotifications.requestPermissions();
      if (permission.receive !== "granted")
        throw new Error(
          "Notifications were not allowed. You can change this in Android settings.",
        );
      let resolveToken!: (token: string) => void,
        rejectToken!: (error: Error) => void;
      const tokenPromise = new Promise<string>((resolve, reject) => {
        resolveToken = resolve;
        rejectToken = reject;
      });
      const good = await PushNotifications.addListener(
        "registration",
        (token) => resolveToken(token.value),
      );
      const bad = await PushNotifications.addListener("registrationError", () =>
        rejectToken(
          new Error("Firebase is not configured for this Android build yet."),
        ),
      );
      const timeout = setTimeout(
        () =>
          rejectToken(
            new Error(
              "Notification registration timed out. Check your connection and Firebase setup.",
            ),
          ),
        15000,
      );
      try {
        const [, token] = await Promise.all([
          PushNotifications.register(),
          tokenPromise,
        ]);
        const r = await db.from("push_devices").upsert(
          {
            user_id: session.user.id,
            device_key: deviceKey,
            platform: "android",
            token,
            json_subscription: null,
          },
          { onConflict: "user_id,device_key" },
        );
        if (r.error) throw new Error(r.error.message);
      } finally {
        clearTimeout(timeout);
        await good.remove();
        await bad.remove();
      }
    } else {
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        throw new Error(
          "Use an installed supported browser app for notifications. On iPhone, add the site to your Home Screen first.",
        );
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key)
        throw new Error(
          "Web push is not configured yet. Realtime updates still work while the app is open.",
        );
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "Notifications were not allowed. You can keep using the app normally.",
        );
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration?.active)
        throw new Error(
          "Open the deployed app first, then enable notifications. The local development preview does not register push.",
        );
      const padded = key.replace(/-/g, "+").replace(/_/g, "/"),
        bytes = Uint8Array.from(
          atob(padded + "=".repeat((4 - (padded.length % 4)) % 4)),
          (c) => c.charCodeAt(0),
        );
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        }));
      const r = await db.from("push_devices").upsert(
        {
          user_id: session.user.id,
          device_key: deviceKey,
          platform: "web",
          json_subscription: subscription.toJSON(),
          token: null,
        },
        { onConflict: "user_id,device_key" },
      );
      if (r.error) throw new Error(r.error.message);
    }
    const next = { ...prefs, enabled: true };
    const result = await db
      .from("notification_preferences")
      .upsert({ user_id: session.user.id, ...next });
    if (result.error) throw new Error(result.error.message);
    setPrefs(next);
    setMessage(
      "Notifications enabled for this device. Your quiet hours apply.",
    );
  }
  async function reminders() {
    if (!native)
      throw new Error(
        "Local anniversary reminders are available in the Android app.",
      );
    if (!anniversary) throw new Error("Save your anniversary first.");
    const { LocalNotifications } =
      await import("@capacitor/local-notifications");
    const p = await LocalNotifications.requestPermissions();
    if (p.display !== "granted")
      throw new Error("Allow notifications to set reminders.");
    const date = new Date(anniversary + "T10:00:00"),
      now = new Date();
    date.setFullYear(now.getFullYear());
    if (date < now) date.setFullYear(now.getFullYear() + 1);
    const week = new Date(date.getTime() - 7 * 86400000);
    await LocalNotifications.cancel({
      notifications: [{ id: 609 }, { id: 602 }],
    });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 609,
          title: "Our anniversary",
          body: "Another year of your kind of magic.",
          schedule: { at: date },
        },
        ...(week > now
          ? [
              {
                id: 602,
                title: "A week until our anniversary",
                body: "A little celebration is getting closer.",
                schedule: { at: week },
              },
            ]
          : []),
      ],
    });
    setMessage("Two local anniversary reminders are scheduled on this phone.");
  }
  return (
    <section className="installation-setting">
      <h2>Take our little world with you.</h2>
      <p>Install it on your Home Screen, and make room for gentle updates.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {install && (
        <button
          onClick={() =>
            void work(async () => {
              await install.prompt();
              const choice = await install.userChoice;
              setMessage(
                choice.outcome === "accepted"
                  ? "Your app is installing."
                  : "You can install whenever you’re ready.",
              );
              setInstall(null);
            })
          }
        >
          Install app <Download size={18} />
        </button>
      )}
      <details>
        <summary>iPhone and Android install guide</summary>
        <p>
          iPhone: open the deployed site in Safari, tap Share, then Add to Home
          Screen and Open as Web App. Android: use the browser’s Install app
          option, or install the private APK from your trusted download.
        </p>
        <p>Your login remains private in every version.</p>
      </details>
      <h3>Your gentle updates</h3>
      {!preferencesReady &&
        (loadError ? (
          <div role="alert">
            <p>{loadError}</p>
            <button
              className="secondary"
              onClick={() => setLoadVersion((v) => v + 1)}
            >
              Retry saved choices
            </button>
          </div>
        ) : (
          <p role="status">Loading your saved notification choices…</p>
        ))}
      <p>
        Claims and Secret Ideas never send shared notifications. Updates use a
        discreet message without private note or photo content.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void work(save);
        }}
      >
        <fieldset disabled={busy || !preferencesReady}>
          {(
            ["enabled", "wishes", "memories", "notes", "taps", "turns"] as const
          ).map((k) => (
            <label className="check-row" key={k}>
              <input
                type="checkbox"
                checked={prefs[k]}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, [k]: e.target.checked }))
                }
              />
              {
                {
                  enabled: "Allow updates",
                  wishes: "Wishlist updates",
                  memories: "New memories",
                  notes: "New letters",
                  taps: "Thinking of you",
                  turns: "Your game turn",
                }[k]
              }
            </label>
          ))}
          <div className="form-pair">
            <label>
              Quiet hours start
              <select
                value={prefs.quiet_start}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    quiet_start: Number(e.target.value),
                  }))
                }
              >
                {Array.from({ length: 24 }, (_, n) => (
                  <option key={n} value={n}>
                    {String(n).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quiet hours end
              <select
                value={prefs.quiet_end}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, quiet_end: Number(e.target.value) }))
                }
              >
                {Array.from({ length: 24 }, (_, n) => (
                  <option key={n} value={n}>
                    {String(n).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Timezone
            <input
              value={prefs.timezone}
              maxLength={80}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, timezone: e.target.value }))
              }
            />
          </label>
          <button disabled={busy || !preferencesReady}>
            Save notification choices
          </button>
        </fieldset>
      </form>
      <div className="install-actions">
        <button
          disabled={busy || !preferencesReady}
          className="secondary"
          onClick={() => void work(enable)}
        >
          Enable this device <Bell size={18} />
        </button>
        {native && (
          <button
            disabled={busy}
            className="secondary"
            onClick={() => void work(reminders)}
          >
            Anniversary reminders <Smartphone size={18} />
          </button>
        )}
      </div>
    </section>
  );
}
