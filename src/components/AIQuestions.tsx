"use client";
import { useState, useEffect, useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gameRequest } from "@/lib/game-request";
type Status = {
  configured: boolean;
  model: string;
  mock: boolean;
  used: number;
  budget: number;
  lastError: string | null;
  bank: Record<string, number>;
  dailyDays: number;
  choiceDays: number;
  enabled: boolean;
  timezone: string;
  pausedUntil: string | null;
};
export default function AIQuestions({
  db,
  preview,
}: {
  db: SupabaseClient | null;
  preview: boolean;
}) {
  const [open, setOpen] = useState(false),
    [onlineStatus, setStatus] = useState<Status | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [timezone, setTimezone] = useState("Asia/Manila");
  const status: Status | null = preview
    ? {
        configured: false,
        model: "gemini-2.5-flash-lite",
        mock: true,
        used: 0,
        budget: 60,
        lastError: null,
        bank: {},
        dailyDays: 0,
        choiceDays: 0,
        enabled: false,
        timezone: "Asia/Manila",
        pausedUntil: null,
      }
    : onlineStatus;
  const load = useCallback(async () => {
    if (preview) return;
    const { data } = await db!.auth.getSession();
    if (!data.session) throw new Error("Sign in again to load AI settings.");
    const response = await fetch("/api/ai", {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
      cache: "no-store",
    });
    const s = await response.json();
    if (!response.ok) throw new Error(s.error);
    setStatus(s);
    setTimezone(s.timezone);
    setError("");
  }, [db, preview]);
  useEffect(() => {
    if (open) void load().catch((e) => setError(e.message));
  }, [open, load]);
  async function work(body: Record<string, unknown>) {
    if (busy || preview) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await gameRequest(db, body, fetch, "/api/ai");
      if (body.action === "settings") {
        setStatus(result);
        setMessage("Your shared AI preference is saved.");
      } else {
        setMessage(
          result.pending
            ? "A pack is already being prepared. Check again shortly."
            : "Our saved pack is ready. Refilling only happens when fewer than seven days remain.",
        );
        await load();
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Questions could not refresh. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ai-settings">
      <h2>
        <button
          className="text-button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          AI Questions
        </button>
      </h2>
      {open && (
        <>
          <p>
            A little variety, with a small request budget. Saved questions keep
            us playing.
          </p>
          {preview && (
            <p className="small">
              Example settings only. Your online values load after sign-in. This
              preview makes no Gemini requests.
            </p>
          )}
          {status ? (
            <>
              <dl className="ai-facts">
                <div>
                  <dt>Key configured</dt>
                  <dd>{status.configured ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>
                    {status.model}
                    {status.mock ? " · fixture mode" : ""}
                  </dd>
                </div>
                <div>
                  <dt>Requests today · UTC</dt>
                  <dd>
                    {status.used} / {status.budget}
                  </dd>
                </div>
                <div>
                  <dt>Daily questions ready</dt>
                  <dd>{status.dailyDays} days</dd>
                </div>
                <div>
                  <dt>Would you rather ready</dt>
                  <dd>{status.choiceDays} days</dd>
                </div>
              </dl>
              {status.lastError && (
                <p className="small">
                  Last AI issue: {status.lastError} Saved content is available.
                </p>
              )}
              {status.pausedUntil &&
                Date.parse(status.pausedUntil) > Date.now() && (
                  <p className="small">
                    AI is taking a short break. Saved questions are still
                    available.
                  </p>
                )}
              <label className="ai-toggle">
                <input
                  type="checkbox"
                  checked={status.enabled}
                  disabled={busy || preview}
                  onChange={(e) =>
                    void work({ action: "settings", enabled: e.target.checked })
                  }
                />
                Use AI questions
              </label>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void work({
                    action: "settings",
                    enabled: status.enabled,
                    timezone,
                  });
                }}
              >
                <label>
                  Our daily timezone
                  <input
                    disabled={preview || busy}
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    maxLength={60}
                  />
                </label>
                <button className="secondary" disabled={busy || preview}>
                  Save timezone
                </button>
              </form>
              <details>
                <summary>Saved question bank by topic</summary>
                {Object.keys(status.bank).length ? (
                  <dl className="ai-facts">
                    {Object.entries(status.bank).map(([t, n]) => (
                      <div key={t}>
                        <dt>{t}</dt>
                        <dd>{n}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p>No saved trivia yet. Our built-in fallback is ready.</p>
                )}
              </details>
              <button
                disabled={busy || preview}
                onClick={() => void work({ action: "refill" })}
              >
                {busy ? "Preparing our questions…" : "Refill now"}
              </button>
            </>
          ) : (
            <p role="status">Opening AI settings…</p>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button
                className="secondary"
                onClick={() => void load().catch((e) => setError(e.message))}
              >
                Retry settings
              </button>
            </div>
          )}
          {message && <p role="status">{message}</p>}
        </>
      )}
    </section>
  );
}
