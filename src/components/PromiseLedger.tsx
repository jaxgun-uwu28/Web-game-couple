"use client";
import { useCallback, useEffect, useState } from "react";
import { Heart, Check, Handshake, Coins } from "lucide-react";
import { useKeepsakes } from "./Keepsakes";
type PromiseRow = {
  id: string;
  promisor: string;
  owed_to: string;
  note: string;
  status: string;
  created_at: string;
  nudged_at: string | null;
  waiver_by: string | null;
};
export default function PromiseLedger({
  pendingOnly = false,
}: {
  pendingOnly?: boolean;
}) {
  const c = useKeepsakes(),
    [startingBalance, setStartingBalance] = useState(100),
    [rows, setRows] = useState<PromiseRow[]>([]),
    [wallets, setWallets] = useState<{ user_id: string; balance: number }[]>(
      [],
    ),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    if (c.preview || !c.db) return;
    const r = await c.db
      .from("promise_ledger")
      .select("*")
      .eq("couple_id", c.couple)
      .order("created_at", { ascending: false });
    if (r.error) {
      setError("Promises could not load.");
      return;
    }
    setRows(r.data);
    const w = await c.db
      .from("ledger_wallets")
      .select("user_id,balance")
      .eq("couple_id", c.couple);
    setWallets(w.data || []);
  }, [c.db, c.couple, c.preview]);
  useEffect(() => {
    void load();
    if (c.preview || !c.db) return;
    const ch = c.db
      .channel(`promises:${c.couple}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "promise_ledger",
          filter: `couple_id=eq.${c.couple}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void c.db?.removeChannel(ch);
    };
  }, [load, c.db, c.couple, c.preview]);
  async function action(id: string, a: string) {
    const r = await c.db?.rpc("promise_action", { i: id, a });
    if (r?.error) setError(r.error.message);
    else void load();
  }
  const list = rows.filter((x) => !pendingOnly || x.status === "pending");
  if (pendingOnly && !list.length) return null;
  return (
    <section className="promise-ledger">
      <h2>{pendingOnly ? "A little promise to keep" : "Our Promise Ledger"}</h2>
      {!pendingOnly && (
        <>
          <div className="list-tabs" aria-label="Starting wallet chips">
            {[10, 20, 50, 100].map((n) => (
              <button
                key={n}
                className={startingBalance === n ? "" : "secondary"}
                aria-pressed={startingBalance === n}
                onClick={() => setStartingBalance(n)}
              >
                {n} chips
              </button>
            ))}
          </div>
          <button
            className="secondary"
            onClick={() =>
              window.confirm(
                `Reset both wallets to ${startingBalance} chips each?`,
              ) &&
              void c.db
                ?.rpc("reset_ledger_wallets", { amount: startingBalance })
                .then((r) => {
                  if (r.error) setError(r.error.message);
                  else void load();
                })
            }
          >
            Reset both wallets to {startingBalance}
          </button>
          <p>Promises kept: {rows.filter((x) => x.status === "done").length}</p>
          <div className="plugin-hud">
            {wallets.map((x) => (
              <span key={x.user_id}>
                <Coins size={18} />
                {x.user_id === c.user ? "You" : "Partner"} {x.balance}
              </span>
            ))}
          </div>
          {wallets.some((x) => x.user_id === c.user && x.balance < 3) && (
            <button
              onClick={() =>
                void c.db?.rpc("ledger_topup").then((r) => {
                  if (r.error) setError(r.error.message);
                  else void load();
                })
              }
            >
              Daily top-up
            </button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {list.map((x) => (
        <article key={x.id}>
          <blockquote>{x.note}</blockquote>
          <p>
            {x.promisor === c.user ? "You" : "Partner"} · {x.status} ·{" "}
            {new Date(x.created_at).toLocaleDateString()}
          </p>
          {x.status === "pending" && (
            <div>
              {x.owed_to === c.user ? (
                <button onClick={() => void action(x.id, "done")}>
                  <Check size={18} /> Mark Done
                </button>
              ) : (
                <button onClick={() => void action(x.id, "nudge")}>
                  <Heart size={18} /> I did it!
                </button>
              )}
              <button
                className="secondary"
                onClick={() => void action(x.id, "waive")}
              >
                <Handshake size={18} />
                {x.waiver_by && x.waiver_by !== c.user
                  ? "Agree to waive"
                  : "Let’s renegotiate"}
              </button>
              {x.nudged_at && <p>Ready for a little confirmation.</p>}
            </div>
          )}
        </article>
      ))}
      {!list.length && <p>No promises waiting. Keep it kind and playful.</p>}
    </section>
  );
}
