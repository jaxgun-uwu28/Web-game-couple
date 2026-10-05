"use client";
import { useEffect, useState } from "react";
import { useKeepsakes } from "./Keepsakes";
import { manilaDay } from "@/lib/games";
export default function DailyHeartChallenge({ go,names }: { go: () => void;names:string[] }) {
  const c = useKeepsakes(),
    [scores, setScores] = useState<number[]>([0, 0]);
  useEffect(() => {
    if (c.preview || !c.db || !c.couple) return;
    let live = true;
    const load = async () => {
      const r = await c
        .db!.from("block_matches")
        .select("state")
        .eq("couple_id", c.couple!)
        .eq("state->options->>mode", "daily")
        .eq("state->options->>day", manilaDay())
        .order("created_at", { ascending: false })
        .limit(1);
      if (live && r.data?.[0]) setScores(r.data[0].state.scores);
    };
    void load();
    const t = setInterval(() => void load(), 10000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [c.db, c.couple, c.preview]);
  return (
    <section className="daily-heart">
      <div>
        <h2>Daily Challenge</h2>
        <p>
          {names[0]} {scores[0]} · {names[1]} {scores[1]}
        </p>
      </div>
      <button
        onClick={() => {
          localStorage.setItem("arcade-open-daily", "true");
          go();
          window.dispatchEvent(new Event("arcade:daily-block"));
        }}
      >
        Play today
      </button>
    </section>
  );
}
