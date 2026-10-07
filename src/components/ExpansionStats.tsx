"use client";
import { useEffect, useState } from "react";
import { Heart, Star } from "lucide-react";
import { useKeepsakes } from "./Keepsakes";
type Stats = {
  voices: number;
  postcards: number;
  hold_count: number;
  hold_seconds: number;
  promises: number;
  achievements: string[];
};
export default function ExpansionStats() {
  const c = useKeepsakes(),
    [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    if (!c.db || c.preview) return;
    void c.db.rpc("expansion_stats").then((r) => {
      if (!r.error) setStats(r.data);
    });
  }, [c.db, c.preview]);
  return stats ? (
    <section className="expansion-stats">
      <h2>Little moments, kept together</h2>
      <div>
        <p>
          <Heart /> {Math.floor(stats.hold_seconds / 60)} minutes holding hands
        </p>
        <p>{stats.voices} cassettes exchanged</p>
        <p>{stats.postcards} postcards sent</p>
        <p>{stats.promises} promises kept</p>
      </div>
      <div className="achievement-row">
        {stats.achievements.map((x) => (
          <span key={x}>
            <Star size={18} />
            {x}
          </span>
        ))}
      </div>
    </section>
  ) : null;
}
