"use client";
import { useEffect, useState } from "react";
import { Heart, Send } from "lucide-react";
import { useKeepsakes } from "./Keepsakes";
type Comment = { id: string; author: string; body: string; created_at: string };
export default function MemorySocial({ id }: { id: string }) {
  const c = useKeepsakes(),
    [hearts, setHearts] = useState<string[]>([]),
    [comments, setComments] = useState<Comment[]>([]),
    [text, setText] = useState(""),
    [burst, setBurst] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setHearts([]);
    setComments([]);
    setText("");
    setError("");
    if (c.preview || !c.db) return;
    let gone = false;
    async function load() {
      const [r, m] = await Promise.all([
        c
          .db!.from("memory_reactions")
          .select("user_id")
          .eq("memory_id", id)
          .eq("kind", "heart"),
        c
          .db!.from("memory_comments")
          .select("id,author,body,created_at")
          .eq("memory_id", id)
          .order("created_at"),
      ]);
      if (gone) return;
      if (r.error || m.error) {
        setError(
          "Hearts and comments could not load. Try opening the photo again.",
        );
        return;
      }
      setError("");
      setHearts((r.data || []).map((x) => x.user_id));
      setComments(m.data || []);
    }
    void load();
    const channel = c.db
      .channel(`memory-social:${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "memory_reactions",
          filter: `memory_id=eq.${id}`,
        },
        load,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "memory_comments",
          filter: `memory_id=eq.${id}`,
        },
        load,
      )
      .subscribe();
    return () => {
      gone = true;
      void c.db!.removeChannel(channel);
    };
  }, [id, c.db, c.preview, c.user]);
  const mine = hearts.includes(c.user);
  async function react() {
    const saved = await c.run(async () => {
      if (!c.preview) {
        const result = mine
          ? await c
              .db!.from("memory_reactions")
              .delete()
              .eq("memory_id", id)
              .eq("user_id", c.user)
          : await c
              .db!.from("memory_reactions")
              .upsert({ memory_id: id, user_id: c.user, kind: "heart" });
        if (result.error) throw result.error;
      }
    });
    if (saved) {
      setHearts((list) =>
        mine
          ? list.filter((x) => x !== c.user)
          : [...new Set([...list, c.user])],
      );
      if (!mine) {
        setBurst(true);
        setTimeout(() => setBurst(false), 700);
      }
    }
  }
  async function comment() {
    const body = text.trim();
    if (!body) return;
    const row = {
      id: crypto.randomUUID(),
      author: c.user,
      body,
      created_at: new Date().toISOString(),
    };
    const saved = await c.run(async () => {
      if (!c.preview) {
        const r = await c
          .db!.from("memory_comments")
          .insert({ ...row, memory_id: id });
        if (r.error) throw r.error;
      }
    });
    if (saved) {
      setComments((list) => [...list.filter((x) => x.id !== row.id), row]);
      setText("");
    }
  }
  return (
    <section className="memory-social" aria-label="Photo hearts and comments">
      <button
        className={`secondary memory-heart ${burst ? "is-bursting" : ""}`}
        aria-pressed={mine}
        disabled={c.busy}
        onClick={() => void react()}
      >
        <Heart fill={mine ? "currentColor" : "none"} />
        {hearts.length || "Heart"}
        {burst && (
          <span className="memory-heart-burst" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((n) => (
              <Heart key={n} style={{ "--petal": n } as React.CSSProperties} />
            ))}
          </span>
        )}
      </button>
      <ul className="memory-comments">
        {comments.map((m) => (
          <li key={m.id}>
            <strong>{m.author === c.user ? "You" : "Partner"}</strong>
            <p>{m.body}</p>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void comment();
        }}
      >
        <label>
          Leave a little note
          <textarea
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
          />
        </label>
        <button disabled={c.busy || !text.trim()}>
          <Send size={18} />
          Comment
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
