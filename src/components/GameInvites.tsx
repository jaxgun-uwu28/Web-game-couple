"use client";
import { useCallback, useEffect, useState } from "react";
import { useKeepsakes } from "./Keepsakes";
import { gameRequest } from "@/lib/game-request";
import { plugin } from "@/lib/plugin-games/registry";
import type { GameId } from "@/lib/plugin-games/types";
export default function GameInvites() {
  const c = useKeepsakes(),
    [rows, setRows] = useState<
      {
        id: string;
        game_id: GameId | "heartblast";
        host: string;
        status: string;
      }[]
    >([]),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!c.db || c.preview) return;
    const r = await c.db
      .from("arcade_matches")
      .select("id,game_id,host,status")
      .eq("couple_id", c.couple)
      .eq("status", "invited")
      .neq("host", c.user);
    const h = await c.db
      .from("heart_challenges")
      .select("id,host,status")
      .eq("couple_id", c.couple)
      .eq("status", "invited")
      .neq("host", c.user);
    setRows([
        ...(!r.error ? r.data || [] : []),
        ...(h.data || []).map((x) => ({
          ...x,
          game_id: "heartblast" as const,
        })),
      ]);
  }, [c.db, c.preview, c.couple, c.user]);
  useEffect(() => {
    void load();
    if (!c.db || c.preview) return;
    const ch = c.db
      .channel("home-game-invites")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "arcade_matches",
          filter: `couple_id=eq.${c.couple}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "heart_challenges",
          filter: `couple_id=eq.${c.couple}`,
        },
        () => void load(),
      )
      .subscribe(() => void load());
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    window.addEventListener("arcade:couple-update", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("arcade:couple-update", refresh);
      void c.db!.removeChannel(ch);
    };
  }, [load, c.db, c.preview, c.couple]);
  async function respond(id: string, action: string) {
    try {
      const heart = rows.find((x) => x.id === id)?.game_id === "heartblast";
      await gameRequest(
        c.db,
        heart
          ? { id, kind: "block", heartblast: true, action: { type: action } }
          : { id, action },
        fetch,
        heart ? "/api/game" : "/api/game/plugin",
      );
      if (action === "accept")
        window.dispatchEvent(
          new CustomEvent(heart ? "arcade-open-heart" : "arcade-open-plugin", {
            detail: rows.find((x) => x.id === id)?.game_id,
          }),
        );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Challenge unavailable.");
    }
  }
  return rows.length ? (
    <section className="game-invites">
      <h2>A little challenge</h2>
      {error && <p role="alert">{error}</p>}
      {rows.map((r) => (
        <article key={r.id}>
          <h3>
            {r.game_id === "heartblast"
              ? "Block Hearts Duel"
              : plugin(r.game_id).title}
          </h3>
          <p>Partner is inviting you to play.</p>
          <div>
            <button onClick={() => void respond(r.id, "accept")}>Accept</button>
            <button onClick={() => void respond(r.id, "decline")}>
              Decline
            </button>
            <button
              onClick={() => setRows((old) => old.filter((x) => x.id !== r.id))}
            >
              Play later
            </button>
          </div>
        </article>
      ))}
    </section>
  ) : null;
}
