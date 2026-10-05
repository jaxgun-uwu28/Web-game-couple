"use client";
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
export function useGamePresence(
  db: SupabaseClient | null,
  id: string | undefined,
  kind: string,
  enabled: boolean,
  cancelOnUnmount = true,
) {
  const [paired, setPaired] = useState(false),
    [error, setError] = useState("");
  const exit = useCallback(async () => {
    if (!db || !id) return;
    const { error } = await db.rpc("game_here", {
      gid: id,
      k: kind,
      leaving: true,
    });
    if (error)
      throw new Error(
        "The game could not exit. Check your connection and retry.",
      );
    setPaired(false);
  }, [db, id, kind]);
  useEffect(() => {
    setPaired(false);
    if (!enabled || !db || !id) return;
    let live = true,
      pending = false;
    const pulse = async () => {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const r = await db.rpc("game_here", { gid: id, k: kind });
        if (live) {
          setPaired(r.data === true);
          setError(
            r.error
              ? "The game connection could not load. Try again."
              : "",
          );
        }
      } catch {
        if (live) setError("Your game connection was interrupted.");
      } finally {
        pending = false;
      }
    };
    void pulse();
    const timer = setInterval(() => void pulse(), 4000);
    return () => {
      live = false;
      clearInterval(timer);
      if (cancelOnUnmount) void exit().catch(() => {});
    };
  }, [db, id, kind, enabled, exit, cancelOnUnmount]);
  return { paired, error, exit };
}
