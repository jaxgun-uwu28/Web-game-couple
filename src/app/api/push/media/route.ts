import { createClient } from "@supabase/supabase-js";
import { isPrivateEmail } from "@/lib/private-auth";
import { POST as deliver } from "../route";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const token = req.headers.get("authorization"),
    url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token?.startsWith("Bearer "))
    return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!url || !key)
    return Response.json({ error: "Connection unavailable." }, { status: 503 });
  const db = createClient(url, key, {
      global: { headers: { Authorization: token } },
      auth: { persistSession: false },
    }),
    { data, error } = await db.auth.getUser(token.slice(7));
  if (error || !data.user || !isPrivateEmail(data.user.email))
    return Response.json({ error: "Sign in again." }, { status: 401 });
  try {
    const text = await req.text();
    if (text.length > 1024) throw new Error("Invalid request");
    const b = JSON.parse(text),
      table =
        b.kind === "voice"
          ? "voice_messages"
          : b.kind === "postcard"
            ? "postcards"
            : b.kind === "challenge"
              ? "arcade_matches"
              : "";
    if (!table || typeof b.id !== "string") throw new Error("Invalid request");
    const r = await db
      .from(table)
      .select(table === "arcade_matches" ? "host" : "sender_id")
      .eq("id", b.id)
      .single();
    if (
      r.error ||
      (r.data as unknown as { sender_id?: string; host?: string })[
        table === "arcade_matches" ? "host" : "sender_id"
      ] !== data.user.id
    )
      return Response.json({ error: "Message unavailable." }, { status: 403 });
    if (
      !process.env.PUSH_WEBHOOK_SECRET ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    )
      return Response.json({ saved: true, sent: 0 });
    return deliver(
      new Request(new URL("/api/push", req.url), {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.PUSH_WEBHOOK_SECRET}` },
        body: JSON.stringify({ table, type: "INSERT", record: { id: b.id } }),
      }),
    );
  } catch {
    return Response.json(
      { error: "Invalid message request." },
      { status: 400 },
    );
  }
}
