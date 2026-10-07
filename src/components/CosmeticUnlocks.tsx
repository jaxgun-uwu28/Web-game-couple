"use client";
import { useCallback, useEffect, useState } from "react";
import { useKeepsakes } from "./Keepsakes";
export const cosmetics = [
  { id: "cassette-colors", title: "Cassette colors", coins: 25, xp: 50 },
  { id: "envelope-colors", title: "Envelope colors", coins: 25, xp: 50 },
  {
    id: "postcard-stamps",
    title: "Little stamp collection",
    coins: 50,
    xp: 100,
  },
  { id: "sticker-sparkles", title: "Sparkle stickers", coins: 50, xp: 100 },
];
export function useCosmetics() {
  const c = useKeepsakes(),
    [items, setItems] = useState<string[]>([]);
  const load = useCallback(async () => {
    if (c.preview) {
      setItems(cosmetics.map((x) => x.id));
      return;
    }
    if (!c.db) return;
    const r = await c.db
      .from("cosmetic_unlocks")
      .select("cosmetic")
      .eq("user_id", c.user);
    if (!r.error) setItems(r.data.map((x) => x.cosmetic));
  }, [c.db, c.user, c.preview]);
  useEffect(() => {
    void load();
    window.addEventListener("arcade-cosmetics", load);
    return () => window.removeEventListener("arcade-cosmetics", load);
  }, [load]);
  return items;
}
export default function CosmeticUnlocks() {
  const c = useKeepsakes(),
    items = useCosmetics(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [rewards, setRewards] = useState({ coins: 0, xp: 0 });
  const load = useCallback(async () => {
    if (!c.db || c.preview) return;
    const r = await c.db
      .from("game_rewards")
      .select("coins,xp")
      .eq("user_id", c.user)
      .maybeSingle();
    if (r.data) setRewards(r.data);
  }, [c.db, c.user, c.preview]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="cosmetic-unlocks">
      <h2>Little extras</h2>
      <p>
        {rewards.coins} game coins · {rewards.xp} XP
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="cosmetic-grid">
        {cosmetics.map((x) => (
          <article key={x.id}>
            <h3>{x.title}</h3>
            <p>
              {x.coins} game coins · {x.xp} XP needed
            </p>
            <button
              disabled={
                items.includes(x.id) ||
                !!busy ||
                rewards.coins < x.coins ||
                rewards.xp < x.xp
              }
              onClick={async () => {
                setBusy(x.id);
                setError("");
                try {
                  const r = await c.db!.rpc("unlock_cosmetic", { item: x.id });
                  if (r.error) throw r.error;
                  window.dispatchEvent(new Event("arcade-cosmetics"));
                  await load();
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not unlock this extra",
                  );
                } finally {
                  setBusy("");
                }
              }}
            >
              {items.includes(x.id) ? "Unlocked" : "Unlock"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
