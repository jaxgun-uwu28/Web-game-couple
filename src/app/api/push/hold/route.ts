import { createClient } from "@supabase/supabase-js";
import { isPrivateEmail } from "@/lib/private-auth";
import { POST as deliver } from "../route";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    token = req.headers.get("authorization");
  if (!url || !key)
    return Response.json(
      { error: "The connection is not configured." },
      { status: 503 },
    );
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
      { error: "This account cannot invite." },
      { status: 403 },
    );
  const r = await db.rpc("invite_hold_hands");
  if (r.error)
    return Response.json({ error: r.error.message }, { status: 400 });
  if (
    !process.env.PUSH_WEBHOOK_SECRET ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  )
    return Response.json({ saved: true, sent: 0 });
  const result = await deliver(
    new Request(new URL("/api/push", req.url), {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.PUSH_WEBHOOK_SECRET}` },
      body: JSON.stringify({
        table: "notifications_log",
        type: "INSERT",
        record: { id: r.data },
      }),
    }),
  );
  return Response.json({ saved: true, ...(await result.json()) });
}
