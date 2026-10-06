import { createClient } from "@supabase/supabase-js";
import { isPrivateEmail } from "@/lib/private-auth";
import { POST as deliver } from "../route";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    return Response.json(
      { error: "The connection is not configured." },
      { status: 503 },
    );
  const token = req.headers.get("authorization");
  if (!token?.startsWith("Bearer "))
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const db = createClient(url, key, {
    global: { headers: { Authorization: token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token.slice(7));
  if (error || !data.user)
    return Response.json({ error: "Sign in again." }, { status: 401 });
  if (!isPrivateEmail(data.user.email))
    return Response.json(
      { error: "This account cannot send taps." },
      { status: 403 },
    );
  try {
    const body = await req.text();
    if (body.length > 1024)
      return Response.json(
        { error: "Keep your message within 180 characters." },
        { status: 400 },
      );
    const { content } = JSON.parse(body);
    if (typeof content !== "string" || content.length > 180)
      return Response.json(
        { error: "Keep your message within 180 characters." },
        { status: 400 },
      );
    const saved = await db.rpc("send_thinking_of_you", { content });
    if (saved.error)
      return Response.json({ error: saved.error.message }, { status: 400 });
    const tap = await db
      .from("connection_taps")
      .select("id")
      .eq("sender", data.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (
      tap.error ||
      !process.env.PUSH_WEBHOOK_SECRET ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    )
      return Response.json({ saved: true, delivery: "unavailable", sent: 0 });
    const response = await deliver(
      new Request(new URL("/api/push", req.url), {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.PUSH_WEBHOOK_SECRET}` },
        body: JSON.stringify({
          table: "connection_taps",
          type: "INSERT",
          record: { id: tap.data.id },
        }),
      }),
    );
    const result = await response.json();
    return Response.json({
      saved: true,
      ...result,
      delivery: response.ok && !result.failed ? "processed" : "unavailable",
    });
  } catch {
    return Response.json(
      { error: "Your tap could not send. Try again." },
      { status: 500 },
    );
  }
}
