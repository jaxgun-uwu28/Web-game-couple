"use client";
import { useCallback, useEffect, useState } from "react";
import { useKeepsakes } from "./Keepsakes";
import { plugin } from "@/lib/plugin-games/registry";
import type { GameId } from "@/lib/plugin-games/types";
export default function GameInvites() {
  const c = useKeepsakes(),
    [rows, setRows] = useState<
      {
        id: string;
        game_id: GameId;
        host: string;
        status: string;
      }[]
    >([]);
  const load = useCallback(async () => {
    if (!c.db || c.preview || !c.couple || !c.user) {
      setRows([]);
      return;
    }
    const r = await c.db
      .from("arcade_matches")
      .select("id,game_id,host,status")
      .eq("couple_id", c.couple)
      .neq("game_id", "syncsteps")
      .in("status", ["invited", "waiting"])
      .neq("host", c.user);
    setRows(!r.error ? r.data || [] : []);
  }, [c.db, c.preview, c.couple, c.user]);
  useEffect(() => {
    void load();
    if (!c.db || c.preview || !c.couple || !c.user) return;
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
      .subscribe(() => void load());
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    window.addEventListener("arcade:couple-update", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("arcade:couple-update", refresh);
      void c.db!.removeChannel(ch);
    };
  }, [load, c.db, c.preview, c.couple, c.user]);
  return rows.length ? (
    <section className="game-invites">
      <h2>Partner’s game room</h2>
      {rows.map((r) => (
        <article key={r.id}>
          <h3>
            {plugin(r.game_id).title}
          </h3>
          <p>Join the room, then tap I’m ready.</p>
          <div>
            <button onClick={() => window.dispatchEvent(new CustomEvent("arcade-open-plugin", { detail: r.game_id }))}>Join room</button>
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
